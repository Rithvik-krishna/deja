"""PARITY TEST for Backend A. Skipped until NEO4J_URI is set and the seed is loaded. Runs the SAME assertions
against Neo4jEngine that the mock passes. Extend freely; never loosen."""
import json
import os
from datetime import date

import pytest

from app import config
from app.schemas import AlertRequest

pytestmark = pytest.mark.skipif(not os.getenv("NEO4J_URI"), reason="NEO4J_URI not set")
EXP = json.loads((config.ROOT / "data" / "expected_insights.json").read_text())


@pytest.fixture()
def live():
    from app.neo4j_engine import Neo4jEngine
    e = Neo4jEngine()
    e.reset()
    return e


def test_risk(live):
    r = live.risk(180, 10, date(2026, 10, 17))
    assert [(s.service, s.risk_score) for s in r.services[:5]] == [(x["service"], x["risk_score"]) for x in EXP["risk_top"]]


def test_owner_time_travel(live):
    for c in EXP["owner_checks"]:
        assert live.owner(c["service"], date.fromisoformat(c["on"])).owner == c["owner"]


def test_alert(live):
    a = live.create_alert(AlertRequest(service="checkout", symptom="latency"))
    e = EXP["alert_checkout_latency"]
    assert a.likely_origin == e["likely_origin"] and [s.service for s in a.suspects] == e["suspect_order"]
    assert a.recommendations[0].fix == e["top_recommendation"]
    assert [r.fix for r in a.recommendations if r.avoid] == e["avoid"]
