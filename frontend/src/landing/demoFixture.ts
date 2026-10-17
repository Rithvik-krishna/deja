import type { GraphPayload } from "../api/client";

export interface DemoStepDefinition {
  stepNumber: number;
  title: string;
  badge: string;
  caption: string;
  explanation: string;
  focusIds: string[];
  perturbedEvidenceIds?: string[];
  shockDetails?: {
    verdict: string;
    beforeScore: number;
    afterScore: number;
    margin: number;
    note: string;
  };
  recoveryDetails?: {
    owner: string;
    fixAction: string;
    stats: string;
  };
}

export const LANDING_DEMO_PAYLOAD: GraphPayload = {
  nodes: [
    {
      id: "checkout",
      name: "checkout",
      label: "Service",
      score: 18.0,
      highlight: false,
      props: { tier: "tier-1", critical: true },
    },
    {
      id: "payments-api",
      name: "payments-api",
      label: "Service",
      score: 33.0,
      highlight: false,
      props: { tier: "tier-2", fan_in: 9, incident_count: 8, risk_rank: 1 },
    },
    {
      id: "inventory",
      name: "inventory",
      label: "Service",
      score: 21.0,
      highlight: false,
      props: { tier: "tier-2", fan_in: 9 },
    },
    {
      id: "redis-cache",
      name: "redis-cache",
      label: "Service",
      score: 20.0,
      highlight: false,
      props: { tier: "tier-2", fan_in: 14 },
    },
    {
      id: "fraud-check",
      name: "fraud-check",
      label: "Service",
      score: 16.0,
      highlight: false,
      props: { tier: "tier-2", fan_in: 10 },
    },
    {
      id: "order-service",
      name: "order-service",
      label: "Service",
      score: 12.0,
      highlight: false,
      props: { tier: "tier-1", fan_in: 4 },
    },
    {
      id: "auth-service",
      name: "auth-service",
      label: "Service",
      score: 14.0,
      highlight: false,
      props: { tier: "tier-1", fan_in: 8 },
    },
    {
      id: "INC-042",
      name: "INC-042: Checkout Latency Spiking",
      label: "Incident",
      score: null,
      highlight: false,
      props: { severity: "SEV1", status: "open", symptom: "p99 latency > 2400ms" },
    },
    {
      id: "INC-039",
      name: "INC-039: Gateway Timeout",
      label: "Incident",
      score: null,
      highlight: false,
      props: { severity: "SEV2", status: "resolved", resolved_by: "rollback" },
    },
    {
      id: "dep:DEP-036",
      name: "Deploy v2.3.1 (payments-api)",
      label: "Deploy",
      score: null,
      highlight: false,
      props: { version: "v2.3.1", commit: "f9b2d8", deployed_at: "2026-10-14T18:22:00Z" },
    },
    {
      id: "eng:asha",
      name: "Asha Menon",
      label: "Engineer",
      score: null,
      highlight: false,
      props: { role: "Staff Engineer", on_call: true, team: "Payments Core" },
    },
    {
      id: "eng:ravi",
      name: "Ravi Iyer",
      label: "Engineer",
      score: null,
      highlight: false,
      props: { role: "Senior SRE", team: "Platform Ops" },
    },
    {
      id: "ev:deploy:payments-api",
      name: "Deploy v2.3.1 log evidence",
      label: "Evidence",
      score: null,
      highlight: false,
      props: { source: "cicd-deploy-log", weight: 3.0, summary: "Recent deploy correlated with latency spike" },
    },
    {
      id: "ev:topo:checkout",
      name: "Direct checkout upstream evidence",
      label: "Evidence",
      score: null,
      highlight: false,
      props: { source: "service-topology", weight: 1.5, summary: "checkout -> payments-api direct dependency" },
    },
    {
      id: "fix:restart",
      name: "Restart payments-api pods",
      label: "Fix",
      score: null,
      highlight: false,
      props: { command: "kubectl rollout restart deployment/payments-api" },
    },
    {
      id: "fix:rollback",
      name: "Rollback to v2.3.0",
      label: "Fix",
      score: null,
      highlight: false,
      props: { command: "helm rollback payments-api 35" },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "checkout",
      target: "payments-api",
      type: "DEPENDS_ON",
      highlight: false,
      props: {},
    },
    {
      id: "e2",
      source: "payments-api",
      target: "inventory",
      type: "DEPENDS_ON",
      highlight: false,
      props: {},
    },
    {
      id: "e3",
      source: "payments-api",
      target: "redis-cache",
      type: "DEPENDS_ON",
      highlight: false,
      props: {},
    },
    {
      id: "e4",
      source: "payments-api",
      target: "fraud-check",
      type: "DEPENDS_ON",
      highlight: false,
      props: {},
    },
    {
      id: "e5",
      source: "order-service",
      target: "payments-api",
      type: "DEPENDS_ON",
      highlight: false,
      props: {},
    },
    {
      id: "e6",
      source: "auth-service",
      target: "redis-cache",
      type: "DEPENDS_ON",
      highlight: false,
      props: {},
    },
    {
      id: "e7",
      source: "INC-042",
      target: "checkout",
      type: "IMPACTED",
      highlight: false,
      props: {},
    },
    {
      id: "e8",
      source: "INC-042",
      target: "payments-api",
      type: "ORIGINATED_IN",
      highlight: false,
      props: {},
    },
    {
      id: "e9",
      source: "dep:DEP-036",
      target: "payments-api",
      type: "TO",
      highlight: false,
      props: {},
    },
    {
      id: "e10",
      source: "dep:DEP-036",
      target: "eng:asha",
      type: "AUTHORED_BY",
      highlight: false,
      props: {},
    },
    {
      id: "e11",
      source: "ev:deploy:payments-api",
      target: "payments-api",
      type: "SUPPORTS",
      highlight: false,
      props: { weight: 3.0 },
    },
    {
      id: "e12",
      source: "ev:topo:checkout",
      target: "checkout",
      type: "SUPPORTS",
      highlight: false,
      props: { weight: 1.5 },
    },
    {
      id: "e13",
      source: "INC-042",
      target: "fix:restart",
      type: "ATTEMPTED",
      highlight: false,
      props: { status: "FAILED" },
    },
    {
      id: "e14",
      source: "INC-042",
      target: "fix:rollback",
      type: "ATTEMPTED",
      highlight: false,
      props: { status: "SUCCESS" },
    },
  ],
};

export const LANDING_DEMO_STEPS: DemoStepDefinition[] = [
  {
    stepNumber: 1,
    title: "System Overview",
    badge: "Step 1 of 7",
    caption: "Déjà maps the relationships across your engineering system.",
    explanation:
      "Unlike disjointed dashboards, Déjà unifies services, active incidents, releases, owners, and past fix outcomes in a live knowledge graph.",
    focusIds: [],
  },
  {
    stepNumber: 2,
    title: "Incident Detected",
    badge: "Step 2 of 7",
    caption: "An incident appears. Déjà starts tracing the connected evidence.",
    explanation:
      "INC-042 triggers on the checkout tier. Déjà begins traversing causal paths to uncover upstream dependencies rather than stopping at the symptom.",
    focusIds: ["INC-042", "checkout"],
  },
  {
    stepNumber: 3,
    title: "Trace the Change",
    badge: "Step 3 of 7",
    caption: "Follow the dependency graph to identify the relevant change.",
    explanation:
      "Tracing upstream through checkout dependency leads straight to payments-api and its recent v2.3.1 deployment authored by Asha Menon.",
    focusIds: ["payments-api", "dep:DEP-036"],
  },
  {
    stepNumber: 4,
    title: "Inspect the Evidence",
    badge: "Step 4 of 7",
    caption: "Connect current signals with evidence from previous incidents.",
    explanation:
      "Déjà synthesizes CI/CD logs, telemetry correlations, and historical patterns from INC-039 to produce ranked hypothesis scores.",
    focusIds: ["ev:deploy:payments-api", "ev:topo:checkout", "INC-039"],
  },
  {
    stepNumber: 5,
    title: "Evidence Shock",
    badge: "Step 5 of 7",
    caption: "Test whether the leading explanation survives when evidence changes.",
    explanation:
      "By perturbing the CI/CD deploy evidence, Déjà stress-tests the hypothesis: scores tie at 4.5 vs 4.5, proving the diagnosis is sensitive to this channel.",
    focusIds: ["ev:deploy:payments-api", "payments-api"],
    perturbedEvidenceIds: ["ev:deploy:payments-api"],
    shockDetails: {
      verdict: "INCONCLUSIVE",
      beforeScore: 7.5,
      afterScore: 4.5,
      margin: 0.0,
      note: "Removing CI/CD deploy log flips leading diagnosis from robust to inconclusive (4.5 vs 4.5 tie).",
    },
  },
  {
    stepNumber: 6,
    title: "Ownership & Recovery",
    badge: "Step 6 of 7",
    caption: "Connect the investigation to ownership and recovery.",
    explanation:
      "Déjà checks institutional memory: restarting pods failed 4/4 previous times; rolling back resolved all 4 incidents. Owner Asha Menon is alerted.",
    focusIds: ["eng:asha", "fix:rollback", "fix:restart"],
    recoveryDetails: {
      owner: "Asha Menon (Payments Core)",
      fixAction: "Rollback to v2.3.0",
      stats: "Rollback succeeded 4/4 times (100%). Restart-pods failed 4/4 times (0%).",
    },
  },
  {
    stepNumber: 7,
    title: "Unified Synthesis",
    badge: "Step 7 of 7",
    caption: "One connected view of incidents, evidence, and service relationships.",
    explanation:
      "From detection through causal graph traversal, counterfactual stress-testing, and institutional memory recall in seconds.",
    focusIds: ["checkout", "payments-api", "INC-042", "dep:DEP-036", "fix:rollback"],
  },
];
