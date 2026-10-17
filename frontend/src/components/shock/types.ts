import type { EvidenceShockResponse } from "../../api/client";

/** One completed stress test. Held in React state only: it is session-local and gone after a reload. */
export interface ShockRun {
  seq: number;
  incidentId: string;
  mode: "manual" | "auto";
  /** What was asked for (the request), as opposed to what the response says was removed. */
  removedIds: string[];
  removedSources: string[];
  response: EvidenceShockResponse;
}

// Friendly names for the source channels the contract currently lists. Unknown sources are shown as returned.
const SOURCE_LABELS: Record<string, string> = {
  "cicd-deploy-log": "Recent deployments",
  "incident-history": "Historical incidents",
  "service-topology": "Service topology",
};
const SOURCE_ORDER = Object.keys(SOURCE_LABELS);

export const sourceLabel = (source: string): string => SOURCE_LABELS[source] ?? source;
export const compareSources = (a: string, b: string): number => {
  const ia = SOURCE_ORDER.indexOf(a);
  const ib = SOURCE_ORDER.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
};

/** A graph payload counts as "valid" for replacing the current graph only if it actually contains something. */
export const hasGraph = (g: EvidenceShockResponse["graph"]): g is NonNullable<EvidenceShockResponse["graph"]> =>
  !!g && (g.nodes.length > 0 || g.edges.length > 0);

/** Evidence ids the backend reports as removed in a result, across all hypotheses. */
export function removedEvidenceIds(r: EvidenceShockResponse | null): Set<string> {
  const out = new Set<string>();
  r?.hypotheses.forEach((h) => h.evidence?.forEach((e) => e.removed && out.add(e.id)));
  return out;
}
