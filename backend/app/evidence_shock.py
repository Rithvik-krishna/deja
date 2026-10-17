"""Evidence Shock Lab — the ProofOps differentiator.

Given a set of suspects (already scored by the API_CONTRACT formula) and their
raw evidence items, this module:

  1. Decomposes each suspect's score into named evidence contributions.
  2. For each evidence item, simulates its removal and re-scores all suspects.
  3. Ranks evidence by F(e) = Σ importance(h) * |score_drop(h, e)|
     where importance(h) = 1 / rank(h).
  4. Identifies whether the diagnosis is robust (top suspect survives all shocks)
     or fragile (at least one shock changes the #1 suspect).

The scoring formula is identical to API_CONTRACT.md so results are consistent
with what the existing /alert endpoint returns. No invented probabilities.

Evidence types (mirrors the three additive components from the contract):
  RECENT_DEPLOY    → contributes +3 to suspect score
  SAME_SYMPTOM     → contributes +count (same_symptom_incidents)
  PROXIMITY        → contributes +1/(hops+1)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# --------------------------------------------------------------------------- #
#  Data structures                                                              #
# --------------------------------------------------------------------------- #

@dataclass
class RawSuspect:
    """Raw inputs for one candidate, before scoring."""
    service: str
    hops: int
    has_recent_deploy: bool
    same_symptom_incidents: int
    deploy_id: Optional[str] = None     # the specific deploy id (if any)
    owner: Optional[str] = None


@dataclass
class EvidenceContrib:
    """One named evidence contribution for a suspect."""
    evidence_id: str         # e.g. "deploy:DEP-012" or "history:payments-api:latency"
    evidence_type: str       # RECENT_DEPLOY | SAME_SYMPTOM | PROXIMITY
    description: str
    weight: float            # how much it contributes to this suspect's score
    source: str              # human-readable provenance


@dataclass
class ScoredSuspect:
    """Fully scored suspect with evidence breakdown."""
    service: str
    hops: int
    score: float
    rank: int
    contribs: list[EvidenceContrib] = field(default_factory=list)
    owner: Optional[str] = None


@dataclass
class ShockScenario:
    """Result of removing one evidence item."""
    evidence_id: str
    evidence_type: str
    description: str
    impact_score: float           # F(e): how much this removal matters overall
    top_suspect_before: str
    top_suspect_after: str
    diagnosis_changed: bool       # True if #1 suspect changes
    is_critical: bool             # True if this is the most impactful evidence
    suspect_deltas: list[dict]    # [{service, score_before, score_after, delta}]


@dataclass
class ShockAnalysis:
    """Full evidence shock analysis for one incident/service/symptom."""
    incident_id: str
    service: str
    symptom: str
    suspects: list[ScoredSuspect]
    scenarios: list[ShockScenario]      # one per unique evidence item, sorted by impact desc
    critical_evidence: Optional[str]    # evidence_id with highest F(e)
    diagnosis_robust: bool              # True if top suspect survives ALL single-item shocks
    robustness_note: str


# --------------------------------------------------------------------------- #
#  Core algorithm                                                               #
# --------------------------------------------------------------------------- #

def _score(has_deploy: bool, same: int, hops: int) -> float:
    """Exact formula from API_CONTRACT.md."""
    return round(3 * (1 if has_deploy else 0) + same + 1 / (hops + 1), 3)


def _build_contribs(raw: RawSuspect) -> list[EvidenceContrib]:
    """Decompose a suspect's score into named evidence contributions."""
    contribs = []

    # PROXIMITY — always present (hops-based, can't be removed)
    prox = round(1 / (raw.hops + 1), 3)
    contribs.append(EvidenceContrib(
        evidence_id=f"proximity:{raw.service}",
        evidence_type="PROXIMITY",
        description=f"{raw.service} is {raw.hops} hop(s) from the affected service",
        weight=prox,
        source="dependency graph",
    ))

    # RECENT_DEPLOY — removable
    if raw.has_recent_deploy:
        contribs.append(EvidenceContrib(
            evidence_id=f"deploy:{raw.deploy_id or raw.service}",
            evidence_type="RECENT_DEPLOY",
            description=f"Recent deploy to {raw.service} within the 168-hour window",
            weight=3.0,
            source=f"deploy {raw.deploy_id}" if raw.deploy_id else "recent deployment record",
        ))

    # SAME_SYMPTOM history — removable
    if raw.same_symptom_incidents > 0:
        contribs.append(EvidenceContrib(
            evidence_id=f"history:{raw.service}:{raw.hops}",
            evidence_type="SAME_SYMPTOM",
            description=f"{raw.same_symptom_incidents} past incident(s) with same symptom originating in {raw.service}",
            weight=float(raw.same_symptom_incidents),
            source="incident history graph",
        ))

    return contribs


def run_shock(incident_id: str, service: str, symptom: str,
              raw_suspects: list[RawSuspect]) -> ShockAnalysis:
    """
    Main entry point.  Takes raw suspect inputs and returns a full ShockAnalysis.
    """
    if not raw_suspects:
        return ShockAnalysis(
            incident_id=incident_id, service=service, symptom=symptom,
            suspects=[], scenarios=[], critical_evidence=None,
            diagnosis_robust=True,
            robustness_note="No suspects to analyse.",
        )

    # --- Step 1: score and rank all suspects ---------------------------------
    scored = []
    for raw in raw_suspects:
        s = _score(raw.has_recent_deploy, raw.same_symptom_incidents, raw.hops)
        scored.append(ScoredSuspect(
            service=raw.service, hops=raw.hops, score=s,
            rank=0, contribs=_build_contribs(raw), owner=raw.owner,
        ))
    scored.sort(key=lambda s: (-s.score, s.service))
    for i, s in enumerate(scored, 1):
        s.rank = i

    top_service = scored[0].service

    # --- Step 2: collect all unique removable evidence items -----------------
    # PROXIMITY is structural (dependency graph) — we treat it as not removable
    # because removing it would mean removing the service from the graph, which
    # is a different kind of question.  We shock RECENT_DEPLOY and SAME_SYMPTOM.
    evidence_pool: dict[str, EvidenceContrib] = {}
    for s in scored:
        for c in s.contribs:
            if c.evidence_type in ("RECENT_DEPLOY", "SAME_SYMPTOM"):
                evidence_pool[c.evidence_id] = c

    # --- Step 3: shock each evidence item ------------------------------------
    scenarios: list[ShockScenario] = []

    for eid, ev in evidence_pool.items():
        # Recompute each suspect without this evidence item
        deltas = []
        f_e = 0.0

        for s in scored:
            score_without = s.score
            for c in s.contribs:
                if c.evidence_id == eid:
                    score_without = round(score_without - c.weight, 3)
            delta = round(s.score - score_without, 3)
            importance = 1.0 / s.rank
            f_e += importance * abs(delta)
            deltas.append({
                "service": s.service,
                "score_before": s.score,
                "score_after": round(score_without, 3),
                "delta": round(-delta, 3),
            })

        # Re-rank after shock to find new top suspect
        deltas_sorted = sorted(deltas, key=lambda d: (-d["score_after"], d["service"]))
        new_top = deltas_sorted[0]["service"]

        scenarios.append(ShockScenario(
            evidence_id=eid,
            evidence_type=ev.evidence_type,
            description=ev.description,
            impact_score=round(f_e, 4),
            top_suspect_before=top_service,
            top_suspect_after=new_top,
            diagnosis_changed=(new_top != top_service),
            is_critical=False,          # set below
            suspect_deltas=deltas_sorted,
        ))

    # --- Step 4: rank scenarios by impact, mark critical --------------------
    scenarios.sort(key=lambda s: (-s.impact_score, s.evidence_id))
    if scenarios:
        scenarios[0].is_critical = True
        critical_evidence = scenarios[0].evidence_id
    else:
        critical_evidence = None

    diagnosis_robust = not any(sc.diagnosis_changed for sc in scenarios)

    if diagnosis_robust:
        robustness_note = (
            f"Diagnosis is ROBUST — {top_service} remains the top suspect "
            f"even after removing any single piece of evidence."
        )
    else:
        fragile_shocks = [sc for sc in scenarios if sc.diagnosis_changed]
        alts = list({sc.top_suspect_after for sc in fragile_shocks})
        robustness_note = (
            f"Diagnosis is FRAGILE — removing {len(fragile_shocks)} evidence item(s) "
            f"changes the #1 suspect. Alternative(s): {', '.join(alts)}. "
            f"Verify the critical evidence before acting."
        )

    return ShockAnalysis(
        incident_id=incident_id,
        service=service,
        symptom=symptom,
        suspects=scored,
        scenarios=scenarios,
        critical_evidence=critical_evidence,
        diagnosis_robust=diagnosis_robust,
        robustness_note=robustness_note,
    )
