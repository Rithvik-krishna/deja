// Contract types that `api/client.ts` does not re-export. They are derived from the generated `api/types.ts`
// (the source of truth) rather than redefined, so they can never drift from the contract.
import type { components } from "../api/types";

type S = components["schemas"];

export type Health = S["Health"];
export type DemoResetResponse = S["DemoResetResponse"];
export type CatalogFix = S["CatalogFix"];
export type AttemptSummary = S["AttemptSummary"];
export type Recommendation = S["Recommendation"];
