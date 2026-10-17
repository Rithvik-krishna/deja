"""WriteMixin for Neo4jEngine.

Implements all write and incident/ownership operations required by the Engine interface:
- owner(service, on=None) -> OwnerResponse
- reassign(req) -> ReassignResponse (temporal ownership supersede)
- record_outcome(req) -> OutcomeResponse (atomic Attempt node creation & incident status update)
- list_incidents(status=None, limit=50) -> list[IncidentSummary]
- incident(incident_id) -> IncidentDetail
- timeline(incident_id) -> list[TimelineEvent]

All queries use parameterized Cypher with atomic write transactions via self._write_tx.
"""
from datetime import date, timedelta
from typing import Any, Optional

from .clock import iso, now
from .engine import (
    BadRequest,
    NotFound,
    dep_id,
    fix_id,
    inc_id,
    svc_id,
)
from .graphutil import G, to_iso
from .schemas import (
    AttemptSummary,
    DeploySummary,
    IncidentDetail,
    IncidentSummary,
    OutcomeRequest,
    OutcomeResponse,
    OwnerResponse,
    OwnershipRecord,
    ReassignRequest,
    ReassignResponse,
    TimelineEvent,
)


class WriteMixin:
    """Provides incident, timeline, outcome recording, and temporal ownership methods for Neo4jEngine."""

    # ------------------------------------------------------------------ Engineer resolution
    def _resolve_engineer(self, ref: str) -> tuple[str, str]:
        """Resolves an engineer reference (id or name or fuzzy match) to (id, display_name)."""
        r = ref.strip().lower()
        rows = self._run("MATCH (e:Engineer) RETURN e.id AS id, e.name AS name, e.team AS team")
        # 1. Exact ID match
        for row in rows:
            if row["id"].lower() == r:
                return row["id"], row["name"]
        # 2. Exact display name match
        name_matches = [row for row in rows if row["name"].lower() == r]
        if len(name_matches) == 1:
            return name_matches[0]["id"], name_matches[0]["name"]
        # 3. Prefix or word match
        fuzzy = [
            row for row in rows
            if row["name"].lower().startswith(r) or r in row["name"].lower().split()
        ]
        if len(fuzzy) == 1:
            return fuzzy[0]["id"], fuzzy[0]["name"]
        raise NotFound(f"unknown engineer '{ref}'")

    def _eng_name(self, ref: str) -> str:
        """Returns the display name of an engineer, falling back to ref."""
        try:
            _, name = self._resolve_engineer(ref)
            return name
        except NotFound:
            return ref

    # ------------------------------------------------------------------ Ownership (temporal)
    def _history(self, service: str) -> list[OwnershipRecord]:
        """Returns full chronological ownership history for a service."""
        cypher = """
        MATCH (e:Engineer)-[o:OWNS]->(s:Service {name: $service})
        RETURN e.name AS engineer, toString(o.valid_from) AS valid_from, toString(o.valid_to) AS valid_to
        ORDER BY o.valid_from ASC
        """
        rows = self._run(cypher, service=service)
        return [
            OwnershipRecord(
                engineer=r["engineer"],
                valid_from=r["valid_from"],
                valid_to=r["valid_to"],
            )
            for r in rows
        ]

    def owner(self, service: str, on: Optional[date] = None) -> OwnerResponse:
        """Point-in-time ownership query with full chronological history."""
        self._need_service(service)
        on_date = on or now().date()
        on_str = on_date.isoformat()

        cypher = """
        MATCH (e:Engineer)-[o:OWNS]->(s:Service {name: $service})
        WHERE o.valid_from <= date($on) AND (o.valid_to IS NULL OR date($on) <= o.valid_to)
        RETURN e.name AS owner, toString(o.valid_from) AS valid_from, toString(o.valid_to) AS valid_to
        ORDER BY o.valid_from DESC
        LIMIT 1
        """
        rows = self._run(cypher, service=service, on=on_str)
        rec = rows[0] if rows else None
        history = self._history(service)

        return OwnerResponse(
            service=service,
            date=on_str,
            owner=rec["owner"] if rec else None,
            valid_from=rec["valid_from"] if rec else None,
            valid_to=rec["valid_to"] if rec else None,
            history=history,
        )

    def reassign(self, req: ReassignRequest) -> ReassignResponse:
        """Supersedes current ownership in a single atomic transaction."""
        self._need_service(req.service)
        eng_id, eng_name = self._resolve_engineer(req.engineer)
        eff = req.effective_date or now().date()
        eff_str = eff.isoformat()

        # Check current active ownership (valid_to IS NULL)
        find_open = """
        MATCH (e:Engineer)-[o:OWNS]->(s:Service {name: $service})
        WHERE o.valid_to IS NULL
        RETURN e.id AS engineer_id, e.name AS engineer_name, toString(o.valid_from) AS valid_from
        ORDER BY o.valid_from DESC
        LIMIT 1
        """
        open_rows = self._run(find_open, service=req.service)
        open_rec = open_rows[0] if open_rows else None
        superseded: Optional[OwnershipRecord] = None

        if open_rec:
            if open_rec["engineer_id"] == eng_id:
                raise BadRequest(f"{eng_name} already owns {req.service}")
            if open_rec["valid_from"] >= eff_str:
                raise BadRequest("effective_date must be after the current ownership started")
            prev_to = (eff - timedelta(days=1)).isoformat()
            superseded = OwnershipRecord(
                engineer=open_rec["engineer_name"],
                valid_from=open_rec["valid_from"],
                valid_to=prev_to,
            )
        else:
            prev_to = None

        # Atomic single-transaction write
        def _do_reassign(tx):
            if open_rec:
                tx.run("""
                    MATCH (s:Service {name: $service})
                    MATCH (:Engineer)-[cur:OWNS]->(s)
                    WHERE cur.valid_to IS NULL
                    SET cur.valid_to = date($prev_to)
                    WITH s
                    MATCH (new_e:Engineer {id: $eng_id})
                    CREATE (new_e)-[:OWNS {valid_from: date($eff)}]->(s)
                """, service=req.service, prev_to=prev_to, eng_id=eng_id, eff=eff_str)
            else:
                tx.run("""
                    MATCH (s:Service {name: $service}), (new_e:Engineer {id: $eng_id})
                    CREATE (new_e)-[:OWNS {valid_from: date($eff)}]->(s)
                """, service=req.service, eng_id=eng_id, eff=eff_str)

        self._write_tx(_do_reassign)
        cur = self.owner(req.service, eff)
        return ReassignResponse(**cur.model_dump(), superseded=superseded)

    # ------------------------------------------------------------------ Incident recording & outcomes
    def record_outcome(self, req: OutcomeRequest) -> OutcomeResponse:
        """Records an attempt on an incident, updating status on SUCCESS in an atomic transaction."""
        # 1. Verify incident exists and retrieve origin & symptom
        inc_query = """
        MATCH (i:Incident {id: $id})-[:ORIGINATED_IN]->(orig:Service)
        OPTIONAL MATCH (i)-[r_imp:IMPACTED]->(imp:Service)
        WITH i, orig, imp, r_imp ORDER BY elementId(r_imp)
        WITH i, orig, [x IN collect(DISTINCT imp.name) WHERE x IS NOT NULL] AS impacted
        RETURN i.id AS id, i.symptom AS symptom, orig.name AS origin, impacted, i.status AS status
        """
        inc_rows = self._run(inc_query, id=req.incident_id)
        if not inc_rows:
            raise NotFound(f"unknown incident '{req.incident_id}'")
        inc_row = inc_rows[0]
        origin = inc_row["origin"]
        symptom = inc_row["symptom"]

        # 2. Verify fix exists
        fix_rows = self._run("MATCH (f:Fix {id: $fix}) RETURN f.id AS id", fix=req.fix)
        if not fix_rows:
            raise NotFound(f"unknown fix '{req.fix}'")

        t = now()
        t_iso = iso(t)
        t_date = t.date().isoformat()

        # 3. Resolve engineer: explicit or owner of origin as of t.date(), or first engineer
        if req.engineer:
            eng_id, eng_name = self._resolve_engineer(req.engineer)
        else:
            owner_query = """
            MATCH (e:Engineer)-[o:OWNS]->(s:Service {name: $origin})
            WHERE o.valid_from <= date($t_date) AND (o.valid_to IS NULL OR date($t_date) <= o.valid_to)
            RETURN e.id AS id, e.name AS name
            ORDER BY o.valid_from DESC
            LIMIT 1
            """
            owner_rows = self._run(owner_query, origin=origin, t_date=t_date)
            if owner_rows:
                eng_id, eng_name = owner_rows[0]["id"], owner_rows[0]["name"]
            else:
                first_eng = self._run("MATCH (e:Engineer) RETURN e.id AS id, e.name AS name ORDER BY e.id ASC LIMIT 1")
                eng_id, eng_name = first_eng[0]["id"], first_eng[0]["name"]

        # 4. Atomic transaction creating Attempt node and updating Incident on SUCCESS
        def _do_record(tx):
            res = tx.run("""
                MATCH (a:Attempt)
                WHERE a.id STARTS WITH 'ATT-'
                RETURN max(toInteger(substring(a.id, 4))) AS max_num
            """).single()
            max_num = res["max_num"] if res and res["max_num"] is not None else 0
            new_id = f"ATT-{max_num + 1:03d}"

            tx.run("""
                MATCH (i:Incident {id: $incident_id})
                MATCH (f:Fix {id: $fix})
                MATCH (e:Engineer {id: $eng_id})
                CREATE (a:Attempt {
                    id: $id,
                    status: $status,
                    ts: datetime($t_iso),
                    notes: $notes
                })
                CREATE (i)-[:HAD_ATTEMPT]->(a)
                CREATE (a)-[:USED]->(f)
                CREATE (a)-[:BY]->(e)
            """, incident_id=req.incident_id, fix=req.fix, eng_id=eng_id,
               id=new_id, status=req.status, t_iso=t_iso, notes=req.notes)

            if req.status == "SUCCESS":
                summary = f"Root cause in {origin} ({symptom}). Resolved via {req.fix}."
                tx.run("""
                    MATCH (i:Incident {id: $incident_id})
                    SET i.status = 'resolved',
                        i.resolved_at = datetime($t_iso),
                        i.summary = $summary
                """, incident_id=req.incident_id, t_iso=t_iso, summary=summary)

            return new_id

        att_id = self._write_tx(_do_record)

        attempt_summary = AttemptSummary(
            id=att_id,
            fix=req.fix,
            status=req.status,
            ts=t_iso,
            engineer=eng_name,
            notes=req.notes,
        )

        # 5. Build full response with recommendations, fix stats, and incident graph
        attempts_query = """
        MATCH (i:Incident {id: $id})-[:HAD_ATTEMPT]->(a:Attempt)-[:USED]->(f:Fix)
        RETURN f.id AS fix, a.status AS status
        """
        all_attempts = self._run(attempts_query, id=req.incident_id)
        inc_stub = {"attempts": [{"fix": a["fix"], "status": a["status"]} for a in all_attempts]}

        recommendations = self._recommend(origin, symptom, inc_stub)
        fix_stats = self.fix_stats(origin, symptom)

        # Fetch updated incident summary
        updated_inc_rows = self._run("""
            MATCH (i:Incident {id: $id})-[:ORIGINATED_IN]->(orig:Service)
            OPTIONAL MATCH (i)-[r_imp:IMPACTED]->(imp:Service)
            WITH i, orig, imp, r_imp ORDER BY elementId(r_imp)
            WITH i, orig, [x IN collect(DISTINCT imp.name) WHERE x IS NOT NULL] AS impacted
            RETURN i.id AS id, i.title AS title, i.severity AS severity, i.symptom AS symptom,
                   i.status AS status, toString(i.started_at) AS started_at, orig.name AS origin, impacted
        """, id=req.incident_id)
        ur = updated_inc_rows[0]
        inc_summary = IncidentSummary(
            id=ur["id"],
            title=ur["title"],
            severity=ur["severity"],
            symptom=ur["symptom"],
            status=ur["status"],
            started_at=to_iso(ur["started_at"]),
            origin=ur["origin"],
            impacted=ur["impacted"],
        )

        g = G()
        self._incident_graph_from_db(g, req.incident_id, highlight=True)

        return OutcomeResponse(
            attempt=attempt_summary,
            incident=inc_summary,
            recommendations=recommendations,
            fix_stats=fix_stats,
            graph=g.payload(),
        )

    # ------------------------------------------------------------------ Incidents queries
    def list_incidents(self, status: Optional[str] = None, limit: int = 50) -> list[IncidentSummary]:
        """Lists incidents optionally filtered by status, ordered newest first."""
        cypher = """
        MATCH (i:Incident)-[:ORIGINATED_IN]->(orig:Service)
        WHERE ($status IS NULL OR i.status = $status)
        OPTIONAL MATCH (i)-[r_imp:IMPACTED]->(imp:Service)
        WITH i, orig, imp, r_imp ORDER BY elementId(r_imp)
        WITH i, orig, [x IN collect(DISTINCT imp.name) WHERE x IS NOT NULL] AS impacted
        RETURN i.id AS id, i.title AS title, i.severity AS severity, i.symptom AS symptom,
               i.status AS status, toString(i.started_at) AS started_at, orig.name AS origin, impacted
        ORDER BY i.started_at DESC
        LIMIT $limit
        """
        rows = self._run(cypher, status=status, limit=limit)
        return [
            IncidentSummary(
                id=r["id"],
                title=r["title"],
                severity=r["severity"],
                symptom=r["symptom"],
                status=r["status"],
                started_at=to_iso(r["started_at"]),
                origin=r["origin"],
                impacted=r["impacted"],
            )
            for r in rows
        ]

    def incident(self, incident_id: str) -> IncidentDetail:
        """Retrieves complete incident detail including followed deploy, attempts, and graph."""
        cypher = """
        MATCH (i:Incident {id: $id})-[:ORIGINATED_IN]->(orig:Service)
        OPTIONAL MATCH (i)-[r_imp:IMPACTED]->(imp:Service)
        WITH i, orig, imp, r_imp ORDER BY elementId(r_imp)
        WITH i, orig, [x IN collect(DISTINCT imp.name) WHERE x IS NOT NULL] AS impacted
        OPTIONAL MATCH (i)-[:FOLLOWED]->(d:Deploy)-[:TO]->(ds:Service)
        OPTIONAL MATCH (d)-[:AUTHORED_BY]->(de:Engineer)
        OPTIONAL MATCH (i)-[:HAD_ATTEMPT]->(a:Attempt)-[:USED]->(f:Fix)
        OPTIONAL MATCH (a)-[:BY]->(ae:Engineer)
        WITH i, orig, impacted,
             d, ds, de,
             a, f, ae
        ORDER BY a.ts ASC, a.id ASC
        WITH i, orig, impacted, d, ds, de,
             collect(CASE WHEN a IS NOT NULL THEN {
                 id: a.id,
                 fix: f.id,
                 status: a.status,
                 ts: a.ts,
                 engineer: ae.name,
                 notes: coalesce(a.notes, '')
             } ELSE null END) AS raw_attempts
        RETURN i.id AS id, i.title AS title, i.severity AS severity, i.symptom AS symptom,
               i.status AS status, toString(i.started_at) AS started_at, toString(i.resolved_at) AS resolved_at,
               coalesce(i.summary, '') AS summary,
               orig.name AS origin, impacted,
               d.id AS deploy_id, ds.name AS deploy_svc, d.version AS deploy_ver,
               d.deployed_at AS deploy_ts, de.name AS deploy_author,
               [att IN raw_attempts WHERE att IS NOT NULL] AS attempts
        """
        rows = self._run(cypher, id=incident_id)
        if not rows:
            raise NotFound(f"unknown incident '{incident_id}'")

        r = rows[0]
        followed_deploy = (
            DeploySummary(
                id=r["deploy_id"],
                service=r["deploy_svc"],
                version=r["deploy_ver"],
                deployed_at=to_iso(r["deploy_ts"]),
                author=r["deploy_author"],
            )
            if r.get("deploy_id")
            else None
        )

        attempts = [
            AttemptSummary(
                id=a["id"],
                fix=a["fix"],
                status=a["status"],
                ts=to_iso(a["ts"]),
                engineer=a["engineer"],
                notes=a.get("notes", ""),
            )
            for a in r["attempts"]
        ]

        g = G()
        self._incident_graph_from_db(g, incident_id, highlight=True)

        return IncidentDetail(
            id=r["id"],
            title=r["title"],
            severity=r["severity"],
            symptom=r["symptom"],
            status=r["status"],
            started_at=to_iso(r["started_at"]),
            origin=r["origin"],
            impacted=r["impacted"],
            resolved_at=to_iso(r["resolved_at"]),
            summary=r["summary"],
            followed_deploy=followed_deploy,
            attempts=attempts,
            graph=g.payload(),
        )

    def timeline(self, incident_id: str) -> list[TimelineEvent]:
        """Assembles chronological timeline of incident events."""
        cypher = """
        MATCH (i:Incident {id: $id})-[:ORIGINATED_IN]->(orig:Service)
        OPTIONAL MATCH (i)-[:FOLLOWED]->(d:Deploy)-[:TO]->(ds:Service)
        OPTIONAL MATCH (d)-[:AUTHORED_BY]->(de:Engineer)
        OPTIONAL MATCH (i)-[:HAD_ATTEMPT]->(a:Attempt)-[:USED]->(f:Fix)
        OPTIONAL MATCH (a)-[:BY]->(ae:Engineer)
        RETURN i.id AS id, i.title AS title, toString(i.started_at) AS started_at, toString(i.resolved_at) AS resolved_at,
               d.id AS deploy_id, ds.name AS deploy_svc, d.version AS deploy_ver,
               toString(d.deployed_at) AS deploy_ts, de.name AS deploy_author,
               a.id AS att_id, toString(a.ts) AS att_ts, a.status AS att_status, f.id AS fix_id, ae.name AS eng_name
        ORDER BY a.ts ASC, a.id ASC
        """
        rows = self._run(cypher, id=incident_id)
        if not rows:
            raise NotFound(f"unknown incident '{incident_id}'")

        first = rows[0]
        ev: list[TimelineEvent] = []

        if first.get("deploy_id"):
            ev.append(
                TimelineEvent(
                    ts=to_iso(first["deploy_ts"]),
                    type="deploy",
                    text=f"Deploy {first['deploy_svc']} {first['deploy_ver']} by {first['deploy_author']}",
                    node_ids=[dep_id(first["deploy_id"]), svc_id(first["deploy_svc"])],
                )
            )

        ev.append(
            TimelineEvent(
                ts=to_iso(first["started_at"]),
                type="incident_opened",
                text=f"Incident opened: {first['title']}",
                node_ids=[inc_id(first["id"])],
            )
        )

        seen_attempts = set()
        for row in rows:
            if row.get("att_id") and row["att_id"] not in seen_attempts:
                seen_attempts.add(row["att_id"])
                ev.append(
                    TimelineEvent(
                        ts=to_iso(row["att_ts"]),
                        type="attempt",
                        text=f"{row['eng_name']} tried {row['fix_id']} -> {row['att_status']}",
                        node_ids=[fix_id(row["fix_id"]), inc_id(first["id"])],
                    )
                )

        if first.get("resolved_at"):
            ev.append(
                TimelineEvent(
                    ts=to_iso(first["resolved_at"]),
                    type="resolved",
                    text="Incident resolved",
                    node_ids=[inc_id(first["id"])],
                )
            )

        return sorted(ev, key=lambda e: e.ts)
