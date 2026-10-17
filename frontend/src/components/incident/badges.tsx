import type { IncidentSummary } from "../../api/client";

// Colour is never the only signal: every badge carries its text.
export function SeverityBadge({ severity }: { severity: IncidentSummary["severity"] }) {
  return <span className={`badge badge-${severity.toLowerCase()}`}>{severity}</span>;
}

export function StatusBadge({ status }: { status: IncidentSummary["status"] }) {
  return <span className={`badge badge-${status}`}>{status === "open" ? "Open" : "Resolved"}</span>;
}

export function OutcomeBadge({ status }: { status: "SUCCESS" | "FAILED" }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status === "SUCCESS" ? "Worked" : "Failed"}</span>;
}
