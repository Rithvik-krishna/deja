"""Comprehensive tests for Evidence Shock Lab (ProofOps layer).

Verifies all contract and analytical invariants:
  (a) create_alert for checkout+latency -> hypotheses scores == alert.suspects scores
  (b) removing source incident-history -> verdict inconclusive with payments-api and inventory tied at 3.5
  (c) removing source cicd-deploy-log -> verdict robust (payments-api first)
  (d) the incident is never in its own evidence
  (e) unknown incident IDs -> 404
  (f) contract backwards compatibility: every v1 path and component in openapi.v1.json
      is unchanged in the new openapi.json
"""
import json
import pytest
from fastapi.testclient import TestClient

from app import config
from app.deps import get_engine, set_engine
from app.main import app
from app.mock_engine import MockEngine
from app.schemas import AlertRequest


@pytest.fixture
def client():
    e = MockEngine()
    set_engine(e)
    with TestClient(app) as c:
        yield c


def test_v1_contract_backwards_compatibility(client):
    """Assert every v1 path and component is unchanged in the new openapi spec."""
    v1_file = config.ROOT / "contract" / "openapi.v1.json"
    assert v1_file.exists(), "contract/openapi.v1.json must exist as snapshot"
    v1 = json.loads(v1_file.read_text())
    v1_1 = client.get("/openapi.json").json()

    # 1. Assert all v1 paths exist in v1.1 and have identical methods & parameters
    for path, v1_methods in v1["paths"].items():
        assert path in v1_1["paths"], f"v1 path '{path}' missing from v1.1 openapi.json"
        for method, v1_op in v1_methods.items():
            assert method in v1_1["paths"][path], f"v1 method '{method}' for '{path}' missing from v1.1"
            op = v1_1["paths"][path][method]
            assert op.get("parameters") == v1_op.get("parameters"), f"Parameters changed for {method} {path}"

    # 2. Assert all v1 component schemas exist in v1.1 and are identical
    v1_schemas = v1.get("components", {}).get("schemas", {})
    v1_1_schemas = v1_1.get("components", {}).get("schemas", {})
    for schema_name, v1_schema in v1_schemas.items():
        assert schema_name in v1_1_schemas, f"v1 schema '{schema_name}' missing from v1.1"
        assert v1_schema == v1_1_schemas[schema_name], f"v1 schema '{schema_name}' changed in v1.1"


def test_create_alert_hypotheses_scores_equal_suspects_scores(client):
    """(a) create_alert for checkout+latency, then hypotheses scores == alert.suspects scores."""
    alert_resp = client.post("/alert", json={"service": "checkout", "symptom": "latency"})
    assert alert_resp.status_code == 200
    alert_data = alert_resp.json()
    incident_id = alert_data["incident"]["id"]
    alert_suspects = {s["service"]: s["score"] for s in alert_data["suspects"]}

    # Query GET /insights/hypotheses/{incident_id}
    hyp_resp = client.get(f"/insights/hypotheses/{incident_id}")
    assert hyp_resp.status_code == 200
    hyp_data = hyp_resp.json()
    hyp_scores = {h["service"]: h["score"] for h in hyp_data["hypotheses"]}

    # Scores must be identical for each suspect
    for svc, expected_score in alert_suspects.items():
        assert svc in hyp_scores, f"Suspect {svc} missing from hypotheses"
        assert pytest.approx(expected_score, abs=0.001) == hyp_scores[svc], (
            f"Hypothesis score mismatch for {svc}: alert={expected_score}, hypothesis={hyp_scores[svc]}"
        )


def test_removing_incident_history_verdict_inconclusive_tied_at_3_5(client):
    """(b) removing source incident-history gives verdict inconclusive with payments-api and inventory tied at 3.5."""
    alert_resp = client.post("/alert", json={"service": "checkout", "symptom": "latency"})
    incident_id = alert_resp.json()["incident"]["id"]

    shock_resp = client.post(
        "/insights/evidence-shock",
        json={
            "incident_id": incident_id,
            "remove_sources": ["incident-history"],
        },
    )
    assert shock_resp.status_code == 200
    res = shock_resp.json()

    assert res["verdict"] == "inconclusive"
    assert res["margin_after"] <= 0.25

    hyp_by_svc = {h["service"]: h for h in res["hypotheses"]}
    assert "payments-api" in hyp_by_svc
    assert "inventory" in hyp_by_svc

    # Both payments-api and inventory must be tied at 3.5
    assert pytest.approx(3.5, abs=0.001) == hyp_by_svc["payments-api"]["score_after"]
    assert pytest.approx(3.5, abs=0.001) == hyp_by_svc["inventory"]["score_after"]


def test_removing_deploy_log_verdict_robust_payments_first(client):
    """(c) removing source cicd-deploy-log stays robust (payments-api first)."""
    alert_resp = client.post("/alert", json={"service": "checkout", "symptom": "latency"})
    incident_id = alert_resp.json()["incident"]["id"]

    shock_resp = client.post(
        "/insights/evidence-shock",
        json={
            "incident_id": incident_id,
            "remove_sources": ["cicd-deploy-log"],
        },
    )
    assert shock_resp.status_code == 200
    res = shock_resp.json()

    assert res["verdict"] == "robust"
    assert res["top_suspect_after"] == "payments-api"
    assert res["margin_after"] > 0.25


def test_incident_is_never_in_its_own_evidence(client):
    """(d) the incident is never in its own evidence."""
    alert_resp = client.post("/alert", json={"service": "checkout", "symptom": "latency"})
    incident_id = alert_resp.json()["incident"]["id"]

    hyp_resp = client.get(f"/insights/hypotheses/{incident_id}")
    assert hyp_resp.status_code == 200
    hyp_data = hyp_resp.json()

    self_ev_id = f"ev:history:{incident_id}"
    for h in hyp_data["hypotheses"]:
        for e in h["evidence"]:
            assert e["id"] != self_ev_id, f"Incident {incident_id} appears in its own evidence list!"


def test_unknown_incident_id_returns_404(client):
    """(e) unknown incident IDs return 404."""
    r_get = client.get("/insights/hypotheses/INC-999")
    assert r_get.status_code == 404

    r_post = client.post("/insights/evidence-shock", json={"incident_id": "INC-999"})
    assert r_post.status_code == 404


def test_mismatched_service_or_symptom_returns_400(client):
    """Optional service/symptom must match the incident or return 400."""
    alert_resp = client.post("/alert", json={"service": "checkout", "symptom": "latency"})
    incident_id = alert_resp.json()["incident"]["id"]

    r_bad_svc = client.post(
        "/insights/evidence-shock",
        json={"incident_id": incident_id, "service": "redis-cache"},
    )
    assert r_bad_svc.status_code == 400

    r_bad_sym = client.post(
        "/insights/evidence-shock",
        json={"incident_id": incident_id, "symptom": "oom"},
    )
    assert r_bad_sym.status_code == 400


def test_graph_payload_nodes_and_edges(client):
    """Verify Graph payload includes Service and Evidence nodes with SUPPORTS edges."""
    alert_resp = client.post("/alert", json={"service": "checkout", "symptom": "latency"})
    incident_id = alert_resp.json()["incident"]["id"]

    shock_resp = client.post(
        "/insights/evidence-shock",
        json={"incident_id": incident_id, "remove_sources": ["cicd-deploy-log"]},
    )
    res = shock_resp.json()
    graph = res["graph"]

    assert len(graph["nodes"]) > 0
    assert len(graph["edges"]) > 0

    node_labels = {n["label"] for n in graph["nodes"]}
    assert "Service" in node_labels
    assert "Evidence" in node_labels

    edge_types = {e["type"] for e in graph["edges"]}
    assert "SUPPORTS" in edge_types

    # Ensure removed deploy evidence has props.removed == True and is highlighted
    deploy_nodes = [n for n in graph["nodes"] if n["label"] == "Evidence" and n["props"].get("kind") == "deploy"]
    for dn in deploy_nodes:
        assert dn["props"]["removed"] is True
        assert dn["highlight"] is True
