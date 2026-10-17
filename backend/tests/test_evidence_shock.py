"""Comprehensive tests for Evidence Shock Lab (ProofOps layer).

Verifies all contract, analytical, and pure scoring invariants:
  A. Alert-score parity
  B. Remove incident-history evidence -> inconclusive (payments-api & inventory tied at 3.5)
  C. Remove deploy evidence -> robust (payments-api remains first)
  D. Exclude target incident and incidents with started_at >= t_target
  E. Unknown incident IDs -> 404
  F. Request validation: matching optional values accepted, conflicting return 400
  G. Existing tests remain green
  H. Determinism of evidence, scores, verdicts, margins, graph payloads
  I. Evidence weight parity: sum(evidence.weight) == suspect.score
  J. Contract backwards compatibility: v1 specification byte-for-byte preserved
  K. Pure scoring: zero baseline, < 2 suspects, ties within epsilon, simultaneous removal, sensitivity
"""
import copy
import json
import pytest
from fastapi.testclient import TestClient

from app import config
from app.clock import parse_dt
from app.deps import get_engine, set_engine
from app.main import app
from app.mock_engine import MockEngine
from app.schemas_shock import (
    EvidenceItem,
    HypothesisItem,
)
from app.shock import (
    TIE_EPSILON,
    evaluate_shock,
    score_hypotheses_baseline,
)


@pytest.fixture
def client():
    e = MockEngine()
    set_engine(e)
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Test J: Contract Compatibility and Additive Changes
# ---------------------------------------------------------------------------
def test_v1_contract_backwards_compatibility(client):
    """(J) Assert every v1 path and component is unchanged in the new openapi spec."""
    v1_file = config.ROOT / "contract" / "openapi.v1.json"
    assert v1_file.exists(), "contract/openapi.v1.json must exist as snapshot"
    v1 = json.loads(v1_file.read_text())
    v1_1 = client.get("/openapi.json").json()

    # Verify version bump to v1.1
    assert v1_1["info"]["version"] == "1.1.0", f"API contract version must be 1.1.0, got {v1_1['info']['version']}"

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

    # 3. Verify only intended additive paths were added
    new_paths = set(v1_1["paths"].keys()) - set(v1["paths"].keys())
    assert new_paths == {"/insights/evidence-shock", "/insights/hypotheses/{incident_id}"}


# ---------------------------------------------------------------------------
# Test A: Alert-Score Parity
# ---------------------------------------------------------------------------
def test_create_alert_hypotheses_scores_equal_suspects_scores(client):
    """(A) create_alert for checkout+latency -> hypotheses scores == alert.suspects scores."""
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


# ---------------------------------------------------------------------------
# Test B: Remove incident-history Evidence -> Inconclusive
# ---------------------------------------------------------------------------
def test_removing_incident_history_verdict_inconclusive_tied_at_3_5(client):
    """(B) removing source incident-history -> verdict inconclusive with payments-api and inventory tied at 3.5."""
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
    assert res["margin_after"] <= TIE_EPSILON

    hyp_by_svc = {h["service"]: h for h in res["hypotheses"]}
    assert "payments-api" in hyp_by_svc
    assert "inventory" in hyp_by_svc

    # Both payments-api and inventory must be tied at 3.5
    assert pytest.approx(3.5, abs=0.001) == hyp_by_svc["payments-api"]["score_after"]
    assert pytest.approx(3.5, abs=0.001) == hyp_by_svc["inventory"]["score_after"]

    # Neither tied hypothesis is presented as a confident winner in recommendation
    rec = res["recommendation"]
    assert "INCONCLUSIVE" in rec
    assert "payments-api" in rec and "inventory" in rec


# ---------------------------------------------------------------------------
# Test C: Remove deploy Evidence -> Robust
# ---------------------------------------------------------------------------
def test_removing_deploy_log_verdict_robust_payments_first(client):
    """(C) removing source cicd-deploy-log stays robust (payments-api first)."""
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
    assert res["margin_after"] > TIE_EPSILON


# ---------------------------------------------------------------------------
# Test D: Exclude Target Incident and Future/Concurrent Incidents
# ---------------------------------------------------------------------------
def test_incident_is_never_in_its_own_evidence(client):
    """(D) an incident is never in its own historical evidence, and t_hist >= t_target are excluded."""
    engine = MockEngine()
    set_engine(engine)

    # 1. Create target incident
    alert_resp = client.post("/alert", json={"service": "checkout", "symptom": "latency"})
    target_id = alert_resp.json()["incident"]["id"]
    target_inc = engine.incident(target_id)
    t_target = parse_dt(target_inc.started_at)

    # 2. Inject a simulated concurrent/future incident into engine.incidents
    future_id = "INC-998"
    engine.incidents[future_id] = {
        "id": future_id,
        "title": "Future incident on payments-api",
        "severity": "SEV2",
        "symptom": "latency",
        "status": "resolved",
        "started_at": "2026-10-18T10:00:00Z",  # strictly after t_target
        "resolved_at": "2026-10-18T11:00:00Z",
        "origin": "payments-api",
        "impacted": ["checkout"],
        "followed_deploy": None,
        "attempts": [],
    }

    hyp_resp = client.get(f"/insights/hypotheses/{target_id}")
    assert hyp_resp.status_code == 200
    hyp_data = hyp_resp.json()

    self_ev_id = f"ev:history:{target_id}"
    future_ev_id = f"ev:history:{future_id}"

    for h in hyp_data["hypotheses"]:
        for e in h["evidence"]:
            assert e["id"] != self_ev_id, f"Target incident {target_id} appears in its own evidence!"
            assert e["id"] != future_ev_id, f"Future incident {future_id} appears in historical evidence!"


# ---------------------------------------------------------------------------
# Test E: Unknown Incident IDs
# ---------------------------------------------------------------------------
def test_unknown_incident_id_returns_404(client):
    """(E) unknown incident IDs return 404."""
    r_get = client.get("/insights/hypotheses/INC-999")
    assert r_get.status_code == 404

    r_post = client.post("/insights/evidence-shock", json={"incident_id": "INC-999"})
    assert r_post.status_code == 404


# ---------------------------------------------------------------------------
# Test F: Request Validation
# ---------------------------------------------------------------------------
def test_mismatched_service_or_symptom_returns_400(client):
    """(F) matching optional service/symptom values are accepted, conflicting return 400."""
    alert_resp = client.post("/alert", json={"service": "checkout", "symptom": "latency"})
    incident_id = alert_resp.json()["incident"]["id"]

    # Matching values must succeed (200)
    r_match = client.post(
        "/insights/evidence-shock",
        json={"incident_id": incident_id, "service": "checkout", "symptom": "latency"},
    )
    assert r_match.status_code == 200

    # Conflicting service returns 400
    r_bad_svc = client.post(
        "/insights/evidence-shock",
        json={"incident_id": incident_id, "service": "redis-cache"},
    )
    assert r_bad_svc.status_code == 400

    # Conflicting symptom returns 400
    r_bad_sym = client.post(
        "/insights/evidence-shock",
        json={"incident_id": incident_id, "symptom": "oom"},
    )
    assert r_bad_sym.status_code == 400


# ---------------------------------------------------------------------------
# Test H: Determinism
# ---------------------------------------------------------------------------
def test_determinism_across_identical_requests(client):
    """(H) Identical requests produce identical evidence IDs, weights, scores, verdicts, and graph payloads."""
    alert_resp = client.post("/alert", json={"service": "checkout", "symptom": "latency"})
    incident_id = alert_resp.json()["incident"]["id"]

    req_body = {
        "incident_id": incident_id,
        "remove_sources": ["incident-history"],
    }

    resp1 = client.post("/insights/evidence-shock", json=req_body).json()
    resp2 = client.post("/insights/evidence-shock", json=req_body).json()

    assert resp1 == resp2, "Repeated shock evaluations must be bitwise identical"

    hyp1 = client.get(f"/insights/hypotheses/{incident_id}").json()
    hyp2 = client.get(f"/insights/hypotheses/{incident_id}").json()

    assert hyp1 == hyp2, "Repeated hypothesis evaluations must be bitwise identical"


# ---------------------------------------------------------------------------
# Test I: Evidence Weight Parity
# ---------------------------------------------------------------------------
def test_evidence_weight_parity(client):
    """(I) Each suspect's evidence weights sum to its suspect score; no duplicate inflation."""
    alert_resp = client.post("/alert", json={"service": "checkout", "symptom": "latency"})
    incident_id = alert_resp.json()["incident"]["id"]

    hyp_resp = client.get(f"/insights/hypotheses/{incident_id}")
    assert hyp_resp.status_code == 200
    hyps = hyp_resp.json()["hypotheses"]

    for h in hyps:
        ev_sum = round(sum(e["weight"] for e in h["evidence"]), 3)
        assert pytest.approx(h["score"], abs=0.001) == ev_sum, (
            f"Evidence weights sum {ev_sum} does not match suspect score {h['score']} for {h['service']}"
        )
        # Ensure evidence IDs are unique per hypothesis
        ev_ids = [e["id"] for e in h["evidence"]]
        assert len(ev_ids) == len(set(ev_ids)), f"Duplicate evidence found for suspect {h['service']}"


# ---------------------------------------------------------------------------
# Graph Payload Tests
# ---------------------------------------------------------------------------
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

    # Check SUPPORTS edges have props.weight matching evidence weight
    for edge in graph["edges"]:
        if edge["type"] == "SUPPORTS":
            assert "weight" in edge["props"]
            assert edge["props"]["weight"] > 0


# ---------------------------------------------------------------------------
# Test K: Pure Scoring Unit Tests (Independent of Engine)
# ---------------------------------------------------------------------------
def test_pure_scoring_zero_total_baseline():
    """(K.1) Zero total baseline scores: handled deterministically without division by zero."""
    hyps = [
        HypothesisItem(service="svc-a", hops=0, score=0.0, rank=1, evidence=[]),
        HypothesisItem(service="svc-b", hops=1, score=0.0, rank=2, evidence=[]),
    ]
    res = evaluate_shock(
        incident_id="INC-TEST",
        service="svc-a",
        symptom="latency",
        hypotheses=hyps,
    )
    assert res.verdict == "inconclusive"
    assert res.margin_before == 0.0
    assert res.margin_after == 0.0
    assert res.critical_evidence == []
    assert res.critical_sources == []


def test_pure_scoring_fewer_than_two_suspects():
    """(K.2) Fewer than two suspects: returns documented null (None) margins instead of inventing a score."""
    ev = EvidenceItem(
        id="ev:deploy:solo-svc",
        kind="deploy",
        source="cicd-deploy-log",
        weight=3.0,
        owner_service="solo-svc",
        label="Deploy v1.0",
    )
    hyps = [HypothesisItem(service="solo-svc", hops=0, score=3.0, rank=1, evidence=[ev])]

    res = evaluate_shock(
        incident_id="INC-TEST",
        service="solo-svc",
        symptom="latency",
        hypotheses=hyps,
    )
    assert res.margin_before is None
    assert res.margin_after is None
    assert res.verdict == "robust"
    assert res.top_suspect_before == "solo-svc"
    assert res.top_suspect_after == "solo-svc"


def test_pure_scoring_ties_within_epsilon():
    """(K.3) Ties within epsilon 0.25 result in inconclusive verdict, never arbitrary winner."""
    ev_a = EvidenceItem(id="ev:topo:a", kind="topology", source="service-topology", weight=1.0, owner_service="svc-a", label="topo a")
    ev_b = EvidenceItem(id="ev:topo:b", kind="topology", source="service-topology", weight=0.9, owner_service="svc-b", label="topo b")
    hyps = [
        HypothesisItem(service="svc-a", hops=0, score=1.0, rank=1, evidence=[ev_a]),
        HypothesisItem(service="svc-b", hops=1, score=0.9, rank=2, evidence=[ev_b]),
    ]
    # Margin is 1.0 - 0.9 = 0.1 <= 0.25 (TIE_EPSILON)
    res = evaluate_shock(
        incident_id="INC-TEST",
        service="svc-a",
        symptom="latency",
        hypotheses=hyps,
    )
    assert res.verdict == "inconclusive"
    assert res.margin_after <= TIE_EPSILON
    assert "INCONCLUSIVE" in res.recommendation


def test_pure_scoring_simultaneous_id_and_source_removal():
    """(K.4) Simultaneous removal of evidence IDs and evidence sources applies their union."""
    ev1 = EvidenceItem(id="ev:deploy:a", kind="deploy", source="cicd-deploy-log", weight=3.0, owner_service="svc-a", label="dep a")
    ev2 = EvidenceItem(id="ev:hist:1", kind="history", source="incident-history", weight=1.0, owner_service="svc-a", label="hist 1")
    ev3 = EvidenceItem(id="ev:topo:a", kind="topology", source="service-topology", weight=1.0, owner_service="svc-a", label="topo a")
    hyps = [HypothesisItem(service="svc-a", hops=0, score=5.0, rank=1, evidence=[ev1, ev2, ev3])]

    # Remove ev1 specifically, and remove all service-topology
    res = evaluate_shock(
        incident_id="INC-TEST",
        service="svc-a",
        symptom="latency",
        hypotheses=hyps,
        remove_evidence_ids=["ev:deploy:a"],
        remove_sources=["service-topology"],
    )
    # Remaining: only ev2 (weight 1.0)
    assert res.hypotheses[0].score_after == 1.0


def test_pure_scoring_deterministic_display_ordering_and_sensitivity():
    """(K.5) Deterministic display ordering and correct individual/aggregate sensitivity calculations."""
    ev1 = EvidenceItem(id="ev:deploy:a", kind="deploy", source="cicd-deploy-log", weight=3.0, owner_service="svc-a", label="dep a")
    ev2 = EvidenceItem(id="ev:deploy:b", kind="deploy", source="cicd-deploy-log", weight=3.0, owner_service="svc-b", label="dep b")
    hyps = [
        HypothesisItem(service="svc-a", hops=0, score=3.0, rank=1, evidence=[ev1]),
        HypothesisItem(service="svc-b", hops=0, score=3.0, rank=2, evidence=[ev2]),
    ]
    # Total baseline = 6.0, importance(a) = 0.5, importance(b) = 0.5
    # F(ev1) = 0.5 * 3.0 = 1.5
    # F(ev2) = 0.5 * 3.0 = 1.5
    res = evaluate_shock(
        incident_id="INC-TEST",
        service="svc-a",
        symptom="latency",
        hypotheses=hyps,
    )
    # Both have impact 1.5; alphabetical by ID breaks display tie deterministically
    assert len(res.critical_evidence) == 2
    assert res.critical_evidence[0].impact_score == 1.5
    assert res.critical_evidence[1].impact_score == 1.5
    assert res.critical_evidence[0].evidence_id == "ev:deploy:a"
    assert res.critical_evidence[1].evidence_id == "ev:deploy:b"

    # Aggregate source impact for cicd-deploy-log: 1.5 + 1.5 = 3.0
    assert len(res.critical_sources) == 1
    assert res.critical_sources[0].source == "cicd-deploy-log"
    assert res.critical_sources[0].impact_score == 3.0
    assert res.critical_sources[0].evidence_count == 2
