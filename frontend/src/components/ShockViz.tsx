import React from "react";
import type { EvidenceShockResponse, HypothesisItem } from "./graph/shockTypes";

export interface ShockVizProps {
  shock: EvidenceShockResponse | null;
  onSelectSource?: (source: string) => void;
}

export default function ShockViz({ shock, onSelectSource }: ShockVizProps): JSX.Element {
  if (!shock) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 24,
          backgroundColor: "#090d16",
          color: "#94a3b8",
          textAlign: "center",
          gap: 12,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ fontSize: 36 }}>⚡</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>
          Evidence Shock Lab
        </div>
        <div style={{ fontSize: 12, maxWidth: 320, lineHeight: 1.5, color: "#64748b" }}>
          Counterfactual evidence stress-testing. Perturb deployments, incident history, or topology to test
          if the diagnosis is robust before taking disruptive action.
        </div>
        <div
          style={{
            fontSize: 11,
            padding: "6px 12px",
            borderRadius: 6,
            backgroundColor: "#1e293b",
            color: "#38bdf8",
            border: "1px solid #0284c7",
          }}
        >
          Select an alert or run a shock test to inspect counterfactual deltas
        </div>
      </div>
    );
  }

  // Extract all perturbed/removed evidence items across all hypotheses
  const removedItems = shock.hypotheses.flatMap((h) =>
    (h.evidence || []).filter((e) => e.removed)
  );
  // De-duplicate removed items by id
  const uniqueRemoved = Array.from(new Map(removedItems.map((e) => [e.id, e])).values());

  // Determine max score for visual bar normalization
  const maxScore = Math.max(
    ...shock.hypotheses.map((h) => Math.max(h.score_before ?? h.score, h.score_after ?? h.score)),
    1
  );

  // Verdict visual configurations
  const verdictConfig = {
    robust: {
      badge: "VERDICT: ROBUST",
      icon: "🛡️",
      title: "Diagnosis is Robust",
      desc: `${shock.top_suspect_after} remains the leading hypothesis even under evidence perturbation.`,
      color: "#22c55e",
      bg: "rgba(34, 197, 94, 0.12)",
      border: "#22c55e",
    },
    fragile: {
      badge: "VERDICT: FRAGILE",
      icon: "⚠️",
      title: "Diagnosis is Fragile",
      desc: `Perturbation flips the top suspect from ${shock.top_suspect_before} to ${shock.top_suspect_after}.`,
      color: "#f59e0b",
      bg: "rgba(245, 158, 11, 0.14)",
      border: "#f59e0b",
    },
    inconclusive: {
      badge: "VERDICT: INCONCLUSIVE (TIE ≤ 0.25)",
      icon: "⚖️",
      title: "Diagnosis is Inconclusive",
      desc: `Competing hypotheses are tied within margin epsilon 0.25 (margin: ${shock.margin_after.toFixed(2)}).`,
      color: "#94a3b8",
      bg: "rgba(148, 163, 184, 0.12)",
      border: "#64748b",
    },
  }[shock.verdict] || {
    badge: "VERDICT: UNKNOWN",
    icon: "❓",
    title: "Unknown Verdict",
    desc: "",
    color: "#94a3b8",
    bg: "rgba(51, 65, 85, 0.2)",
    border: "#475569",
  };

  // Recommendation categorization
  const isAct = shock.verdict === "robust";
  const recKind = isAct ? "ACT" : "DIAGNOSE";
  const ruleId = isAct
    ? "RULE-SHOCK-ROBUST-REMEDIATE"
    : shock.verdict === "inconclusive"
    ? "RULE-SHOCK-TIE-VERIFY-CHANNEL"
    : "RULE-SHOCK-FRAGILE-CHECK-ALTERNATIVE";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "#090d16",
        color: "#f1f5f9",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 12,
        overflowY: "auto",
        padding: 16,
        gap: 14,
      }}
    >
      {/* Header & Incident Meta */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#f8fafc" }}>
              Evidence Shock Analysis
            </span>
            <span
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                backgroundColor: "#1e293b",
                color: "#38bdf8",
              }}
            >
              {shock.incident_id}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            Alert: <strong>{shock.service}</strong> ({shock.symptom})
          </div>
        </div>

        {/* Score Margin Movement */}
        <div
          style={{
            textAlign: "right",
            backgroundColor: "#0f172a",
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #1e293b",
          }}
        >
          <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase" }}>Score Margin</div>
          <div style={{ fontWeight: 700, fontSize: 12 }}>
            <span style={{ color: "#94a3b8" }}>{shock.margin_before.toFixed(2)}</span>
            <span style={{ color: "#64748b", margin: "0 4px" }}>→</span>
            <span style={{ color: shock.margin_after <= 0.25 ? "#f59e0b" : "#38bdf8" }}>
              {shock.margin_after.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Verdict Card */}
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 8,
          backgroundColor: verdictConfig.bg,
          border: `1.5px solid ${verdictConfig.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          boxShadow: `0 0 16px ${verdictConfig.bg}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>{verdictConfig.icon}</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#f8fafc" }}>
              {verdictConfig.title}
            </span>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 4,
              backgroundColor: verdictConfig.color,
              color: "#090d16",
              letterSpacing: 0.4,
            }}
          >
            {verdictConfig.badge}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.45 }}>
          {verdictConfig.desc}
        </div>
      </div>

      {/* Perturbation Channel Badges (Removed Evidence / Sources) */}
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 6,
          backgroundColor: "#0f172a",
          border: "1px solid #1e293b",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>
          Perturbed Evidence ({uniqueRemoved.length} items removed)
        </div>
        {uniqueRemoved.length === 0 ? (
          <div style={{ fontSize: 11, color: "#64748b", fontStyle: "italic" }}>
            Baseline run — all evidence active.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {uniqueRemoved.map((item) => (
              <span
                key={item.id}
                style={{
                  fontSize: 10,
                  padding: "3px 8px",
                  borderRadius: 4,
                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                  color: "#fca5a5",
                  border: "1px dashed rgba(239, 68, 68, 0.4)",
                  textDecoration: "line-through",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span>✕</span>
                <span>{item.label}</span>
                <span style={{ opacity: 0.7, fontSize: 9 }}>(-{item.weight})</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Hypotheses Before vs After Score Delta Bars */}
      <div
        style={{
          backgroundColor: "#0f172a",
          borderRadius: 8,
          border: "1px solid #1e293b",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#f8fafc", textTransform: "uppercase" }}>
            Suspect Score & Rank Movement
          </span>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>before → after (delta)</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shock.hypotheses.map((h: HypothesisItem) => {
            const beforeScore = h.score_before ?? h.score;
            const afterScore = h.score_after ?? h.score;
            const delta = afterScore - beforeScore;
            const beforePct = Math.round((beforeScore / maxScore) * 100);
            const afterPct = Math.round((afterScore / maxScore) * 100);

            const isTop = h.service === shock.top_suspect_after;
            const rankBefore = h.rank_before ?? h.rank;
            const rankAfter = h.rank_after ?? h.rank;
            const rankChanged = rankBefore !== rankAfter;

            return (
              <div key={h.service} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {/* Rank Badge */}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 3,
                        backgroundColor: isTop ? "#0284c7" : "#1e293b",
                        color: isTop ? "#ffffff" : "#94a3b8",
                      }}
                    >
                      #{rankBefore} → #{rankAfter}
                    </span>
                    <span style={{ fontWeight: 600, color: isTop ? "#38bdf8" : "#f1f5f9" }}>
                      {h.service}
                    </span>
                    {h.owner && (
                      <span style={{ fontSize: 10, color: "#64748b" }}>({h.owner})</span>
                    )}
                  </div>

                  {/* Numeric Scores and Delta */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                    <span style={{ color: "#94a3b8" }}>{beforeScore.toFixed(1)}</span>
                    <span style={{ color: "#64748b" }}>→</span>
                    <span style={{ fontWeight: 700, color: isTop ? "#38bdf8" : "#e2e8f0" }}>
                      {afterScore.toFixed(1)}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 3,
                        backgroundColor:
                          delta < 0
                            ? "rgba(239, 68, 68, 0.15)"
                            : delta > 0
                            ? "rgba(34, 197, 94, 0.15)"
                            : "rgba(100, 116, 139, 0.15)",
                        color: delta < 0 ? "#f87171" : delta > 0 ? "#4ade80" : "#94a3b8",
                      }}
                    >
                      {delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                    </span>
                  </div>
                </div>

                {/* Dual Horizontal Bars: Before (top/muted) and After (bottom/vibrant) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {/* Before bar */}
                  <div style={{ width: "100%", height: 4, backgroundColor: "#1e293b", borderRadius: 2 }}>
                    <div
                      style={{
                        width: `${beforePct}%`,
                        height: "100%",
                        backgroundColor: "#475569",
                        borderRadius: 2,
                        transition: "width 0.4s ease-out",
                      }}
                    />
                  </div>
                  {/* After bar */}
                  <div style={{ width: "100%", height: 7, backgroundColor: "#1e293b", borderRadius: 3 }}>
                    <div
                      style={{
                        width: `${afterPct}%`,
                        height: "100%",
                        backgroundColor: isTop ? "#0284c7" : "#6366f1",
                        borderRadius: 3,
                        transition: "width 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Critical Evidence Sources as Clickable Chips */}
      {shock.critical_sources && shock.critical_sources.length > 0 && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: "#0f172a",
            border: "1px solid #1e293b",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#f8fafc", textTransform: "uppercase" }}>
              Critical Channels (Click to Perturb)
            </span>
            <span style={{ fontSize: 10, color: "#94a3b8" }}>Ranked by aggregate F(src)</span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {shock.critical_sources.map((src) => {
              // Expected outcome hint
              const expectedText =
                src.source === "incident-history"
                  ? "Flips to Inconclusive (tie at 3.5)"
                  : src.source === "cicd-deploy-log"
                  ? "Stays Robust (payments-api #1)"
                  : "Topology invariant";

              return (
                <button
                  key={src.source}
                  onClick={() => onSelectSource?.(src.source)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                    color: "#f8fafc",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#38bdf8";
                    e.currentTarget.style.backgroundColor = "#24324a";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#334155";
                    e.currentTarget.style.backgroundColor = "#1e293b";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 11 }}>{src.source}</span>
                    <span
                      style={{
                        fontSize: 9,
                        padding: "1px 4px",
                        borderRadius: 3,
                        backgroundColor: "#0284c7",
                        color: "#ffffff",
                        fontWeight: 700,
                      }}
                    >
                      F: {src.impact_score.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: "#94a3b8" }}>{expectedText}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Critical Evidence Items */}
      {shock.critical_evidence && shock.critical_evidence.length > 0 && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: "#0f172a",
            border: "1px solid #1e293b",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#f8fafc", textTransform: "uppercase" }}>
              Top Critical Evidence Items
            </span>
            <span style={{ fontSize: 10, color: "#94a3b8" }}>Ranked by F(e) drop</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {shock.critical_evidence.map((item) => (
              <div
                key={item.evidence_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "4px 8px",
                  borderRadius: 4,
                  backgroundColor: "#1e293b",
                  fontSize: 11,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "1px 4px",
                      borderRadius: 2,
                      backgroundColor: "#334155",
                      color: "#94a3b8",
                      textTransform: "uppercase",
                    }}
                  >
                    {item.kind}
                  </span>
                  <span style={{ color: "#e2e8f0", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                </div>
                <span style={{ fontWeight: 700, color: "#38bdf8", marginLeft: 8, whiteSpace: "nowrap" }}>
                  F: {item.impact_score.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actionable Recommendation Card */}
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 8,
          backgroundColor: isAct ? "rgba(2, 132, 199, 0.12)" : "rgba(245, 158, 11, 0.12)",
          border: `1px solid ${isAct ? "#0284c7" : "#f59e0b"}`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 4,
                backgroundColor: isAct ? "#0284c7" : "#d97706",
                color: "#ffffff",
                letterSpacing: 0.5,
              }}
            >
              {recKind}
            </span>
            <span style={{ fontWeight: 700, fontSize: 12, color: "#f8fafc" }}>
              Recommended Next Action
            </span>
          </div>
          <span style={{ fontSize: 9, color: "#94a3b8", fontFamily: "monospace" }}>{ruleId}</span>
        </div>
        <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.45 }}>
          {shock.recommendation}
        </div>
      </div>

      {/* Heuristic Disclaimer Note */}
      <div
        style={{
          fontSize: 10,
          color: "#64748b",
          lineHeight: 1.4,
          padding: "6px 8px",
          borderTop: "1px solid #1e293b",
          fontStyle: "italic",
        }}
      >
        * Heuristic Notice: All suspect scores, margins, and F(e) criticality indices are graph-derived heuristics,
        not statistical probabilities. Data is synthetic for incident rehearsal.
      </div>
    </div>
  );
}
