import type { EvidenceShockResponse } from "../../api/client";

// UI-side explanations of the backend's verdict. The verdict itself is never computed or overridden here.
const EXPLANATION: Record<EvidenceShockResponse["verdict"], string> = {
  robust: "The diagnosis remains supported after the tested evidence is removed.",
  fragile: "The diagnosis is sensitive to the tested evidence.",
  inconclusive: "The available evidence does not support a confident conclusion under the tested conditions.",
};

export function ShockSummary({ shock }: { shock: EvidenceShockResponse }) {
  const recommendation = shock.recommendation?.trim();
  return (
    <div className={`shock-summary verdict-${shock.verdict}`}>
      <p className="verdict-line">
        <span className="verdict-badge">{shock.verdict.toUpperCase()}</span>
        <span>{EXPLANATION[shock.verdict]}</span>
      </p>
      <p className="row-meta">
        Top suspect: <strong>{shock.top_suspect_before}</strong> before → <strong>{shock.top_suspect_after}</strong> after · margin {shock.margin_before} → {shock.margin_after}
      </p>
      <div className="next-check">
        <strong>Recommendation from the backend</strong>
        <p>{recommendation ? recommendation : "No recommendation was returned by the backend."}</p>
      </div>
    </div>
  );
}
