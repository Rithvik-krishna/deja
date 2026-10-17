"""PARITY TEST for Backend A. Skipped until NEO4J_URI is set and the seed is loaded. Runs the SAME assertions
against Neo4jEngine that the mock passes. Extend freely; never loosen."""
import json
import os
from datetime import date

import pytest

from app import config
from app.clock import parse_dt
from app.engine import NotFound
from app.mock_engine import MockEngine
from app.schemas import AlertRequest

pytestmark = pytest.mark.skipif(not os.getenv("NEO4J_URI"), reason="NEO4J_URI not set")
EXP = json.loads((config.ROOT / "data" / "expected_insights.json").read_text())


@pytest.fixture()
def live():
    from app.neo4j_engine import Neo4jEngine
    e = Neo4jEngine()
    e.reset()
    return e


@pytest.fixture()
def mock():
    m = MockEngine()
    m.reset()
    return m


def normalize_graph(payload_dict):
    if not payload_dict:
        return payload_dict
    d = dict(payload_dict)
    if "nodes" in d:
        d["nodes"] = sorted(d["nodes"], key=lambda n: n["id"])
    if "edges" in d:
        d["edges"] = sorted(d["edges"], key=lambda e: e["id"])
    return d


def normalize_similar_incident(item):
    d = item.model_dump() if hasattr(item, "model_dump") else dict(item)
    if "incident" in d and isinstance(d["incident"], dict):
        inc = dict(d["incident"])
        if "impacted" in inc and isinstance(inc["impacted"], list):
            inc["impacted"] = sorted(inc["impacted"])
        d["incident"] = inc
    return d


def normalize_model_dump(m):
    dump = m.model_dump() if hasattr(m, "model_dump") else dict(m)
    if "graph" in dump and isinstance(dump["graph"], dict):
        dump["graph"] = normalize_graph(dump["graph"])
    if "similar_incidents" in dump and isinstance(dump["similar_incidents"], list):
        dump["similar_incidents"] = [normalize_similar_incident(s) for s in dump["similar_incidents"]]
    return dump


# ------------------------------------------------------------------ existing tests preserved
def test_risk(live):
    r = live.risk(180, 10, date(2026, 10, 17))
    assert [(s.service, s.risk_score) for s in r.services[:5]] == [(x["service"], x["risk_score"]) for x in EXP["risk_top"]]


def test_owner_time_travel(live):
    try:
        for c in EXP["owner_checks"]:
            assert live.owner(c["service"], date.fromisoformat(c["on"])).owner == c["owner"]
    except NotImplementedError:
        pytest.skip("Abhi's WriteMixin (owner) not yet integrated")


def test_alert(live):
    a = live.create_alert(AlertRequest(service="checkout", symptom="latency"))
    e = EXP["alert_checkout_latency"]
    assert a.likely_origin == e["likely_origin"] and [s.service for s in a.suspects] == e["suspect_order"]
    assert a.recommendations[0].fix == e["top_recommendation"]
    assert [r.fix for r in a.recommendations if r.avoid] == e["avoid"]


# ------------------------------------------------------------------ Test 1: Catalog
def test_catalog_parity(live, mock):
    assert live.catalog().model_dump() == mock.catalog().model_dump()


# ------------------------------------------------------------------ Test 2: Risk full parity
def test_risk_full_parity(live, mock):
    assert normalize_model_dump(live.risk(180, 10, date(2026, 10, 17))) == normalize_model_dump(mock.risk(180, 10, date(2026, 10, 17)))
    assert normalize_model_dump(live.risk()) == normalize_model_dump(mock.risk())


# ------------------------------------------------------------------ Test 3: Blast
def test_blast_parity(live, mock):
    assert normalize_model_dump(live.blast("payments-api")) == normalize_model_dump(mock.blast("payments-api"))


# ------------------------------------------------------------------ Test 4: Fix stats
def test_fix_stats_parity(live, mock):
    live_stats = [s.model_dump() for s in live.fix_stats("payments-api", "latency")]
    mock_stats = [s.model_dump() for s in mock.fix_stats("payments-api", "latency")]
    assert live_stats == mock_stats


# ------------------------------------------------------------------ Test 5: Similar incidents (limit=50)
def test_similar_incidents_parity_and_no_hidden_cap(live, mock):
    live_sim = live.similar_incidents("checkout", "latency", limit=50, origin="payments-api")
    mock_sim = mock.similar_incidents("checkout", "latency", limit=50, origin="payments-api")
    assert len(live_sim) == len(mock_sim)
    assert len(live_sim) >= 5, "Expected qualifying similar incidents"
    assert [normalize_similar_incident(s) for s in live_sim] == [normalize_similar_incident(s) for s in mock_sim]


# ------------------------------------------------------------------ Test 6: _suspects (historical & read-only)
def test_suspects_parity_and_read_only(live, mock):
    t = parse_dt("2026-10-17T07:00:00Z")

    node_count_before = live._run("MATCH (n) RETURN count(n) AS cnt")[0]["cnt"]
    rel_count_before = live._run("MATCH ()-[r]->() RETURN count(r) AS cnt")[0]["cnt"]

    live_suspects = live._suspects("checkout", "latency", t=t)
    mock_suspects = mock._suspects("checkout", "latency", t=t)

    node_count_after = live._run("MATCH (n) RETURN count(n) AS cnt")[0]["cnt"]
    rel_count_after = live._run("MATCH ()-[r]->() RETURN count(r) AS cnt")[0]["cnt"]

    assert node_count_before == node_count_after, "_suspects must not modify nodes"
    assert rel_count_before == rel_count_after, "_suspects must not modify relationships"

    assert [s.model_dump() for s in live_suspects] == [s.model_dump() for s in mock_suspects]
    assert any(s.service == "checkout" and s.hops == 0 for s in live_suspects), "Requested service must be 0-hop suspect"

    # Historical timestamp before v2.3.1 deploy (2026-10-14)
    t_hist = parse_dt("2026-10-10T00:00:00Z")
    live_hist = live._suspects("checkout", "latency", t=t_hist)
    mock_hist = mock._suspects("checkout", "latency", t=t_hist)
    assert [s.model_dump() for s in live_hist] == [s.model_dump() for s in mock_hist]
    for s in live_hist:
        assert not any(d.version == "v2.3.1" for d in s.recent_deploys), "Future deploy must not appear in historical suspects"


# ------------------------------------------------------------------ Test 7: create_alert full response parity
def test_create_alert_full_parity(live, mock):
    live_alert = live.create_alert(AlertRequest(service="checkout", symptom="latency"))
    mock_alert = mock.create_alert(AlertRequest(service="checkout", symptom="latency"))

    assert normalize_model_dump(live_alert) == normalize_model_dump(mock_alert)


# ------------------------------------------------------------------ Additional error / boundary tests
def test_unknown_service_errors(live, mock):
    with pytest.raises(NotFound):
        live.blast("unknown-service-xyz")
    with pytest.raises(NotFound):
        live.similar_incidents("unknown-service-xyz")
    with pytest.raises(NotFound):
        live._suspects("unknown-service-xyz", "latency", t=parse_dt("2026-10-17T07:00:00Z"))
    with pytest.raises(NotFound):
        live.create_alert(AlertRequest(service="unknown-service-xyz", symptom="latency"))
