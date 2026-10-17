import type { components } from "../../api/types";

export type EvidenceShockResponse = components["schemas"]["EvidenceShockResponse"];
export type HypothesisItem = components["schemas"]["HypothesisItem"];
export type CriticalEvidenceItem = components["schemas"]["CriticalEvidenceItem"];
export type CriticalSourceItem = components["schemas"]["CriticalSourceItem"];
export type EvidenceItem = components["schemas"]["EvidenceItem"];

/**
 * Fixture data demonstrating the planted story:
 * 1. payments-api has recent deploy DEP-036 (+3) and 4 similar latency incidents (+4) -> 7.5
 * 2. inventory has deploy DEP-035 (+3) and 1 past incident (+1) -> 4.5
 * 3. Perturbing 'incident-history' leads to an INCONCLUSIVE tie between payments-api (3.5) and inventory (3.5).
 * 4. Perturbing 'cicd-deploy-log' keeps diagnosis ROBUST (payments-api 4.5 vs checkout 2.0).
 */
export const FIXTURE_SHOCK_INCONCLUSIVE: EvidenceShockResponse = {
  incident_id: "INC-045",
  service: "checkout",
  symptom: "latency",
  verdict: "inconclusive",
  margin_before: 3.0,
  margin_after: 0.0,
  top_suspect_before: "payments-api",
  top_suspect_after: "payments-api",
  hypotheses: [
    {
      service: "payments-api",
      hops: 1,
      score: 3.5,
      rank: 1,
      owner: "Asha Menon",
      score_before: 7.5,
      score_after: 3.5,
      rank_before: 1,
      rank_after: 1,
      evidence: [
        {
          id: "ev:topology:payments-api",
          kind: "topology",
          source: "service-topology",
          weight: 0.5,
          owner_service: "payments-api",
          label: "Upstream dependency: payments-api (1 hops)",
          node_ids: ["svc:payments-api"],
          removed: false,
        },
        {
          id: "ev:deploy:payments-api",
          kind: "deploy",
          source: "cicd-deploy-log",
          weight: 3.0,
          owner_service: "payments-api",
          label: "Recent deploy on payments-api: v2.3.1 by Asha Menon",
          node_ids: ["dep:DEP-036"],
          removed: false,
        },
        {
          id: "ev:history:INC-042",
          kind: "history",
          source: "incident-history",
          weight: 1.0,
          owner_service: "payments-api",
          label: "Past incident INC-042 (payments-api latency)",
          node_ids: ["inc:INC-042"],
          removed: true,
        },
      ],
    },
    {
      service: "inventory",
      hops: 1,
      score: 3.5,
      rank: 2,
      owner: "Kiran Rao",
      score_before: 4.5,
      score_after: 3.5,
      rank_before: 2,
      rank_after: 2,
      evidence: [
        {
          id: "ev:topology:inventory",
          kind: "topology",
          source: "service-topology",
          weight: 0.5,
          owner_service: "inventory",
          label: "Upstream dependency: inventory (1 hops)",
          node_ids: ["svc:inventory"],
          removed: false,
        },
        {
          id: "ev:deploy:inventory",
          kind: "deploy",
          source: "cicd-deploy-log",
          weight: 3.0,
          owner_service: "inventory",
          label: "Recent deploy on inventory: v4.8.0 by Kiran Rao",
          node_ids: ["dep:DEP-035"],
          removed: false,
        },
      ],
    },
    {
      service: "checkout",
      hops: 0,
      score: 1.0,
      rank: 3,
      owner: "Sana Khan",
      score_before: 2.0,
      score_after: 1.0,
      rank_before: 3,
      rank_after: 3,
      evidence: [],
    },
  ],
  critical_evidence: [
    {
      evidence_id: "ev:deploy:payments-api",
      kind: "deploy",
      source: "cicd-deploy-log",
      owner_service: "payments-api",
      label: "Recent deploy on payments-api (v2.3.1)",
      impact_score: 1.42,
    },
    {
      evidence_id: "ev:history:INC-042",
      kind: "history",
      source: "incident-history",
      owner_service: "payments-api",
      label: "Past incident INC-042 (payments-api latency)",
      impact_score: 0.47,
    },
  ],
  critical_sources: [
    {
      source: "incident-history",
      impact_score: 1.89,
      evidence_count: 5,
    },
    {
      source: "cicd-deploy-log",
      impact_score: 1.42,
      evidence_count: 2,
    },
    {
      source: "service-topology",
      impact_score: 0.74,
      evidence_count: 5,
    },
  ],
  recommendation:
    "Diagnosis is INCONCLUSIVE: candidate hypotheses (payments-api, inventory) are tied within margin 0.00 (<= 0.25). Verify incident-history data before remediating.",
};
