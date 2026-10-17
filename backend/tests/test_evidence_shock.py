"""Tests for the Evidence Shock Lab endpoints and logic.

These tests run entirely in MODE=mock (no Neo4j required).
They verify:
  - The shock response has the correct structure.
  - F(e) scores are non-negative and scenarios are sorted descending by impact.
  - `diagnosis_robust` / `diagnosis_changed` are consistent.
  - Removing deploy evidence for payments-api (which has both deploy + history)
    reduces its score but the top suspect may or may not change (both outcomes
    are valid; we just check the math is correct).
  - The /insights/hypotheses/{incident_id} endpoint returns ranked hypotheses.
  - The chat agent responds to "stress test" trigger phrases.
"""
import pytest

from app.mock_engine import MockEngine
from app.chat import handle_chat, SESSIONS
from app.schemas import AlertRequest, ChatRequest

ENGINE = MockEngine()


# ------------------------------------------------------------------ helpers

def _ensure_open_incident():
    """Return an open incident, creating one via alert if the seed has none."""
    incs = ENGINE.list_incidents(status="open")
    if incs:
        return incs[0]
    # Seed may have all incidents resolved; open one against the first service.
    svc = ENGINE.catalog().services[0].name
    r = ENGINE.create_alert(AlertRequest(service=svc, symptom="latency"))
    return r.incident


def _first_resolved_incident():
    incs = ENGINE.list_incidents(status="resolved")
    assert incs, "Need at least one resolved incident in seed data"
    return incs[0]


# ------------------------------------------------------------------ pure shock logic

class TestRunShock:
    """Unit-tests for evidence_shock.run_shock with synthetic inputs."""

    def setup_method(self):
        from app.evidence_shock import RawSuspect, run_shock
        self.RS = RawSuspect
        self.run = run_shock

    def test_empty_suspects(self):
        r = self.run("INC-000", "svc", "latency", [])
        assert r.diagnosis_robust is True
        assert r.scenarios == []
        assert r.suspects == []

    def test_single_suspect_no_evidence(self):
        raw = [self.RS("svc-a", hops=0, has_recent_deploy=False, same_symptom_incidents=0)]
        r = self.run("INC-001", "svc-a", "latency", raw)
        assert len(r.suspects) == 1
        assert r.suspects[0].rank == 1
        # Only PROXIMITY contributes → score = 1/(0+1) = 1.0
        assert r.suspects[0].score == pytest.approx(1.0, abs=0.01)
        # No removable evidence → no scenarios
        assert r.scenarios == []
        assert r.diagnosis_robust is True

    def test_deploy_contributes_3(self):
        raw = [
            self.RS("svc-a", hops=0, has_recent_deploy=True, same_symptom_incidents=0, deploy_id="DEP-x"),
            self.RS("svc-b", hops=1, has_recent_deploy=False, same_symptom_incidents=0),
        ]
        r = self.run("INC-002", "svc-a", "latency", raw)
        top = r.suspects[0]
        # svc-a score = 3 + 0 + 1/(0+1) = 4.0
        assert top.service == "svc-a"
        assert top.score == pytest.approx(4.0, abs=0.01)

    def test_shock_removes_deploy_reduces_score(self):
        raw = [
            self.RS("svc-a", hops=0, has_recent_deploy=True, same_symptom_incidents=2, deploy_id="DEP-y"),
            self.RS("svc-b", hops=1, has_recent_deploy=False, same_symptom_incidents=0),
        ]
        r = self.run("INC-003", "svc-a", "latency", raw)
        # Find the deploy scenario
        deploy_sc = next((sc for sc in r.scenarios if sc.evidence_type == "RECENT_DEPLOY"), None)
        assert deploy_sc is not None
        a_delta = next(d for d in deploy_sc.suspect_deltas if d["service"] == "svc-a")
        # Removing deploy should reduce svc-a score by 3
        assert a_delta["score_before"] - a_delta["score_after"] == pytest.approx(3.0, abs=0.01)

    def test_scenarios_sorted_by_impact_desc(self):
        raw = [
            self.RS("svc-a", hops=0, has_recent_deploy=True, same_symptom_incidents=5, deploy_id="DEP-z"),
            self.RS("svc-b", hops=1, has_recent_deploy=False, same_symptom_incidents=0),
        ]
        r = self.run("INC-004", "svc-a", "latency", raw)
        impacts = [sc.impact_score for sc in r.scenarios]
        assert impacts == sorted(impacts, reverse=True)

    def test_critical_flag_on_first_scenario(self):
        raw = [
            self.RS("svc-a", hops=0, has_recent_deploy=True, same_symptom_incidents=1, deploy_id="DEP-q"),
        ]
        r = self.run("INC-005", "svc-a", "latency", raw)
        if r.scenarios:
            assert r.scenarios[0].is_critical is True
            for sc in r.scenarios[1:]:
                assert sc.is_critical is False

    def test_f_e_non_negative(self):
        raw = [
            self.RS("svc-a", hops=0, has_recent_deploy=True, same_symptom_incidents=3, deploy_id="DEP-r"),
            self.RS("svc-b", hops=2, has_recent_deploy=True, same_symptom_incidents=1, deploy_id="DEP-s"),
        ]
        r = self.run("INC-006", "svc-a", "latency", raw)
        for sc in r.scenarios:
            assert sc.impact_score >= 0.0


# ------------------------------------------------------------------ MockEngine integration

class TestEvidenceShockEndpoint:
    """Tests against the full MockEngine via the evidence_shock() method."""

    def test_shock_on_open_incident_returns_valid_structure(self):
        inc = _ensure_open_incident()
        detail = ENGINE.incident(inc.id)
        svc = detail.impacted[0] if detail.impacted else detail.origin
        r = ENGINE.evidence_shock(inc.id, svc, inc.symptom)

        assert r.incident_id == inc.id
        assert r.service == svc
        assert r.symptom == inc.symptom
        assert isinstance(r.diagnosis_robust, bool)
        assert isinstance(r.robustness_note, str)
        assert len(r.robustness_note) > 0

    def test_hypotheses_are_ranked(self):
        inc = _ensure_open_incident()
        detail = ENGINE.incident(inc.id)
        svc = detail.impacted[0] if detail.impacted else detail.origin
        r = ENGINE.evidence_shock(inc.id, svc, inc.symptom)

        ranks = [h.rank for h in r.hypotheses]
        assert ranks == list(range(1, len(ranks) + 1))

    def test_each_hypothesis_has_evidence(self):
        inc = _ensure_open_incident()
        detail = ENGINE.incident(inc.id)
        svc = detail.impacted[0] if detail.impacted else detail.origin
        r = ENGINE.evidence_shock(inc.id, svc, inc.symptom)

        for h in r.hypotheses:
            assert len(h.evidence) >= 1, f"{h.service} has no evidence items"
            for e in h.evidence:
                assert e.evidence_type in ("RECENT_DEPLOY", "SAME_SYMPTOM", "PROXIMITY")
                assert e.weight >= 0
                assert e.suspect == h.service

    def test_scenarios_consistent_with_diagnosis_robust(self):
        inc = _ensure_open_incident()
        detail = ENGINE.incident(inc.id)
        svc = detail.impacted[0] if detail.impacted else detail.origin
        r = ENGINE.evidence_shock(inc.id, svc, inc.symptom)

        any_changed = any(sc.diagnosis_changed for sc in r.scenarios)
        assert r.diagnosis_robust == (not any_changed)

    def test_graph_payload_present(self):
        inc = _ensure_open_incident()
        detail = ENGINE.incident(inc.id)
        svc = detail.impacted[0] if detail.impacted else detail.origin
        r = ENGINE.evidence_shock(inc.id, svc, inc.symptom)
        assert len(r.graph.nodes) > 0

    def test_resolved_incident_also_works(self):
        inc = _first_resolved_incident()
        detail = ENGINE.incident(inc.id)
        svc = detail.impacted[0] if detail.impacted else detail.origin
        r = ENGINE.evidence_shock(inc.id, svc, inc.symptom)
        assert r.incident_id == inc.id


# ------------------------------------------------------------------ hypotheses endpoint

class TestHypothesesEndpoint:
    def test_returns_ranked_hypotheses(self):
        inc = _ensure_open_incident()
        r = ENGINE.hypotheses(inc.id)
        assert r.incident_id == inc.id
        assert len(r.hypotheses) >= 1
        ranks = [h.rank for h in r.hypotheses]
        assert ranks == list(range(1, len(ranks) + 1))

    def test_hypotheses_scores_descending(self):
        inc = _ensure_open_incident()
        r = ENGINE.hypotheses(inc.id)
        scores = [h.score for h in r.hypotheses]
        assert scores == sorted(scores, reverse=True) or all(
            scores[i] >= scores[i + 1] for i in range(len(scores) - 1)
        )

    def test_unknown_incident_raises(self):
        from app.engine import NotFound
        with pytest.raises(NotFound):
            ENGINE.hypotheses("INC-999")


# ------------------------------------------------------------------ chat integration

class TestChatShockIntent:
    """Test that the chat agent triggers evidence_shock on the right phrases."""

    def setup_method(self):
        ENGINE.reset()
        SESSIONS.clear()
        # Pre-open an incident using the first service in the catalog
        svc = ENGINE.catalog().services[0].name
        ENGINE.create_alert(AlertRequest(service=svc, symptom="latency"))

    @pytest.mark.parametrize("phrase", [
        "stress test the diagnosis",
        "challenge the diagnosis",
        "what if the deploy evidence is wrong?",
        "shock the evidence",
        "is the diagnosis fragile?",
        "what changes if we remove evidence?",
        "show me alternative hypotheses",
    ])
    def test_shock_phrases_trigger_shock_intent(self, phrase):
        r = handle_chat(ENGINE, ChatRequest(session_id="test-shock", message=phrase))
        assert r.intent == "evidence_shock", f"Expected evidence_shock intent for: {phrase!r}, got {r.intent!r}"
        assert any(tc.name == "evidence_shock" for tc in r.tool_calls)
        assert len(r.recalled) > 0

    def test_shock_response_contains_robustness_info(self):
        r = handle_chat(ENGINE, ChatRequest(session_id="test-shock-2", message="stress test diagnosis"))
        assert "ROBUST" in r.reply or "FRAGILE" in r.reply
        assert "evidence" in r.reply.lower()

    def test_shock_without_open_incident_returns_no_incident(self):
        SESSIONS.clear()
        ENGINE.reset()
        # Don't open any incident
        r = handle_chat(ENGINE, ChatRequest(session_id="empty-sess", message="stress test diagnosis"))
        assert r.intent == "no_incident"
