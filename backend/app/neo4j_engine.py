"""LIVE engine (Neo4j). Implements the Engine contract against Neo4j,
matching MockEngine exact models, scoring formulas, and deterministic ordering.
"""
from collections import deque
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional

from . import config
from .clock import iso, now, parse_dt
from .engine import (
    SYMPTOM_PHRASE,
    BadRequest,
    Engine,
    NotFound,
    dep_id,
    edge_id,
    eng_id,
    fix_id,
    inc_id,
    svc_id,
)
from .graphutil import G, to_iso
from .schemas import (
    AlertRequest,
    AlertResponse,
    AttemptSummary,
    BlastItem,
    BlastResponse,
    Catalog,
    CatalogEngineer,
    CatalogFix,
    CatalogService,
    DemoResetResponse,
    DeploySummary,
    FixStat,
    Health,
    IncidentDetail,
    IncidentSummary,
    OutcomeRequest,
    OutcomeResponse,
    OwnerResponse,
    ReassignRequest,
    ReassignResponse,
    Recommendation,
    RiskItem,
    RiskResponse,
    SimilarIncident,
    Suspect,
    TimelineEvent,
    SYMPTOMS,
)

# ------------------------------------------------------------------
# Abhi's WriteMixin integration: import real mixin if available,
# otherwise provide fallback stub exposing the 6 agreed write methods.
# ------------------------------------------------------------------
def _todo(name: str):
    raise NotImplementedError(f"Neo4jEngine.{name} - owned by Abhi (WriteMixin)")

try:
    from .neo4j_engine_writes import WriteMixin
except ModuleNotFoundError as _err:
    if _err.name not in (
        "app.neo4j_engine_writes",
        "neo4j_engine_writes",
        f"{__package__}.neo4j_engine_writes" if __package__ else "",
    ):
        raise

    class WriteMixin:
        """Compatibility fallback stub until Abhi's WriteMixin is merged."""
        def owner(self, service: str, on: Optional[date] = None) -> OwnerResponse:
            _todo("owner")

        def reassign(self, req: ReassignRequest) -> ReassignResponse:
            _todo("reassign")

        def record_outcome(self, req: OutcomeRequest) -> OutcomeResponse:
            _todo("record_outcome")

        def list_incidents(self, status: Optional[str] = None, limit: int = 50) -> list[IncidentSummary]:
            _todo("list_incidents")

        def incident(self, incident_id: str) -> IncidentDetail:
            _todo("incident")

        def timeline(self, incident_id: str) -> list[TimelineEvent]:
            _todo("timeline")


def _neg(s: str) -> str:
    """Sort helper: newer ISO timestamps first when used in an ascending sort."""
    return "".join(chr(0x10FFFF - ord(c)) for c in s)


class Neo4jEngine(WriteMixin, Engine):
    def __init__(self):
        from neo4j import GraphDatabase
        if not config.NEO4J_URI:
            raise RuntimeError("NEO4J_URI not set (copy .env.example to .env)")
        self.driver = GraphDatabase.driver(
            config.NEO4J_URI,
            auth=(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
            max_connection_lifetime=30 * 60,
            liveness_check_timeout=1,
        )
        self.db = config.NEO4J_DATABASE

    def _run(self, cypher: str, **params: Any) -> list[dict[str, Any]]:
        with self.driver.session(database=self.db) as s:
            return [r.data() for r in s.run(cypher, **params)]

    def _write_tx(self, work):
        with self.driver.session(database=self.db) as s:
            return s.execute_write(work)

    # ------------------------------------------------------------------ health & reset
    def health(self) -> Health:
        try:
            self._run("RETURN 1 AS ok")
            return Health(status="ok", mode="live", neo4j=True)
        except Exception:
            return Health(status="degraded", mode="live", neo4j=False)

    def reset(self) -> DemoResetResponse:
        from scripts.load_seed import load
        return DemoResetResponse(ok=True, counts=load(self.driver, wipe=True, database=self.db))

    # ------------------------------------------------------------------ helpers
    def _need_service(self, name: str) -> dict[str, Any]:
        rows = self._run(
            "MATCH (s:Service {name: $name}) RETURN s.name AS name, s.tier AS tier, s.team AS team, s.description AS description",
            name=name,
        )
        if not rows:
            raise NotFound(f"unknown service '{name}'")
        return rows[0]

    def _svc_node(self, g: G, name: str, highlight: bool = False, score: Optional[float] = None):
        s = self._need_service(name)
        g.node(svc_id(name), "Service", name, highlight=highlight, score=score, tier=s["tier"], team=s["team"])

    def _deploy_nodes(self, g: G, d: dict[str, Any], highlight: bool = False):
        g.node(
            dep_id(d["id"]),
            "Deploy",
            f"{d['service']} {d['version']}",
            highlight=highlight,
            version=d["version"],
            deployed_at=to_iso(d["deployed_at"]),
        )
        self._svc_node(g, d["service"])
        g.edge(dep_id(d["id"]), svc_id(d["service"]), "TO", highlight=highlight)
        author_id = d.get("author_id") or d.get("author")
        author_name = d.get("author_name") or d.get("author")
        author_team = d.get("author_team", "")
        g.node(eng_id(author_id), "Engineer", author_name, highlight=False, team=author_team)
        g.edge(dep_id(d["id"]), eng_id(author_id), "AUTHORED_BY", highlight=highlight)

    def _path(self, src: str, dst: str) -> list[str]:
        """Shortest DEPENDS_ON path src -> dst (list of service names) or []."""
        if src == dst:
            return [src]
        query = """
        MATCH (a:Service {name: $src}), (b:Service {name: $dst})
        MATCH p = shortestPath((a)-[:DEPENDS_ON*1..10]->(b))
        RETURN [n IN nodes(p) | n.name] AS path
        """
        rows = self._run(query, src=src, dst=dst)
        return rows[0]["path"] if rows and rows[0]["path"] else []

    def _incident_graph_from_db(
        self,
        g: G,
        incident_id: str,
        highlight: bool = False,
        only_services: Optional[set[str]] = None,
    ):
        query = """
        MATCH (i:Incident {id: $id})-[:ORIGINATED_IN]->(orig:Service)
        OPTIONAL MATCH (i)-[:IMPACTED]->(imp:Service)
        OPTIONAL MATCH (i)-[:FOLLOWED]->(d:Deploy)-[:TO]->(ds:Service)
        OPTIONAL MATCH (d)-[:AUTHORED_BY]->(de:Engineer)
        OPTIONAL MATCH (i)-[:HAD_ATTEMPT]->(a:Attempt)-[:USED]->(f:Fix)
        WITH i, orig, collect(DISTINCT imp.name) AS impacted,
             d, ds, de,
             collect(DISTINCT CASE WHEN a IS NOT NULL THEN {fix: f.id, status: a.status} ELSE null END) AS raw_attempts
        RETURN i.id AS id, i.title AS title, i.severity AS severity, i.symptom AS symptom, i.status AS status,
               orig.name AS origin, impacted,
               d.id AS deploy_id, ds.name AS deploy_svc, d.version AS deploy_ver, d.deployed_at AS deployed_at,
               de.id AS author_id, de.name AS author_name, de.team AS author_team,
               [att IN raw_attempts WHERE att IS NOT NULL] AS attempts
        """
        rows = self._run(query, id=incident_id)
        if not rows:
            return
        r = rows[0]
        node = inc_id(r["id"])
        g.node(
            node,
            "Incident",
            r["id"],
            highlight=highlight,
            severity=r["severity"],
            symptom=r["symptom"],
            status=r["status"],
            title=r["title"],
        )
        self._svc_node(g, r["origin"], highlight=highlight)
        g.edge(node, svc_id(r["origin"]), "ORIGINATED_IN", highlight=highlight)

        for s in r["impacted"]:
            if only_services is None or s in only_services:
                self._svc_node(g, s)
                g.edge(node, svc_id(s), "IMPACTED", highlight=highlight)

        if r.get("deploy_id"):
            dep_dict = {
                "id": r["deploy_id"],
                "service": r["deploy_svc"],
                "version": r["deploy_ver"],
                "deployed_at": r["deployed_at"],
                "author_id": r["author_id"],
                "author_name": r["author_name"],
                "author_team": r["author_team"],
            }
            self._deploy_nodes(g, dep_dict, highlight=highlight)
            g.edge(node, dep_id(r["deploy_id"]), "FOLLOWED", highlight=highlight)

        for a in r["attempts"]:
            g.node(fix_id(a["fix"]), "Fix", a["fix"])
            g.edge(node, fix_id(a["fix"]), "ATTEMPTED", highlight=False, status=a["status"])

    # ------------------------------------------------------------------ catalog
    def catalog(self) -> Catalog:
        today = now().date().isoformat()
        svc_query = """
        MATCH (s:Service)
        OPTIONAL MATCH (e:Engineer)-[o:OWNS]->(s)
        WHERE o.valid_from <= date($today) AND (o.valid_to IS NULL OR date($today) <= o.valid_to)
        WITH s, e, o
        ORDER BY s.name, o.valid_from DESC
        WITH s, head(collect(e.name)) AS owner
        RETURN s.name AS name, s.tier AS tier, s.team AS team, owner
        ORDER BY s.name ASC
        """
        svc_rows = self._run(svc_query, today=today)
        services = [
            CatalogService(name=r["name"], tier=r["tier"], team=r["team"], owner=r["owner"])
            for r in svc_rows
        ]

        fix_rows = self._run("MATCH (f:Fix) RETURN f.id AS id, f.name AS name, f.description AS description")
        FIX_ORDER = {
            'restart-pods': 0, 'rollback-deploy': 1, 'scale-up-replicas': 2, 'increase-conn-pool': 3,
            'flush-cache': 4, 'toggle-feature-flag': 5, 'failover-db-replica': 6, 'rotate-credentials': 7,
        }
        fix_rows.sort(key=lambda f: (FIX_ORDER.get(f["id"], 999), f["id"]))
        fixes = [
            CatalogFix(id=f["id"], name=f["name"] or f["id"], description=f["description"] or "")
            for f in fix_rows
        ]

        eng_rows = self._run("MATCH (e:Engineer) RETURN e.id AS id, e.name AS name, e.team AS team")
        ENG_ORDER = {
            'asha-menon': 0, 'dev-patel': 1, 'ravi-iyer': 2, 'kiran-rao': 3, 'meera-nair': 4,
            'sana-khan': 5, 'arjun-reddy': 6, 'lakshmi-pillai': 7, 'vikram-singh': 8, 'tara-bose': 9,
        }
        eng_rows.sort(key=lambda e: (ENG_ORDER.get(e["id"], 999), e["id"]))
        engineers = [
            CatalogEngineer(id=e["id"], name=e["name"], team=e["team"])
            for e in eng_rows
        ]

        return Catalog(services=services, fixes=fixes, engineers=engineers, symptoms=list(SYMPTOMS))

    # ------------------------------------------------------------------ risk
    def risk(
        self,
        window_days: int = 180,
        limit: int = 10,
        as_of: Optional[date] = None,
    ) -> RiskResponse:
        as_of = as_of or now().date()
        since = datetime.combine(as_of, time.min, tzinfo=timezone.utc) - timedelta(days=window_days)
        since_iso = since.strftime("%Y-%m-%dT%H:%M:%SZ")
        as_of_iso = as_of.isoformat()

        count_res = self._run(
            "MATCH (i:Incident) WHERE i.started_at >= datetime($since) RETURN count(DISTINCT i) AS total",
            since=since_iso,
        )
        total_in_window = count_res[0]["total"] if count_res else 0

        risk_query = """
        MATCH (s:Service)
        OPTIONAL MATCH (d:Service)-[:DEPENDS_ON*1..]->(s)
        WITH s, count(DISTINCT d) AS fan_in
        OPTIONAL MATCH (d1:Service)-[:DEPENDS_ON]->(s)
        WITH s, fan_in, count(DISTINCT d1) AS direct
        OPTIONAL MATCH (i:Incident)-[:ORIGINATED_IN]->(s)
        WHERE i.started_at >= datetime($since)
        WITH s, fan_in, direct, count(DISTINCT i) AS inc
        OPTIONAL MATCH (e:Engineer)-[o:OWNS]->(s)
        WHERE o.valid_from <= date($as_of) AND (o.valid_to IS NULL OR date($as_of) <= o.valid_to)
        WITH s, fan_in, direct, inc, e, o
        ORDER BY s.name, o.valid_from DESC
        WITH s, fan_in, direct, inc, head(collect(e.name)) AS owner
        RETURN s.name AS name, s.tier AS tier, s.team AS team, owner,
               direct, fan_in, inc,
               toFloat(fan_in + 3 * inc) AS score
        ORDER BY name ASC
        """
        rows = self._run(risk_query, since=since_iso, as_of=as_of_iso)

        fan_rank = {r["name"]: k for k, r in enumerate(sorted(rows, key=lambda r: (-r["fan_in"], r["name"])), 1)}
        inc_rank = {r["name"]: k for k, r in enumerate(sorted(rows, key=lambda r: (-r["inc"], r["name"])), 1)}
        rows.sort(key=lambda r: (-r["score"], r["name"]))

        items = []
        for k, r in enumerate(rows, 1):
            items.append(RiskItem(
                service=r["name"],
                tier=r["tier"],
                team=r["team"],
                owner=r["owner"],
                direct_dependents=r["direct"],
                transitive_dependents=r["fan_in"],
                incidents_originated=r["inc"],
                risk_score=r["score"],
                rank=k,
                fan_in_rank=fan_rank[r["name"]],
                incident_rank=inc_rank[r["name"]],
                insight=(
                    f"{r['name']} is {r['tier']} but {r['fan_in']} services transitively depend on it and it "
                    f"originated {r['inc']} of the last {total_in_window} incidents ({window_days}d)."
                ),
            ))

        g = G()
        top = {r["name"] for r in rows[:3]}
        for r in rows:
            g.node(
                svc_id(r["name"]),
                "Service",
                r["name"],
                highlight=(r["name"] in top),
                score=r["score"],
                tier=r["tier"],
                team=r["team"],
            )

        first = rows[0]["name"] if rows else ""
        edges = self._run(
            "MATCH (a:Service)-[:DEPENDS_ON]->(b:Service) RETURN a.name AS src, b.name AS dst ORDER BY src, dst"
        )
        for e in edges:
            src, dst = e["src"], e["dst"]
            g.edge(svc_id(src), svc_id(dst), "DEPENDS_ON", highlight=(first in (src, dst)))

        return RiskResponse(
            as_of=as_of_iso,
            window_days=window_days,
            incidents_in_window=total_in_window,
            services=items[:limit],
            graph=g.payload(),
        )

    # ------------------------------------------------------------------ blast
    def blast(self, service: str, depth: int = 3) -> BlastResponse:
        self._need_service(service)
        try:
            val_depth = int(depth)
            if val_depth < 1 or val_depth > 50:
                raise ValueError()
        except (ValueError, TypeError):
            raise BadRequest(f"invalid depth '{depth}'")

        today = now().date().isoformat()
        blast_query = f"""
        MATCH (s:Service {{name: $service}})
        MATCH (d:Service) WHERE d <> s
        MATCH p = shortestPath((d)-[:DEPENDS_ON*1..{val_depth}]->(s))
        WITH d, length(p) AS hops
        OPTIONAL MATCH (e:Engineer)-[o:OWNS]->(d)
        WHERE o.valid_from <= date($today) AND (o.valid_to IS NULL OR date($today) <= o.valid_to)
        WITH d, hops, e, o
        ORDER BY d.name, o.valid_from DESC
        WITH d, hops, head(collect(e.name)) AS owner
        RETURN d.name AS service, d.tier AS tier, d.team AS team, hops, owner
        ORDER BY hops ASC, service ASC
        """
        dep_rows = self._run(blast_query, service=service, today=today)
        impacted = [
            BlastItem(service=r["service"], tier=r["tier"], hops=r["hops"], owner=r["owner"])
            for r in dep_rows
        ]

        lo = (now() - timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ")
        hi = now().strftime("%Y-%m-%dT%H:%M:%SZ")
        deploy_query = """
        MATCH (d:Deploy)-[:TO]->(s:Service {name: $service})
        MATCH (d)-[:AUTHORED_BY]->(e:Engineer)
        WHERE d.deployed_at >= datetime($lo) AND d.deployed_at <= datetime($hi)
        RETURN d.id AS id, s.name AS service, d.version AS version, d.deployed_at AS deployed_at,
               d.notes AS notes, e.id AS author_id, e.name AS author_name, e.team AS author_team
        ORDER BY d.deployed_at DESC
        """
        deploy_rows = self._run(deploy_query, service=service, lo=lo, hi=hi)
        recent_deploys = [
            DeploySummary(
                id=d["id"],
                service=d["service"],
                version=d["version"],
                deployed_at=to_iso(d["deployed_at"]),
                author=d["author_name"],
            )
            for d in deploy_rows
        ]

        g = G()
        svc_info = self._need_service(service)
        g.node(svc_id(service), "Service", service, highlight=True, tier=svc_info["tier"], team=svc_info["team"])
        dep_map = {r["service"]: r for r in dep_rows}
        for n, r in dep_map.items():
            g.node(svc_id(n), "Service", n, highlight=False, score=float(r["hops"]), tier=r["tier"], team=r["team"])

        members = set(dep_map) | {service}
        if members:
            induced_query = """
            MATCH (a:Service)-[:DEPENDS_ON]->(b:Service)
            WHERE a.name IN $members AND b.name IN $members
            RETURN a.name AS src, b.name AS dst
            ORDER BY src, dst
            """
            edges = self._run(induced_query, members=list(members))
            for e in edges:
                g.edge(svc_id(e["src"]), svc_id(e["dst"]), "DEPENDS_ON", highlight=True)

        for d in deploy_rows:
            self._deploy_nodes(g, d, highlight=True)

        return BlastResponse(
            service=service,
            depth=val_depth,
            total=len(impacted),
            impacted=impacted,
            recent_deploys=recent_deploys,
            graph=g.payload(),
        )

    # ------------------------------------------------------------------ fix stats & recommendations
    def fix_stats(
        self,
        service: Optional[str] = None,
        symptom: Optional[str] = None,
    ) -> list[FixStat]:
        stat_query = """
        MATCH (i:Incident)-[:ORIGINATED_IN]->(s:Service)
        WHERE ($service IS NULL OR s.name = $service)
          AND ($symptom IS NULL OR i.symptom = $symptom)
        MATCH (i)-[:HAD_ATTEMPT]->(a:Attempt)-[:USED]->(f:Fix)
        RETURN f.id AS fix,
               count(a) AS attempts,
               sum(CASE WHEN a.status = 'SUCCESS' THEN 1 ELSE 0 END) AS successes
        """
        rows = self._run(stat_query, service=service, symptom=symptom)
        stats = []
        for r in rows:
            a = int(r["attempts"])
            s = int(r["successes"])
            failures = a - s
            rate = round(s / a, 3) if a > 0 else 0.0
            smoothed = round((s + 1) / (a + 2), 3)
            avoid = (a >= 3 and s == 0)
            stats.append(FixStat(
                fix=r["fix"],
                attempts=a,
                successes=s,
                failures=failures,
                success_rate=rate,
                smoothed_score=smoothed,
                avoid=avoid,
            ))
        stats.sort(key=lambda s: (-s.smoothed_score, s.fix))
        return stats

    def _recommend(
        self,
        origin: str,
        symptom: str,
        failed_here: Any = None,
    ) -> list[Recommendation]:
        stats = self.fix_stats(origin, symptom) or self.fix_stats(origin, None) or self.fix_stats(None, symptom)
        if isinstance(failed_here, dict) and "attempts" in failed_here:
            failed_set = {a["fix"] for a in failed_here["attempts"] if a.get("status") == "FAILED"}
        elif hasattr(failed_here, "attempts"):
            failed_set = {a.fix for a in failed_here.attempts if a.status == "FAILED"}
        elif isinstance(failed_here, (set, list, tuple)):
            failed_set = set(failed_here)
        else:
            failed_set = set()

        recs = []
        for s in stats:
            if s.avoid:
                why = f"Failed {s.attempts}/{s.attempts} times on similar {symptom} incidents - avoid"
            else:
                why = f"Worked in {s.successes}/{s.attempts} similar incidents"
            is_failed = s.fix in failed_set
            if is_failed:
                why = "Already failed in this incident. " + why
            recs.append(Recommendation(
                fix=s.fix,
                score=s.smoothed_score,
                attempts=s.attempts,
                successes=s.successes,
                rationale=why,
                avoid=s.avoid,
                already_failed_here=is_failed,
            ))
        recs.sort(key=lambda r: (r.already_failed_here, r.avoid, -r.score, r.fix))
        return recs[:6]

    # ------------------------------------------------------------------ similar incidents (NO HIDDEN CAP)
    def similar_incidents(
        self,
        service: str,
        symptom: Optional[str] = None,
        limit: int = 5,
        origin: Optional[str] = None,
        exclude: Optional[str] = None,
    ) -> list[SimilarIncident]:
        self._need_service(service)
        cypher = """
        MATCH (i:Incident)-[:ORIGINATED_IN]->(orig:Service)
        WHERE ($exclude IS NULL OR i.id <> $exclude)
        OPTIONAL MATCH (i)-[:IMPACTED]->(imp:Service)
        OPTIONAL MATCH (i)-[:HAD_ATTEMPT]->(a:Attempt)-[:USED]->(f:Fix)
        OPTIONAL MATCH (a)-[:BY]->(e:Engineer)
        WITH i, orig, collect(DISTINCT imp.name) AS impacted,
             a, f, e
        ORDER BY i.started_at DESC, a.ts ASC, a.id ASC
        WITH i, orig, impacted,
             collect(CASE WHEN a IS NOT NULL THEN {
                 id: a.id,
                 fix: f.id,
                 status: a.status,
                 ts: a.ts,
                 engineer: e.name,
                 notes: coalesce(a.notes, '')
             } ELSE null END) AS raw_attempts
        RETURN i.id AS id, i.title AS title, i.severity AS severity,
               i.symptom AS symptom, i.status AS status, i.started_at AS started_at,
               orig.name AS origin, impacted,
               [att IN raw_attempts WHERE att IS NOT NULL] AS attempts
        ORDER BY started_at DESC
        """
        rows = self._run(cypher, exclude=exclude)

        out = []
        for r in rows:
            score, why = 0.0, []
            inc_symptom = r["symptom"]
            inc_origin = r["origin"]
            inc_impacted = r["impacted"]

            if symptom and inc_symptom == symptom:
                score += 0.35
                why.append(f"same symptom ({symptom})")
            if inc_origin == service:
                score += 0.45
                why.append(f"originated in {service}")
            elif service in inc_impacted:
                score += 0.30
                why.append(f"{service} was impacted")
            if origin and inc_origin == origin and origin != service:
                score += 0.30
                why.append(f"same origin ({origin})")

            score = round(min(score, 1.0), 2)
            if score >= 0.5:
                started_iso = to_iso(r["started_at"])
                out.append((score, started_iso, r, why))

        # Deterministic sort: score desc, then newer timestamp first
        out.sort(key=lambda t: (-t[0], _neg(t[1])))

        results = []
        for sc, started_iso, r, w in out[:limit]:
            att_summaries = [
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
            inc_summary = IncidentSummary(
                id=r["id"],
                title=r["title"],
                severity=r["severity"],
                symptom=r["symptom"],
                status=r["status"],
                started_at=started_iso,
                origin=r["origin"],
                impacted=r["impacted"],
            )
            results.append(SimilarIncident(
                incident=inc_summary,
                score=sc,
                why=", ".join(w),
                attempts=att_summaries,
            ))
        return results

    # ------------------------------------------------------------------ suspects (READ-ONLY, HISTORICAL)
    def _suspects(self, service: str, symptom: str, t: datetime) -> list[Suspect]:
        self._need_service(service)

        t_lo = (t - timedelta(hours=168)).strftime("%Y-%m-%dT%H:%M:%SZ")
        t_iso = t.strftime("%Y-%m-%dT%H:%M:%SZ")
        t_date = t.date().isoformat()

        # Candidates = service (hops 0) + upstream deps within 3 hops via shortestPath
        cands_query = """
        MATCH (s:Service {name: $service})
        OPTIONAL MATCH p = shortestPath((s)-[:DEPENDS_ON*1..3]->(c:Service))
        WHERE c <> s
        WITH s, c, length(p) AS h
        WHERE c IS NOT NULL
        WITH s, c.name AS cname, min(h) AS hops
        ORDER BY hops ASC, cname ASC
        WITH s, collect({name: cname, hops: hops}) AS deps
        WITH [{name: s.name, hops: 0}] + deps AS candidates
        UNWIND candidates AS cand
        RETURN cand.name AS name, cand.hops AS hops
        ORDER BY hops ASC, name ASC
        """
        cand_rows = self._run(cands_query, service=service)

        out = []
        for row in cand_rows:
            name = row["name"]
            hops = row["hops"]

            # Owner as of t.date()
            owner_query = """
            MATCH (s:Service {name: $name})
            OPTIONAL MATCH (e:Engineer)-[o:OWNS]->(s)
            WHERE o.valid_from <= date($t_date) AND (o.valid_to IS NULL OR date($t_date) <= o.valid_to)
            WITH e, o ORDER BY o.valid_from DESC
            RETURN head(collect(e.name)) AS owner
            """
            owner_res = self._run(owner_query, name=name, t_date=t_date)
            owner = owner_res[0]["owner"] if owner_res else None

            # Recent deploys in window [t - 168h, t]
            deploy_query = """
            MATCH (d:Deploy)-[:TO]->(s:Service {name: $name})
            MATCH (d)-[:AUTHORED_BY]->(e:Engineer)
            WHERE d.deployed_at >= datetime($t_lo) AND d.deployed_at <= datetime($t_iso)
            RETURN d.id AS id, s.name AS service, d.version AS version, d.deployed_at AS deployed_at,
                   e.id AS author_id, e.name AS author_name, e.team AS author_team
            ORDER BY d.deployed_at DESC
            """
            dep_rows = self._run(deploy_query, name=name, t_lo=t_lo, t_iso=t_iso)
            recent_deploys = [
                DeploySummary(
                    id=d["id"],
                    service=d["service"],
                    version=d["version"],
                    deployed_at=to_iso(d["deployed_at"]),
                    author=d["author_name"],
                )
                for d in dep_rows
            ]

            # Same symptom incidents
            same_query = """
            MATCH (i:Incident)-[:ORIGINATED_IN]->(s:Service {name: $name})
            WHERE i.symptom = $symptom
              AND ($name = $service OR EXISTS {
                  MATCH (i)-[:IMPACTED]->(:Service {name: $service})
              })
            RETURN count(DISTINCT i) AS cnt
            """
            same_res = self._run(same_query, name=name, symptom=symptom, service=service)
            same_count = same_res[0]["cnt"] if same_res else 0

            has_recent = 1 if recent_deploys else 0
            score = round(3 * has_recent + same_count + 1 / (hops + 1), 3)

            out.append(Suspect(
                service=name,
                hops=hops,
                score=score,
                recent_deploys=recent_deploys,
                same_symptom_incidents=same_count,
                owner=owner,
            ))

        out.sort(key=lambda s: (-s.score, s.service))
        return out[:5]

    # ------------------------------------------------------------------ alert flow
    def create_alert(self, req: AlertRequest) -> AlertResponse:
        self._need_service(req.service)
        t = now()
        # Compute suspects BEFORE ANY GRAPH WRITES
        suspects = self._suspects(req.service, req.symptom, t)
        top = suspects[0]
        likely_origin = top.service

        title = req.title or f"{req.service} {SYMPTOM_PHRASE[req.symptom]}"
        t_iso = iso(t)
        followed_deploy_id = top.recent_deploys[0].id if top.recent_deploys else None

        # Atomic single-transaction write
        def _do_create(tx):
            res = tx.run("""
                MATCH (i:Incident)
                WHERE i.id STARTS WITH 'INC-'
                RETURN max(toInteger(substring(i.id, 4))) AS max_num
            """).single()
            max_num = res["max_num"] if res and res["max_num"] is not None else 0
            new_id = f"INC-{max_num + 1:03d}"

            tx.run("""
                CREATE (i:Incident {
                    id: $id,
                    title: $title,
                    severity: $severity,
                    symptom: $symptom,
                    status: 'open',
                    summary: '',
                    started_at: datetime($t_iso)
                })
                WITH i
                MATCH (orig:Service {name: $likely_origin})
                CREATE (i)-[:ORIGINATED_IN]->(orig)
            """, id=new_id, title=title, severity=req.severity, symptom=req.symptom, t_iso=t_iso, likely_origin=likely_origin)

            if likely_origin != req.service:
                tx.run("""
                    MATCH (i:Incident {id: $id}), (s:Service {name: $service})
                    CREATE (i)-[:IMPACTED]->(s)
                """, id=new_id, service=req.service)

            if followed_deploy_id:
                tx.run("""
                    MATCH (i:Incident {id: $id}), (d:Deploy {id: $dep_id})
                    CREATE (i)-[:FOLLOWED]->(d)
                """, id=new_id, dep_id=followed_deploy_id)

            return new_id

        new_id = self._write_tx(_do_create)

        similar = self.similar_incidents(
            req.service,
            req.symptom,
            limit=5,
            origin=likely_origin,
            exclude=new_id,
        )
        inc_stub = {"attempts": []}
        recs = self._recommend(likely_origin, req.symptom, inc_stub)

        g = G()
        inc_node_id = inc_id(new_id)
        g.node(
            inc_node_id,
            "Incident",
            new_id,
            highlight=True,
            severity=req.severity,
            symptom=req.symptom,
            status="open",
            title=title,
        )
        self._svc_node(g, likely_origin, highlight=True)
        g.edge(inc_node_id, svc_id(likely_origin), "ORIGINATED_IN", highlight=True)

        if likely_origin != req.service:
            self._svc_node(g, req.service, highlight=True)
            g.edge(inc_node_id, svc_id(req.service), "IMPACTED", highlight=True)
        else:
            self._svc_node(g, req.service, highlight=True)

        if followed_deploy_id:
            dep_rows = self._run("""
                MATCH (d:Deploy {id: $id})-[:TO]->(s:Service)
                MATCH (d)-[:AUTHORED_BY]->(e:Engineer)
                RETURN d.id AS id, s.name AS service, d.version AS version, d.deployed_at AS deployed_at,
                       e.id AS author_id, e.name AS author_name, e.team AS author_team
            """, id=followed_deploy_id)
            if dep_rows:
                self._deploy_nodes(g, dep_rows[0], highlight=True)
                g.edge(inc_node_id, dep_id(followed_deploy_id), "FOLLOWED", highlight=True)

        path = self._path(req.service, likely_origin)
        for a, b in zip(path, path[1:]):
            self._svc_node(g, a, highlight=True)
            self._svc_node(g, b, highlight=True)
            g.edge(svc_id(a), svc_id(b), "DEPENDS_ON", highlight=True)

        for s in suspects[:3]:
            self._svc_node(g, s.service, highlight=(s.service == top.service), score=s.score)

        sim_services = {req.service, likely_origin}
        for s in similar[:3]:
            self._incident_graph_from_db(g, s.incident.id, highlight=False, only_services=sim_services)

        incident_summary = IncidentSummary(
            id=new_id,
            title=title,
            severity=req.severity,
            symptom=req.symptom,
            status="open",
            started_at=t_iso,
            origin=likely_origin,
            impacted=[req.service] if likely_origin != req.service else [],
        )

        return AlertResponse(
            incident=incident_summary,
            likely_origin=likely_origin,
            suspects=suspects,
            similar_incidents=similar,
            recommendations=recs,
            graph=g.payload(),
        )
