// Typed client for the Deja API. Types are generated from contract/openapi.json (see README -> "Regenerate types").
// Works against the mock engine (MODE=mock) and the Neo4j engine (MODE=live) with zero changes.
import type { components } from "./types";

type S = components["schemas"];
export type GraphPayload = S["GraphPayload"];
export type GraphNode = S["GraphNode"];
export type GraphEdge = S["GraphEdge"];
export type RiskResponse = S["RiskResponse"];
export type BlastResponse = S["BlastResponse"];
export type AlertResponse = S["AlertResponse"];
export type OutcomeResponse = S["OutcomeResponse"];
export type OwnerResponse = S["OwnerResponse"];
export type ReassignResponse = S["ReassignResponse"];
export type IncidentSummary = S["IncidentSummary"];
export type IncidentDetail = S["IncidentDetail"];
export type TimelineEvent = S["TimelineEvent"];
export type SimilarIncident = S["SimilarIncident"];
export type FixStat = S["FixStat"];
export type ChatResponse = S["ChatResponse"];
export type Catalog = S["Catalog"];
export type Symptom = S["AlertRequest"]["symptom"];
export type EvidenceShockRequest = S["EvidenceShockRequest"];
export type EvidenceShockResponse = S["EvidenceShockResponse"];
export type HypothesisResponse = S["HypothesisResponse"];
export type HypothesisItem = S["HypothesisItem"];
export type EvidenceItem = S["EvidenceItem"];
export type CriticalEvidenceItem = S["CriticalEvidenceItem"];
export type CriticalSourceItem = S["CriticalSourceItem"];

const BASE: string = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:8000";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`${res.status} ${path}: ${(body as any).detail ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}
const q = (o: Record<string, string | number | undefined>) =>
  "?" + Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
const post = <T>(path: string, body: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => call<S["Health"]>("/health"),
  catalog: () => call<Catalog>("/catalog"),
  risk: (windowDays = 180, limit = 10) => call<RiskResponse>("/graph/risk" + q({ window_days: windowDays, limit })),
  blast: (service: string, depth = 3) => call<BlastResponse>(`/graph/blast/${service}` + q({ depth })),
  similarIncidents: (service: string, symptom?: Symptom, origin?: string) =>
    call<SimilarIncident[]>("/insights/similar-incidents" + q({ service, symptom, origin })),
  fixStats: (service?: string, symptom?: Symptom) => call<FixStat[]>("/insights/fix-stats" + q({ service, symptom })),
  owner: (service: string, date?: string) => call<OwnerResponse>("/owner" + q({ service, date })),
  reassign: (service: string, engineer: string, effectiveDate?: string) =>
    post<ReassignResponse>("/owner", { service, engineer, effective_date: effectiveDate }),
  alert: (service: string, symptom: Symptom, severity: "SEV1" | "SEV2" | "SEV3" = "SEV2") =>
    post<AlertResponse>("/alert", { service, symptom, severity }),
  outcome: (incident_id: string, fix: string, status: "SUCCESS" | "FAILED", notes = "") =>
    post<OutcomeResponse>("/outcome", { incident_id, fix, status, notes }),
  incidents: (status?: "open" | "resolved") => call<IncidentSummary[]>("/incidents" + q({ status })),
  incident: (id: string) => call<IncidentDetail>(`/incidents/${id}`),
  timeline: (id: string) => call<TimelineEvent[]>(`/incidents/${id}/timeline`),
  chat: (session_id: string, message: string) => post<ChatResponse>("/chat", { session_id, message }),
  wipeSession: (session_id: string) => post<S["WipeResponse"]>("/sessions/wipe", { session_id }),
  resetDemo: () => post<S["DemoResetResponse"]>("/demo/reset", {}),
  hypotheses: (incidentId: string) =>
    call<HypothesisResponse>(`/insights/hypotheses/${encodeURIComponent(incidentId)}`),
  evidenceShock: (
    reqOrIncidentId: string | EvidenceShockRequest,
    removeSources?: string[],
    removeEvidenceIds?: string[],
    service?: string,
    symptom?: Symptom
  ) => {
    const body: EvidenceShockRequest =
      typeof reqOrIncidentId === "string"
        ? {
            incident_id: reqOrIncidentId,
            remove_sources: removeSources,
            remove_evidence_ids: removeEvidenceIds,
            service,
            symptom,
          }
        : reqOrIncidentId;
    return post<EvidenceShockResponse>("/insights/evidence-shock", body);
  },
};
