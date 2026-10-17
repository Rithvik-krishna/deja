"""Locks the planted story so the demo can't silently break when someone edits the seed."""
import json
from datetime import date

from app import config
from app.schemas import AlertRequest

SEED = json.loads(config.SEED_PATH.read_text())
EXP = json.loads((config.ROOT / "data" / "expected_insights.json").read_text())


def test_referential_integrity_and_dag():
    svc = {s["name"] for s in SEED["services"]}
    eng = {e["id"] for e in SEED["engineers"]}
    fix = {f["id"] for f in SEED["fixes"]}
    dep = {d["id"] for d in SEED["deploys"]}
    adj = {s: [] for s in svc}
    for e in SEED["dependencies"]:
        assert e["from"] in svc and e["to"] in svc
        adj[e["from"]].append(e["to"])
    for o in SEED["ownership"]:
        assert o["service"] in svc and o["engineer"] in eng
    for d in SEED["deploys"]:
        assert d["service"] in svc and d["author"] in eng
    for i in SEED["incidents"]:
        assert i["origin"] in svc and set(i["impacted"]) <= svc
        assert i["followed_deploy"] is None or i["followed_deploy"] in dep
        assert i["attempts"] and i["attempts"][-1]["status"] == "SUCCESS"
        for a in i["attempts"]:
            assert a["fix"] in fix and a["engineer"] in eng
    state = {}

    def dfs(n):
        state[n] = 1
        for m in adj[n]:
            assert state.get(m) != 1, "cycle in DEPENDS_ON"
            if m not in state:
                dfs(m)
        state[n] = 2
    for s in svc:
        if s not in state:
            dfs(s)
    assert 40 <= len(SEED["incidents"]) <= 50 and len(SEED["services"]) >= 20


def test_ownership_has_no_overlaps():
    by = {}
    for o in SEED["ownership"]:
        by.setdefault(o["service"], []).append(o)
    for s, recs in by.items():
        recs.sort(key=lambda o: o["valid_from"])
        for a, b in zip(recs, recs[1:]):
            assert a["valid_to"] is not None and a["valid_to"] < b["valid_from"], s
        assert recs[-1]["valid_to"] is None, f"{s} must have a current owner"


def test_risk_story(engine):
    r = engine.risk(180, 10, date(2026, 10, 17))
    top = r.services[0]
    assert top.service == "payments-api" and top.tier == "tier-2"
    assert top.transitive_dependents >= 9 and top.incidents_originated >= 8
    assert top.incident_rank == 1 and top.fan_in_rank > 3, "must be 'hidden' by fan-in alone"
    assert r.services[0].risk_score - r.services[1].risk_score >= 5
    assert [s.service for s in r.services[:5]] == [x["service"] for x in EXP["risk_top"]]


def test_failure_memory_story(engine):
    st = {s.fix: s for s in engine.fix_stats("payments-api", None)}
    assert (st["restart-pods"].attempts, st["restart-pods"].successes) == (5, 0) and st["restart-pods"].avoid
    assert (st["rollback-deploy"].attempts, st["rollback-deploy"].successes) == (5, 5)


def test_alert_story(engine):
    r = engine.create_alert(AlertRequest(service="checkout", symptom="latency"))
    assert r.likely_origin == "payments-api"
    assert [s.service for s in r.suspects][:2] == ["payments-api", "inventory"], "decoy must rank 2nd"
    assert r.suspects[0].recent_deploys[0].version == "v2.3.1" and r.suspects[0].recent_deploys[0].author == "Asha Menon"
    assert r.recommendations[0].fix == "rollback-deploy"
    assert [x.fix for x in r.recommendations if x.avoid] == ["restart-pods"]
    assert r.similar_incidents and r.similar_incidents[0].score >= 0.9
    assert r.incident.status == "open" and r.incident.id not in {s.incident.id for s in r.similar_incidents}
    assert any(n.highlight for n in r.graph.nodes) and any(e.type == "DEPENDS_ON" and e.highlight for e in r.graph.edges)


def test_matches_expected_insights_file(engine):
    for c in EXP["owner_checks"]:
        assert engine.owner(c["service"], date.fromisoformat(c["on"])).owner == c["owner"]
    a = engine.create_alert(AlertRequest(service="checkout", symptom="latency"))
    e = EXP["alert_checkout_latency"]
    assert a.likely_origin == e["likely_origin"] and [s.service for s in a.suspects] == e["suspect_order"]
    assert a.recommendations[0].fix == e["top_recommendation"] and len(a.similar_incidents) == e["similar_incident_count"]
