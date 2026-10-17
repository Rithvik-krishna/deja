"""In-memory REFERENCE implementation of the Engine contract, driven by data/seed.json.
Two jobs: (1) the frontend builds against it from minute one (MODE=mock), (2) it is the parity oracle for Neo4jEngine.
Scoring formulas here are part of the contract - see docs/API_CONTRACT.md."""
import copy
import json
from collections import deque
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from . import config
from .clock import iso, now, parse_dt
from .engine import (SYMPTOM_PHRASE, BadRequest, Engine, NotFound, dep_id, edge_id, eng_id, fix_id, inc_id, svc_id)
from .schemas import *  # noqa: F401,F403
from .schemas import SYMPTOMS

SUSPECT_WINDOW_HOURS = 168
BLAST_DEPLOY_DAYS = 14


class _G:
    def __init__(self):
        self.nodes, self.edges = {}, {}

    def node(self, id, label, name, highlight=False, score=None, **props):
        n = self.nodes.get(id)
        if n:
            n.highlight = n.highlight or highlight
            if score is not None:
                n.score = score
            n.props.update(props)
            return
        self.nodes[id] = GraphNode(id=id, label=label, name=name, props=props, highlight=highlight, score=score)

    def edge(self, s, t, type, highlight=False, **props):
        eid = edge_id(s, type, t)
        if eid in self.edges:
            self.edges[eid].highlight = self.edges[eid].highlight or highlight
        else:
            self.edges[eid] = GraphEdge(id=eid, source=s, target=t, type=type, props=props, highlight=highlight)

    def payload(self):
        return GraphPayload(nodes=list(self.nodes.values()), edges=list(self.edges.values()))


class MockEngine(Engine):
    def __init__(self, seed_path=None):
        self.seed_path = seed_path or config.SEED_PATH
        self._load()

    # ------------------------------------------------------------------ state
    def _ensure_demo_incident(self):
        if "INC-045" in self.incidents:
            return self.incidents["INC-045"]
        t = now()
        suspects = self._suspects("checkout", "latency", t)
        top = suspects[0]
        inc = dict(id="INC-045", title="checkout latency spiking", severity="SEV2",
                   symptom="latency", status="open", started_at=iso(t), resolved_at=None, summary="",
                   origin=top.service, impacted=["checkout"] if top.service != "checkout" else [],
                   followed_deploy=top.recent_deploys[0].id if top.recent_deploys else None, attempts=[])
        self.incidents["INC-045"] = inc
        return inc

    def _load(self):
        seed = json.loads(open(self.seed_path).read())
        self.seed_counts = {**seed["meta"]["counts"]}
        self.services = {s["name"]: s for s in seed["services"]}
        self.engineers = {e["id"]: e for e in seed["engineers"]}
        self.fixes = {f["id"]: f for f in seed["fixes"]}
        self.deploys = {d["id"]: dict(d) for d in seed["deploys"]}
        self.incidents = {i["id"]: copy.deepcopy(i) for i in seed["incidents"]}
        self.ownership = [dict(o) for o in seed["ownership"]]
        self.fwd = {n: set() for n in self.services}
        self.rev = {n: set() for n in self.services}
        for e in seed["dependencies"]:
            self.fwd[e["from"]].add(e["to"])
            self.rev[e["to"]].add(e["from"])

    def reset(self):
        self._load()
        return DemoResetResponse(ok=True, counts=self.seed_counts)

    def health(self):
        return Health(status="ok", mode="mock", neo4j=False)

    # ------------------------------------------------------------------ helpers
    def _need_service(self, name):
        if name not in self.services:
            raise NotFound(f"unknown service '{name}'")

    def _bfs(self, start, adj, depth):
        seen, q = {start: 0}, deque([start])
        while q:
            cur = q.popleft()
            if seen[cur] >= depth:
                continue
            for nxt in sorted(adj[cur]):
                if nxt not in seen:
                    seen[nxt] = seen[cur] + 1
                    q.append(nxt)
        seen.pop(start)
        return seen

    def _path(self, src, dst):
        """Shortest DEPENDS_ON path src -> dst (list of names) or []."""
        prev, q = {src: None}, deque([src])
        while q:
            cur = q.popleft()
            if cur == dst:
                break
            for nxt in sorted(self.fwd[cur]):
                if nxt not in prev:
                    prev[nxt] = cur
                    q.append(nxt)
        if dst not in prev:
            return []
        out, cur = [], dst
        while cur is not None:
            out.append(cur)
            cur = prev[cur]
        return out[::-1]

    def _eng_name(self, ref):
        if ref in self.engineers:
            return self.engineers[ref]["name"]
        return ref

    def _resolve_engineer(self, ref):
        r = ref.strip().lower()
        if r in self.engineers:
            return r
        hits = [e for e in self.engineers.values() if e["name"].lower() == r]
        hits = hits or [e for e in self.engineers.values() if e["name"].lower().startswith(r) or r in e["name"].lower().split()]
        if len(hits) == 1:
            return hits[0]["id"]
        raise NotFound(f"unknown engineer '{ref}'")

    def _owner_rec(self, service, on):
        ds = on.isoformat()
        recs = [o for o in self.ownership if o["service"] == service and o["valid_from"] <= ds
                and (o["valid_to"] is None or ds <= o["valid_to"])]
        return max(recs, key=lambda o: o["valid_from"]) if recs else None

    def _owner_name(self, service, on=None):
        rec = self._owner_rec(service, on or now().date())
        return self._eng_name(rec["engineer"]) if rec else None

    def _deploy_sum(self, d):
        return DeploySummary(id=d["id"], service=d["service"], version=d["version"],
                             deployed_at=d["deployed_at"], author=self._eng_name(d["author"]))

    def _att_sum(self, a):
        return AttemptSummary(id=a["id"], fix=a["fix"], status=a["status"], ts=a["ts"],
                              engineer=self._eng_name(a["engineer"]), notes=a.get("notes", ""))

    def _inc_sum(self, i):
        return IncidentSummary(id=i["id"], title=i["title"], severity=i["severity"], symptom=i["symptom"],
                               status=i["status"], started_at=i["started_at"], origin=i["origin"], impacted=list(i["impacted"]))

    def _need_incident(self, iid):
        if iid not in self.incidents:
            if iid == "INC-045":
                return self._ensure_demo_incident()
            raise NotFound(f"unknown incident '{iid}'")
        return self.incidents[iid]

    def _recent_deploys(self, service, t, hours):
        lo = t - timedelta(hours=hours)
        ds = [d for d in self.deploys.values() if d["service"] == service and lo <= parse_dt(d["deployed_at"]) <= t]
        return sorted(ds, key=lambda d: d["deployed_at"], reverse=True)

    # graph helpers
    def _svc_node(self, g, name, highlight=False, score=None):
        s = self.services[name]
        g.node(svc_id(name), "Service", name, highlight, score, tier=s["tier"], team=s["team"])

    def _deploy_nodes(self, g, d, highlight=False):
        g.node(dep_id(d["id"]), "Deploy", f"{d['service']} {d['version']}", highlight, version=d["version"], deployed_at=d["deployed_at"])
        self._svc_node(g, d["service"])
        g.edge(dep_id(d["id"]), svc_id(d["service"]), "TO", highlight)
        a = d["author"]
        g.node(eng_id(a), "Engineer", self._eng_name(a), False, team=self.engineers[a]["team"])
        g.edge(dep_id(d["id"]), eng_id(a), "AUTHORED_BY", highlight)

    def _incident_graph(self, g, inc, highlight=False, only_services=None):
        node = inc_id(inc["id"])
        g.node(node, "Incident", inc["id"], highlight, severity=inc["severity"], symptom=inc["symptom"],
               status=inc["status"], title=inc["title"])
        self._svc_node(g, inc["origin"], highlight)
        g.edge(node, svc_id(inc["origin"]), "ORIGINATED_IN", highlight)
        for s in inc["impacted"]:
            if only_services is None or s in only_services:
                self._svc_node(g, s)
                g.edge(node, svc_id(s), "IMPACTED", highlight)
        if inc.get("followed_deploy"):
            self._deploy_nodes(g, self.deploys[inc["followed_deploy"]], highlight)
            g.edge(node, dep_id(inc["followed_deploy"]), "FOLLOWED", highlight)
        for a in inc["attempts"]:
            g.node(fix_id(a["fix"]), "Fix", a["fix"])
            g.edge(node, fix_id(a["fix"]), "ATTEMPTED", False, status=a["status"])

    # ------------------------------------------------------------------ catalog
    def catalog(self):
        return Catalog(
            services=[CatalogService(name=n, tier=s["tier"], team=s["team"], owner=self._owner_name(n))
                      for n, s in sorted(self.services.items())],
            fixes=[CatalogFix(id=f["id"], name=f["id"], description=f["description"]) for f in self.fixes.values()],
            engineers=[CatalogEngineer(**e) for e in self.engineers.values()],
            symptoms=list(SYMPTOMS))

    # ------------------------------------------------------------------ risk
    def risk(self, window_days=180, limit=10, as_of=None):
        as_of = as_of or now().date()
        since = datetime.combine(as_of, time.min, tzinfo=timezone.utc) - timedelta(days=window_days)
        in_win = [i for i in self.incidents.values() if parse_dt(i["started_at"]) >= since]
        rows = []
        for name, s in self.services.items():
            fan = len(self._bfs(name, self.rev, 99))
            inc = sum(1 for i in in_win if i["origin"] == name)
            rows.append(dict(name=name, s=s, fan=fan, inc=inc, direct=len(self.rev[name]), score=float(fan + 3 * inc)))
        fan_rank = {r["name"]: k for k, r in enumerate(sorted(rows, key=lambda r: (-r["fan"], r["name"])), 1)}
        inc_rank = {r["name"]: k for k, r in enumerate(sorted(rows, key=lambda r: (-r["inc"], r["name"])), 1)}
        rows.sort(key=lambda r: (-r["score"], r["name"]))
        items = []
        for k, r in enumerate(rows, 1):
            items.append(RiskItem(
                service=r["name"], tier=r["s"]["tier"], team=r["s"]["team"], owner=self._owner_name(r["name"], as_of),
                direct_dependents=r["direct"], transitive_dependents=r["fan"], incidents_originated=r["inc"],
                risk_score=r["score"], rank=k, fan_in_rank=fan_rank[r["name"]], incident_rank=inc_rank[r["name"]],
                insight=(f"{r['name']} is {r['s']['tier']} but {r['fan']} services transitively depend on it and it "
                         f"originated {r['inc']} of the last {len(in_win)} incidents ({window_days}d).")))
        g = _G()
        top = {r["name"] for r in rows[:3]}
        for r in rows:
            self._svc_node(g, r["name"], r["name"] in top, r["score"])
        first = rows[0]["name"]
        for a, bs in self.fwd.items():
            for b in bs:
                g.edge(svc_id(a), svc_id(b), "DEPENDS_ON", first in (a, b))
        return RiskResponse(as_of=as_of.isoformat(), window_days=window_days, incidents_in_window=len(in_win),
                            services=items[:limit], graph=g.payload())

    # ------------------------------------------------------------------ blast radius
    def blast(self, service, depth=3):
        self._need_service(service)
        dep = self._bfs(service, self.rev, depth)
        impacted = [BlastItem(service=n, tier=self.services[n]["tier"], hops=h, owner=self._owner_name(n))
                    for n, h in sorted(dep.items(), key=lambda kv: (kv[1], kv[0]))]
        g = _G()
        self._svc_node(g, service, True)
        members = set(dep) | {service}
        for n in dep:
            self._svc_node(g, n, False, float(dep[n]))
        for a in members:
            for b in self.fwd[a]:
                if b in members:
                    g.edge(svc_id(a), svc_id(b), "DEPENDS_ON", True)
        recent = self._recent_deploys(service, now(), BLAST_DEPLOY_DAYS * 24)
        for d in recent:
            self._deploy_nodes(g, d, True)
        return BlastResponse(service=service, depth=depth, total=len(impacted), impacted=impacted,
                             recent_deploys=[self._deploy_sum(d) for d in recent], graph=g.payload())

    # ------------------------------------------------------------------ similar incidents / fix stats
    def similar_incidents(self, service, symptom=None, limit=5, origin=None, exclude=None):
        self._need_service(service)
        out = []
        for i in self.incidents.values():
            if i["id"] == exclude:
                continue
            score, why = 0.0, []
            if symptom and i["symptom"] == symptom:
                score += 0.35
                why.append(f"same symptom ({symptom})")
            if i["origin"] == service:
                score += 0.45
                why.append(f"originated in {service}")
            elif service in i["impacted"]:
                score += 0.30
                why.append(f"{service} was impacted")
            if origin and i["origin"] == origin and origin != service:
                score += 0.30
                why.append(f"same origin ({origin})")
            score = round(min(score, 1.0), 2)
            if score >= 0.5:
                out.append((score, i["started_at"], i, why))
        out = sorted(out, key=lambda t: (-t[0], _neg(t[1])))
        return [SimilarIncident(incident=self._inc_sum(i), score=sc, why=", ".join(w),
                                attempts=[self._att_sum(a) for a in i["attempts"]]) for sc, _, i, w in out[:limit]]

    def fix_stats(self, service=None, symptom=None):
        tally = {}
        for i in self.incidents.values():
            if service and i["origin"] != service:
                continue
            if symptom and i["symptom"] != symptom:
                continue
            for a in i["attempts"]:
                t = tally.setdefault(a["fix"], [0, 0])
                t[0] += 1
                t[1] += 1 if a["status"] == "SUCCESS" else 0
        stats = [FixStat(fix=f, attempts=a, successes=s, failures=a - s, success_rate=round(s / a, 3),
                         smoothed_score=round((s + 1) / (a + 2), 3), avoid=(a >= 3 and s == 0))
                 for f, (a, s) in tally.items()]
        return sorted(stats, key=lambda s: (-s.smoothed_score, s.fix))

    def _recommend(self, origin, symptom, inc=None):
        stats = self.fix_stats(origin, symptom) or self.fix_stats(origin, None) or self.fix_stats(None, symptom)
        failed_here = {a["fix"] for a in inc["attempts"] if a["status"] == "FAILED"} if inc else set()
        recs = []
        for s in stats:
            if s.avoid:
                why = f"Failed {s.attempts}/{s.attempts} times on similar {symptom} incidents - avoid"
            else:
                why = f"Worked in {s.successes}/{s.attempts} similar incidents"
            if s.fix in failed_here:
                why = "Already failed in this incident. " + why
            recs.append(Recommendation(fix=s.fix, score=s.smoothed_score, attempts=s.attempts, successes=s.successes,
                                       rationale=why, avoid=s.avoid, already_failed_here=s.fix in failed_here))
        recs.sort(key=lambda r: (r.already_failed_here, r.avoid, -r.score, r.fix))
        return recs[:6]

    # ------------------------------------------------------------------ ownership (temporal)
    def _history(self, service):
        recs = sorted((o for o in self.ownership if o["service"] == service), key=lambda o: o["valid_from"])
        return [OwnershipRecord(engineer=self._eng_name(o["engineer"]), valid_from=o["valid_from"], valid_to=o["valid_to"]) for o in recs]

    def owner(self, service, on=None):
        self._need_service(service)
        on = on or now().date()
        rec = self._owner_rec(service, on)
        return OwnerResponse(service=service, date=on.isoformat(), owner=self._eng_name(rec["engineer"]) if rec else None,
                             valid_from=rec["valid_from"] if rec else None, valid_to=rec["valid_to"] if rec else None,
                             history=self._history(service))

    def reassign(self, req):
        self._need_service(req.service)
        eng = self._resolve_engineer(req.engineer)
        eff = req.effective_date or now().date()
        open_rec = next((o for o in self.ownership if o["service"] == req.service and o["valid_to"] is None), None)
        superseded = None
        if open_rec:
            if open_rec["engineer"] == eng:
                raise BadRequest(f"{self._eng_name(eng)} already owns {req.service}")
            if open_rec["valid_from"] >= eff.isoformat():
                raise BadRequest("effective_date must be after the current ownership started")
            open_rec["valid_to"] = (eff - timedelta(days=1)).isoformat()
            superseded = OwnershipRecord(engineer=self._eng_name(open_rec["engineer"]),
                                         valid_from=open_rec["valid_from"], valid_to=open_rec["valid_to"])
        self.ownership.append(dict(service=req.service, engineer=eng, valid_from=eff.isoformat(), valid_to=None))
        cur = self.owner(req.service, eff)
        return ReassignResponse(**cur.model_dump(), superseded=superseded)

    # ------------------------------------------------------------------ alert flow
    def _suspects(self, service, symptom, t):
        cands = {service: 0, **self._bfs(service, self.fwd, 3)}
        out = []
        for name, hops in cands.items():
            recent = self._recent_deploys(name, t, SUSPECT_WINDOW_HOURS)
            same = sum(1 for i in self.incidents.values() if i["origin"] == name and i["symptom"] == symptom
                       and (name == service or service in i["impacted"]))
            score = round(3 * (1 if recent else 0) + same + 1 / (hops + 1), 3)
            out.append(Suspect(service=name, hops=hops, score=score, recent_deploys=[self._deploy_sum(d) for d in recent],
                               same_symptom_incidents=same, owner=self._owner_name(name)))
        out.sort(key=lambda s: (-s.score, s.service))
        return out[:5]

    def _next_incident_id(self):
        return f"INC-{max(int(k.split('-')[1]) for k in self.incidents) + 1:03d}"

    def create_alert(self, req):
        self._need_service(req.service)
        t = now()
        suspects = self._suspects(req.service, req.symptom, t)
        top = suspects[0]
        iid = self._next_incident_id()
        inc = dict(id=iid, title=req.title or f"{req.service} {SYMPTOM_PHRASE[req.symptom]}", severity=req.severity,
                   symptom=req.symptom, status="open", started_at=iso(t), resolved_at=None, summary="",
                   origin=top.service, impacted=[req.service] if top.service != req.service else [],
                   followed_deploy=top.recent_deploys[0].id if top.recent_deploys else None, attempts=[])
        self.incidents[iid] = inc
        similar = self.similar_incidents(req.service, req.symptom, 5, origin=top.service, exclude=iid)
        recs = self._recommend(top.service, req.symptom, inc)
        g = _G()
        self._incident_graph(g, inc, True)
        self._svc_node(g, req.service, True)
        path = self._path(req.service, top.service)
        for a, b in zip(path, path[1:]):
            self._svc_node(g, a, True)
            self._svc_node(g, b, True)
            g.edge(svc_id(a), svc_id(b), "DEPENDS_ON", True)
        for s in suspects[:3]:
            self._svc_node(g, s.service, s.service == top.service, s.score)
        sim_services = {req.service, top.service}
        for s in similar[:3]:
            self._incident_graph(g, self.incidents[s.incident.id], False, only_services=sim_services)
        return AlertResponse(incident=self._inc_sum(inc), likely_origin=top.service, suspects=suspects,
                             similar_incidents=similar, recommendations=recs, graph=g.payload())

    def record_outcome(self, req):
        inc = self._need_incident(req.incident_id)
        if req.fix not in self.fixes:
            raise NotFound(f"unknown fix '{req.fix}'")
        t = now()
        eng = self._resolve_engineer(req.engineer) if req.engineer else (
            self._owner_rec(inc["origin"], t.date()) or {"engineer": next(iter(self.engineers))})["engineer"]
        n = max(int(a["id"].split("-")[1]) for i in self.incidents.values() for a in i["attempts"]) + 1
        att = dict(id=f"ATT-{n:03d}", fix=req.fix, status=req.status, ts=iso(t), engineer=eng, notes=req.notes)
        inc["attempts"].append(att)
        if req.status == "SUCCESS":
            inc["status"], inc["resolved_at"] = "resolved", iso(t)
            inc["summary"] = f"Root cause in {inc['origin']} ({inc['symptom']}). Resolved via {req.fix}."
        g = _G()
        self._incident_graph(g, inc, True)
        return OutcomeResponse(attempt=self._att_sum(att), incident=self._inc_sum(inc),
                               recommendations=self._recommend(inc["origin"], inc["symptom"], inc),
                               fix_stats=self.fix_stats(inc["origin"], inc["symptom"]), graph=g.payload())

    # ------------------------------------------------------------------ incidents
    def list_incidents(self, status=None, limit=50):
        items = [i for i in self.incidents.values() if status in (None, i["status"])]
        items.sort(key=lambda i: i["started_at"], reverse=True)
        return [self._inc_sum(i) for i in items[:limit]]

    def incident(self, incident_id):
        inc = self._need_incident(incident_id)
        g = _G()
        self._incident_graph(g, inc, True)
        d = self.deploys.get(inc["followed_deploy"]) if inc.get("followed_deploy") else None
        return IncidentDetail(**self._inc_sum(inc).model_dump(), resolved_at=inc.get("resolved_at"), summary=inc.get("summary", ""),
                              followed_deploy=self._deploy_sum(d) if d else None,
                              attempts=[self._att_sum(a) for a in inc["attempts"]], graph=g.payload())

    def timeline(self, incident_id):
        inc = self._need_incident(incident_id)
        ev = []
        if inc.get("followed_deploy"):
            d = self.deploys[inc["followed_deploy"]]
            ev.append(TimelineEvent(ts=d["deployed_at"], type="deploy",
                                    text=f"Deploy {d['service']} {d['version']} by {self._eng_name(d['author'])}",
                                    node_ids=[dep_id(d["id"]), svc_id(d["service"])]))
        ev.append(TimelineEvent(ts=inc["started_at"], type="incident_opened", text=f"Incident opened: {inc['title']}",
                                node_ids=[inc_id(inc["id"])]))
        for a in inc["attempts"]:
            ev.append(TimelineEvent(ts=a["ts"], type="attempt",
                                    text=f"{self._eng_name(a['engineer'])} tried {a['fix']} -> {a['status']}",
                                    node_ids=[fix_id(a["fix"]), inc_id(inc["id"])]))
        if inc.get("resolved_at"):
            ev.append(TimelineEvent(ts=inc["resolved_at"], type="resolved", text="Incident resolved",
                                    node_ids=[inc_id(inc["id"])]))
        return sorted(ev, key=lambda e: e.ts)


def _neg(s):
    """Sort helper: newer ISO timestamps first when used in an ascending sort."""
    return "".join(chr(0x10FFFF - ord(c)) for c in s)
