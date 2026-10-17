// Fixtures typed against the real contract types (so a contract change breaks the tests at compile time).
// Shapes and values mirror contract/examples/*.json.
import type { ChatResponse, GraphPayload, IncidentDetail, IncidentSummary, OutcomeResponse, TimelineEvent } from "../api/client";
import type { Catalog, OwnerResponse, ReassignResponse } from "../api/client";

export const graphA: GraphPayload = {
  nodes: [
    { id: "inc:INC-045", label: "Incident", name: "INC-045", props: {}, highlight: true, score: null },
    { id: "svc:payments-api", label: "Service", name: "payments-api", props: {}, highlight: true, score: 8.5 },
    { id: "svc:checkout", label: "Service", name: "checkout", props: {}, highlight: false, score: 2 },
  ],
  edges: [{ id: "svc:checkout|DEPENDS_ON|svc:payments-api", source: "svc:checkout", target: "svc:payments-api", type: "DEPENDS_ON", props: {}, highlight: true }],
};

export const graphB: GraphPayload = {
  nodes: [
    { id: "inc:INC-037", label: "Incident", name: "INC-037", props: {}, highlight: true, score: null },
    { id: "svc:redis-cache", label: "Service", name: "redis-cache", props: {}, highlight: true, score: 3 },
    { id: "fix:scale-up-replicas", label: "Fix", name: "scale-up-replicas", props: {}, highlight: false, score: null },
    { id: "svc:order-service", label: "Service", name: "order-service", props: {}, highlight: false, score: 1 },
    { id: "svc:refunds", label: "Service", name: "refunds", props: {}, highlight: false, score: 1 },
  ],
  edges: [],
};

export const inc045: IncidentSummary = {
  id: "INC-045",
  title: "checkout latency spiking",
  severity: "SEV2",
  symptom: "latency",
  status: "open",
  started_at: "2026-10-17T07:00:00Z",
  origin: "payments-api",
  impacted: ["checkout"],
};

export const inc037: IncidentSummary = {
  id: "INC-037",
  title: "order-service latency spiking",
  severity: "SEV3",
  symptom: "latency",
  status: "resolved",
  started_at: "2026-09-11T09:43:00Z",
  origin: "redis-cache",
  impacted: ["order-service", "refunds", "web-frontend"],
};

export const detail045: IncidentDetail = {
  ...inc045,
  resolved_at: null,
  summary: "",
  followed_deploy: { id: "DEP-036", service: "payments-api", version: "v2.3.1", deployed_at: "2026-10-14T04:50:00Z", author: "Asha Menon" },
  attempts: [],
  graph: graphA,
};

export const detail037: IncidentDetail = {
  ...inc037,
  resolved_at: "2026-09-11T10:21:00Z",
  summary: "Root cause in redis-cache (latency). Resolved via scale-up-replicas.",
  followed_deploy: null,
  attempts: [{ id: "ATT-053", fix: "scale-up-replicas", status: "SUCCESS", ts: "2026-09-11T10:13:00Z", engineer: "Vikram Singh", notes: "" }],
  graph: graphB,
};

// Deliberately returned out of order: the panel must show them chronologically.
export const timeline045: TimelineEvent[] = [
  { ts: "2026-10-17T07:00:00Z", type: "incident_opened", text: "Incident opened: checkout latency spiking", node_ids: ["inc:INC-045"] },
  { ts: "2026-10-14T04:50:00Z", type: "deploy", text: "Deploy payments-api v2.3.1 by Asha Menon", node_ids: ["dep:DEP-036"] },
];

export const timeline037: TimelineEvent[] = [
  { ts: "2026-09-11T09:43:00Z", type: "incident_opened", text: "Incident opened: order-service latency spiking", node_ids: ["inc:INC-037"] },
  { ts: "2026-09-11T10:13:00Z", type: "attempt", text: "Vikram Singh tried scale-up-replicas -> SUCCESS", node_ids: [] },
  { ts: "2026-09-11T10:21:00Z", type: "resolved", text: "Incident resolved", node_ids: ["inc:INC-037"] },
];

export const catalog: Catalog = {
  services: [{ name: "payments-api", tier: "tier-2", team: "payments-platform", owner: "Asha Menon" }],
  fixes: [
    { id: "restart-pods", name: "restart-pods", description: "Restart affected pods/instances" },
    { id: "rollback-deploy", name: "rollback-deploy", description: "Roll back to the previous release" },
  ],
  engineers: [
    { id: "asha-menon", name: "Asha Menon", team: "payments-platform" },
    { id: "ravi-iyer", name: "Ravi Iyer", team: "platform" },
  ],
  symptoms: ["latency", "timeout", "5xx", "oom"],
};

export const chatAlert: ChatResponse = {
  session_id: "x",
  reply: "Opened INC-045. Tracing upstream from checkout, the likely origin is payments-api.",
  intent: "alert",
  incident_id: "INC-045",
  tool_calls: [{ name: "create_alert", args: { service: "checkout", symptom: "latency" }, summary: "INC-045; likely origin payments-api" }],
  recalled: ["INC-042: same symptom (latency), checkout was impacted, same origin (payments-api)"],
  graph: graphA,
};

export const outcomeFailed: OutcomeResponse = {
  attempt: { id: "ATT-068", fix: "restart-pods", status: "FAILED", ts: "2026-10-17T07:05:00Z", engineer: "Asha Menon", notes: "still failing" },
  incident: inc045,
  recommendations: [
    { fix: "rollback-deploy", score: 0.833, attempts: 4, successes: 4, rationale: "Worked in 4/4 similar incidents", avoid: false, already_failed_here: false },
    { fix: "restart-pods", score: 0.143, attempts: 5, successes: 0, rationale: "Already failed in this incident", avoid: true, already_failed_here: true },
  ],
  fix_stats: [],
  graph: graphA,
};

export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Ownership fixtures mirror contract/examples/owner_july.json and reassign.json.
export const ownerNow: OwnerResponse = {
  service: "payments-api",
  date: "2026-10-17",
  owner: "Asha Menon",
  valid_from: "2025-11-01",
  valid_to: null,
  history: [{ engineer: "Asha Menon", valid_from: "2025-11-01", valid_to: null }],
};

export const ownerAfterReassign: OwnerResponse = {
  service: "payments-api",
  date: "2026-10-17",
  owner: "Ravi Iyer",
  valid_from: "2026-10-17",
  valid_to: null,
  history: [
    { engineer: "Asha Menon", valid_from: "2025-11-01", valid_to: "2026-10-16" },
    { engineer: "Ravi Iyer", valid_from: "2026-10-17", valid_to: null },
  ],
};

export const ownerJuly: OwnerResponse = { ...ownerAfterReassign, date: "2026-07-15", owner: "Asha Menon", valid_from: "2025-11-01", valid_to: "2026-10-16" };

export const reassigned: ReassignResponse = {
  ...ownerAfterReassign,
  superseded: { engineer: "Asha Menon", valid_from: "2025-11-01", valid_to: "2026-10-16" },
};
