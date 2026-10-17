"""Pure logic, scoring module, and EvidenceProvider for Evidence Shock Lab (ProofOps layer).

All scores, margins, and F(e) values in this module are heuristics derived from
graph topological structure and historical incident frequencies, NOT statistical probabilities.
"""
import copy
from typing import Optional

from .clock import parse_dt
from .engine import BadRequest, Engine
from .schemas import GraphEdge, GraphNode, GraphPayload, Symptom
from .schemas_shock import (
    CriticalEvidenceItem,
    CriticalSourceItem,
    EvidenceItem,
    EvidenceShockResponse,
    HypothesisItem,
    HypothesisResponse,
)

TIE_EPSILON = 0.25


class EvidenceProvider:
    """Derives deterministic EvidenceItem lists directly from the graph engine.

    Uses graph topology, CI/CD deploys, and strictly earlier historical incidents.
    Never invents or fabricates evidence.
    """

    def __init__(self, engine: Engine):
        self.engine = engine

    def get_hypotheses(
        self,
        incident_id: str,
        service_override: Optional[str] = None,
        symptom_override: Optional[Symptom] = None,
    ) -> tuple[str, Symptom, list[HypothesisItem]]:
        # 1. Resolve target incident (raises NotFound -> HTTP 404 if unknown)
        inc = self.engine.incident(incident_id)

        # 2. Determine alerting service where symptom was observed
        alerting_service = inc.impacted[0] if inc.impacted else inc.origin
        valid_services = {alerting_service, inc.origin} | set(inc.impacted)

        # 3. Validate optional filters (conflict -> HTTP 400 BadRequest)
        if service_override is not None:
            if service_override not in valid_services:
                raise BadRequest(f"service '{service_override}' does not match incident '{incident_id}'")

        if symptom_override is not None:
            if symptom_override != inc.symptom:
                raise BadRequest(f"symptom '{symptom_override}' does not match incident '{incident_id}'")
            symptom = symptom_override
        else:
            symptom = inc.symptom

        t = parse_dt(inc.started_at)
        suspects = self.engine._suspects(alerting_service, symptom, t)

        hypotheses: list[HypothesisItem] = []
        for cand in suspects:
            evidence_items: list[EvidenceItem] = []

            # (A) Topology evidence: ev:topology:<service>, weight = round(1 / (hops + 1), 3)
            topo_weight = round(1.0 / (cand.hops + 1), 3)
            evidence_items.append(
                EvidenceItem(
                    id=f"ev:topology:{cand.service}",
                    kind="topology",
                    source="service-topology",
                    weight=topo_weight,
                    owner_service=cand.service,
                    label=f"Upstream dependency: {cand.service} ({cand.hops} hops)",
                    node_ids=[f"svc:{cand.service}"],
                )
            )

            # (B) Deploy evidence: ev:deploy:<service>, weight = 3.0
            if cand.recent_deploys:
                dep = cand.recent_deploys[0]
                evidence_items.append(
                    EvidenceItem(
                        id=f"ev:deploy:{cand.service}",
                        kind="deploy",
                        source="cicd-deploy-log",
                        weight=3.0,
                        owner_service=cand.service,
                        label=f"Recent deploy on {cand.service}: {dep.version} by {dep.author}",
                        node_ids=[f"dep:{dep.id}"],
                    )
                )

            # (C) History evidence: ev:history:<INC-id>, weight = 1.0 each
            # Query similar incidents and apply strict temporal filtering:
            # - Origin matches candidate
            # - Symptom matches target
            # - Service relevance: cand.service == alerting_service or alerting_service in past.impacted
            # - Not target incident itself (past.id != inc.id)
            # - Formally require t_historical < t_target (started_at strictly before target incident)
            # - Deduplicate without changing score
            sims = self.engine.similar_incidents(alerting_service, symptom, limit=50, origin=cand.service)
            seen_ids = set()
            for sim in sims:
                past = sim.incident
                if past.id == inc.id:
                    continue  # exclude the incident itself
                if parse_dt(past.started_at) >= t:
                    continue  # exclude future or concurrent incidents (must be t_hist < t_target)
                if past.origin != cand.service:
                    continue
                if past.symptom != symptom:
                    continue
                if not (cand.service == alerting_service or alerting_service in past.impacted):
                    continue
                if past.id in seen_ids:
                    continue
                seen_ids.add(past.id)

                evidence_items.append(
                    EvidenceItem(
                        id=f"ev:history:{past.id}",
                        kind="history",
                        source="incident-history",
                        weight=1.0,
                        owner_service=cand.service,
                        label=f"Past incident {past.id} ({cand.service} {symptom})",
                        node_ids=[f"inc:{past.id}"],
                    )
                )

            hypotheses.append(
                HypothesisItem(
                    service=cand.service,
                    hops=cand.hops,
                    score=cand.score,
                    rank=0,
                    owner=cand.owner,
                    evidence=evidence_items,
                )
            )

        return alerting_service, symptom, hypotheses


def score_hypotheses_baseline(hypotheses: list[HypothesisItem]) -> list[HypothesisItem]:
    """Pure function calculating baseline scores and ranks from evidence items."""
    for h in hypotheses:
        h.score_before = round(sum(e.weight for e in h.evidence), 3)
        h.score = h.score_before
    hypotheses.sort(key=lambda h: (-h.score, h.service))
    for rank, h in enumerate(hypotheses, 1):
        h.rank = rank
        h.rank_before = rank
    return hypotheses


def build_shock_graph(hypotheses: list[HypothesisItem], top_service: str) -> GraphPayload:
    """Builds a GraphPayload highlighting Service hypotheses and Evidence nodes."""
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
    seen_nodes = set()
    seen_edges = set()

    for h in hypotheses:
        s_id = f"svc:{h.service}"
        if s_id not in seen_nodes:
            seen_nodes.add(s_id)
            nodes.append(
                GraphNode(
                    id=s_id,
                    label="Service",
                    name=h.service,
                    highlight=(h.service == top_service),
                    score=h.score_after if h.score_after is not None else h.score,
                )
            )

        for e in h.evidence:
            if e.id not in seen_nodes:
                seen_nodes.add(e.id)
                nodes.append(
                    GraphNode(
                        id=e.id,
                        label="Evidence",
                        name=e.label,
                        highlight=e.removed or (h.service == top_service),
                        props={"removed": e.removed, "kind": e.kind, "source": e.source, "weight": e.weight},
                    )
                )

            edge_key = (e.id, s_id, "SUPPORTS")
            if edge_key not in seen_edges:
                seen_edges.add(edge_key)
                eid = f"{e.id}|SUPPORTS|{s_id}"
                edges.append(
                    GraphEdge(
                        id=eid,
                        source=e.id,
                        target=s_id,
                        type="SUPPORTS",
                        highlight=(h.service == top_service and not e.removed),
                        props={"weight": e.weight},
                    )
                )

    return GraphPayload(nodes=nodes, edges=edges)


def evaluate_shock(
    incident_id: str,
    service: str,
    symptom: Symptom,
    hypotheses: list[HypothesisItem],
    remove_evidence_ids: Optional[list[str]] = None,
    remove_sources: Optional[list[str]] = None,
) -> EvidenceShockResponse:
    """Pure scoring module operating over EvidenceItem lists.

    No database calls, Neo4j queries, or external mutation.
    Calculates before/after scores, sensitivity F(E), critical evidence,
    critical sources, and verdicts with tie epsilon 0.25.
    """
    # Create working copy to avoid mutating input caller state
    hyps = copy.deepcopy(hypotheses)
    rem_ids = set(remove_evidence_ids or [])
    rem_sources = set(remove_sources or [])

    # 1. Baseline scoring: baseline_score(h) = sum(weight(e) for e in evidence(h))
    for h in hyps:
        h.score_before = round(sum(e.weight for e in h.evidence), 3)

    total_baseline = sum(h.score_before for h in hyps)
    importance_map: dict[str, float] = {}
    for h in hyps:
        if total_baseline > 0:
            importance_map[h.service] = h.score_before / total_baseline
        else:
            importance_map[h.service] = 1.0 / len(hyps) if hyps else 0.0

    sorted_before = sorted(hyps, key=lambda h: (-h.score_before, h.service))
    for rank, h in enumerate(sorted_before, 1):
        h.rank_before = rank

    top_before = sorted_before[0].service if sorted_before else ""
    if len(sorted_before) > 1:
        margin_before = round(sorted_before[0].score_before - sorted_before[1].score_before, 3)
    else:
        margin_before = None

    # 2. Perturbation / Shock scoring
    # Remove union of remove_evidence_ids and remove_sources
    for h in hyps:
        for e in h.evidence:
            e.removed = (e.id in rem_ids) or (e.source in rem_sources)
        h.score_after = round(sum(e.weight for e in h.evidence if not e.removed), 3)

    sorted_after = sorted(hyps, key=lambda h: (-h.score_after, h.service))
    for rank, h in enumerate(sorted_after, 1):
        h.rank_after = rank
        h.rank = rank
        h.score = h.score_after

    top_after = sorted_after[0].service if sorted_after else ""
    if len(sorted_after) > 1:
        margin_after = round(sorted_after[0].score_after - sorted_after[1].score_after, 3)
    else:
        margin_after = None

    # 3. Verdict determination with tie epsilon 0.25
    # Decision Precedence:
    # 1. Empty hypotheses -> inconclusive
    # 2. margin_after <= TIE_EPSILON -> inconclusive (top candidates indistinguishable or tied)
    # 3. top_after != top_before -> fragile (leading hypothesis changed)
    # 4. top score is zero -> inconclusive (all supporting evidence wiped)
    # 5. Otherwise -> robust (leading hypothesis clearly holds ahead)
    if not sorted_after:
        verdict = "inconclusive"
    elif margin_after is not None and margin_after <= TIE_EPSILON:
        verdict = "inconclusive"
    elif top_after != top_before:
        verdict = "fragile"
    elif sorted_after[0].score_after == 0:
        verdict = "inconclusive"
    else:
        verdict = "robust"

    # 4. Critical Evidence: F(e) = Σ importance(h) * |Δscore(h, e)|
    # For individual item e, removing only e reduces its owner suspect score by e.weight
    evidence_by_id: dict[str, EvidenceItem] = {}
    f_e_map: dict[str, float] = {}
    for h in hyps:
        imp = importance_map.get(h.service, 0.0)
        for e in h.evidence:
            evidence_by_id[e.id] = e
            f_e_map[e.id] = f_e_map.get(e.id, 0.0) + imp * e.weight

    # Rank critical evidence by individual impact descending, tie-break by evidence ID for display determinism
    sorted_evidence = sorted(f_e_map.items(), key=lambda kv: (-kv[1], kv[0]))
    critical_evidence: list[CriticalEvidenceItem] = []
    for eid, score in sorted_evidence[:5]:
        item = evidence_by_id[eid]
        critical_evidence.append(
            CriticalEvidenceItem(
                evidence_id=eid,
                kind=item.kind,
                source=item.source,
                owner_service=item.owner_service,
                label=item.label,
                impact_score=round(score, 4),
            )
        )

    # 5. Critical Sources: ranked by aggregate impact F(source)
    # For each source: remove all evidence of that source, recompute scores, compute F(src)
    distinct_sources = sorted({e.source for h in hyps for e in h.evidence})
    source_impacts: list[tuple[str, float, int]] = []
    for src in distinct_sources:
        f_src = 0.0
        ev_count = 0
        for h in hyps:
            imp = importance_map.get(h.service, 0.0)
            delta = sum(e.weight for e in h.evidence if e.source == src)
            ev_count += sum(1 for e in h.evidence if e.source == src)
            f_src += imp * delta
        source_impacts.append((src, round(f_src, 4), ev_count))

    # Rank sources by aggregate impact descending, tie-break by source name for display determinism
    source_impacts.sort(key=lambda item: (-item[1], item[0]))
    critical_sources: list[CriticalSourceItem] = [
        CriticalSourceItem(
            source=src,
            impact_score=impact,
            evidence_count=count,
        )
        for src, impact, count in source_impacts
    ]

    # 6. Recommendation from fixed template table
    recommendation = generate_recommendation(
        verdict=verdict,
        top_before=top_before,
        top_after=top_after,
        margin_after=margin_after,
        hypotheses=sorted_after,
        critical_evidence=critical_evidence,
        critical_sources=critical_sources,
    )

    # 7. Graph visualization payload
    graph = build_shock_graph(sorted_after, top_after)

    return EvidenceShockResponse(
        incident_id=incident_id,
        service=service,
        symptom=symptom,
        verdict=verdict,
        margin_before=margin_before,
        margin_after=margin_after,
        top_suspect_before=top_before,
        top_suspect_after=top_after,
        hypotheses=sorted_after,
        critical_evidence=critical_evidence,
        critical_sources=critical_sources,
        recommendation=recommendation,
        graph=graph,
    )


def generate_recommendation(
    verdict: str,
    top_before: str,
    top_after: str,
    margin_after: Optional[float],
    hypotheses: list[HypothesisItem],
    critical_evidence: list[CriticalEvidenceItem],
    critical_sources: list[CriticalSourceItem],
) -> str:
    """Fixed deterministic template table for diagnostic and remediation actions."""
    margin_str = f"{margin_after}" if margin_after is not None else "null"
    if verdict == "inconclusive":
        top_score = hypotheses[0].score_after if hypotheses else 0.0
        tied = [h.service for h in hypotheses if abs(h.score_after - top_score) <= TIE_EPSILON]
        src_name = critical_sources[0].source if critical_sources else "independent telemetry"
        return (
            f"Diagnosis is INCONCLUSIVE: candidate hypotheses ({', '.join(tied)}) are tied "
            f"within margin {margin_str} (<= {TIE_EPSILON}). Collect additional independent evidence "
            f"from {src_name} before committing to a root cause."
        )
    elif verdict == "fragile":
        crit_label = critical_evidence[0].label if critical_evidence else "critical observation"
        return (
            f"Diagnosis is FRAGILE: removing critical evidence changes leading hypothesis from "
            f"{top_before} to {top_after} (margin={margin_str}). Investigate the evidence responsible for "
            f"the ranking change ({crit_label}) before taking disruptive action."
        )
    else:  # robust
        top_h = hypotheses[0] if hypotheses else None
        has_deploy = any(e.kind == "deploy" and not e.removed for e in (top_h.evidence if top_h else []))
        owner = top_h.owner if top_h and top_h.owner else "on-call owner"
        if has_deploy:
            return (
                f"Diagnosis is ROBUST (margin={margin_str}): retain leading hypothesis {top_after} "
                f"while preserving supporting evidence trail. High-confidence remediation: rollback recent deploy "
                f"on {top_after} and notify {owner}."
            )
        else:
            return (
                f"Diagnosis is ROBUST (margin={margin_str}): retain leading hypothesis {top_after} "
                f"while preserving supporting evidence trail. Inspect upstream metrics on {top_after} "
                f"and notify {owner}."
            )
