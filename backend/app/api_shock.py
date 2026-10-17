"""API routes for Evidence Shock Lab (ProofOps layer)."""
from fastapi import APIRouter, Depends

from .deps import get_engine
from .engine import Engine
from .schemas_shock import (
    EvidenceShockRequest,
    EvidenceShockResponse,
    HypothesisResponse,
)
from .shock import EvidenceProvider, build_shock_graph, evaluate_shock

router = APIRouter(tags=["insights"])


@router.post(
    "/insights/evidence-shock",
    response_model=EvidenceShockResponse,
    summary="Stress-test incident diagnosis via counterfactual evidence perturbation",
    description=(
        "Simulates removal of evidence items or entire evidence source channels. "
        "Calculates before/after scores, margin, and verdict (robust | fragile | inconclusive) "
        "using tie epsilon 0.25 without arbitrary tie-breaking. All scores are heuristic, not a probability."
    ),
)
def post_evidence_shock(req: EvidenceShockRequest, engine: Engine = Depends(get_engine)):
    provider = EvidenceProvider(engine)
    service, symptom, hypotheses = provider.get_hypotheses(
        incident_id=req.incident_id,
        service_override=req.service,
        symptom_override=req.symptom,
    )
    return evaluate_shock(
        incident_id=req.incident_id,
        service=service,
        symptom=symptom,
        hypotheses=hypotheses,
        remove_evidence_ids=req.remove_evidence_ids,
        remove_sources=req.remove_sources,
    )


@router.get(
    "/insights/hypotheses/{incident_id}",
    response_model=HypothesisResponse,
    summary="Retrieve ranked candidate hypotheses and supporting evidence items for an incident",
    description=(
        "Returns candidates with upstream hops, scores, and deterministic evidence items. "
        "All scores are heuristic, not a probability."
    ),
)
def get_hypotheses(incident_id: str, engine: Engine = Depends(get_engine)):
    provider = EvidenceProvider(engine)
    service, symptom, hypotheses = provider.get_hypotheses(incident_id=incident_id)

    # Calculate baseline scores and rank
    for h in hypotheses:
        h.score = round(sum(e.weight for e in h.evidence), 3)
    hypotheses.sort(key=lambda h: (-h.score, h.service))
    for rank, h in enumerate(hypotheses, 1):
        h.rank = rank

    top_service = hypotheses[0].service if hypotheses else ""
    graph = build_shock_graph(hypotheses, top_service)

    return HypothesisResponse(
        incident_id=incident_id,
        service=service,
        symptom=symptom,
        hypotheses=hypotheses,
        graph=graph,
    )
