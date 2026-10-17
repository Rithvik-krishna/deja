"""Schemas for the Evidence Shock Lab (ProofOps layer).

All scores and margins in this module are heuristics derived from graph topological
and historical frequency features, NOT statistical probabilities.
"""
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

from .schemas import GraphPayload, Symptom


class EvidenceItem(BaseModel):
    id: str = Field(description="Deterministic ID, e.g. 'ev:deploy:<svc>', 'ev:history:<inc>', 'ev:topology:<svc>'")
    kind: Literal["deploy", "history", "topology"] = Field(description="Kind of evidence: deploy | history | topology")
    source: Literal["cicd-deploy-log", "incident-history", "service-topology"] = Field(
        description="Source system: cicd-deploy-log | incident-history | service-topology"
    )
    weight: float = Field(description="Evidence weight contribution (heuristic, not a probability)")
    owner_service: str = Field(description="Candidate service this evidence attaches to")
    label: str = Field(description="Human-readable description of the evidence")
    node_ids: list[str] = Field(default_factory=list, description="IDs of graph nodes representing this evidence")
    removed: bool = Field(default=False, description="Whether this evidence was perturbed/removed in this scenario")


class HypothesisItem(BaseModel):
    service: str = Field(description="Candidate root-cause service")
    hops: int = Field(description="Upstream hops from alerting service")
    score: float = Field(description="Suspect score (heuristic, not a probability)")
    rank: int = Field(description="Rank among hypotheses (1-indexed)")
    owner: Optional[str] = Field(default=None, description="Current owner of this service")
    evidence: list[EvidenceItem] = Field(default_factory=list, description="Evidence items supporting this suspect")
    score_before: Optional[float] = Field(default=None, description="Score before perturbation (heuristic, not a probability)")
    score_after: Optional[float] = Field(default=None, description="Score after perturbation (heuristic, not a probability)")
    rank_before: Optional[int] = Field(default=None, description="Rank before perturbation")
    rank_after: Optional[int] = Field(default=None, description="Rank after perturbation")


class CriticalEvidenceItem(BaseModel):
    evidence_id: str
    kind: str
    source: str
    owner_service: str
    label: str
    impact_score: float = Field(description="F(e) impact score: Σ importance(h) * |Δscore| (heuristic, not a probability)")


class CriticalSourceItem(BaseModel):
    source: str
    impact_score: float = Field(description="Total impact of this evidence source (heuristic, not a probability)")
    evidence_count: int


class EvidenceShockRequest(BaseModel):
    incident_id: str = Field(description="Incident ID to stress-test")
    remove_evidence_ids: Optional[list[str]] = Field(default=None, description="Specific evidence IDs to perturb/remove")
    remove_sources: Optional[list[str]] = Field(
        default=None, description="Evidence source channels to perturb/remove (e.g. 'incident-history', 'cicd-deploy-log')"
    )
    service: Optional[str] = Field(default=None, description="Optional service to validate against incident")
    symptom: Optional[Symptom] = Field(default=None, description="Optional symptom to validate against incident")


class EvidenceShockResponse(BaseModel):
    incident_id: str
    service: str
    symptom: Symptom
    verdict: Literal["robust", "fragile", "inconclusive"] = Field(
        description="Verdict: robust (top suspect holds), fragile (top suspect flips), or inconclusive (tie within epsilon 0.25)"
    )
    margin_before: Optional[float] = Field(
        default=None,
        description="Score difference between #1 and #2 before perturbation (heuristic, not a probability). Null if fewer than two suspects exist.",
    )
    margin_after: Optional[float] = Field(
        default=None,
        description="Score difference between #1 and #2 after perturbation (heuristic, not a probability). Null if fewer than two suspects exist.",
    )
    top_suspect_before: str = Field(description="Leading hypothesis before perturbation")
    top_suspect_after: str = Field(description="Leading hypothesis after perturbation")
    hypotheses: list[HypothesisItem] = Field(description="Ranked candidate hypotheses with before/after scores")
    critical_evidence: list[CriticalEvidenceItem] = Field(
        default_factory=list, description="Top 5 evidence items by F(e) impact score (heuristic, not a probability)"
    )
    critical_sources: list[CriticalSourceItem] = Field(
        default_factory=list, description="Evidence sources ranked by aggregate impact (heuristic, not a probability)"
    )
    recommendation: str = Field(description="Actionable diagnostic or remediation recommendation based on stress-test")
    graph: GraphPayload = Field(default_factory=GraphPayload, description="Graph visualization payload with Evidence nodes and SUPPORTS edges")


class HypothesisResponse(BaseModel):
    incident_id: str
    service: str
    symptom: Symptom
    hypotheses: list[HypothesisItem] = Field(description="Ranked candidate hypotheses with their supporting evidence items")
    graph: GraphPayload = Field(default_factory=GraphPayload, description="Graph visualization payload with Evidence nodes and SUPPORTS edges")
