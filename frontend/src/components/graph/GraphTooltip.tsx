import React from "react";
import type { VisualNode } from "./types";
import { NODE_COLORS } from "./styles";

interface Props {
  node: VisualNode | null;
  x: number;
  y: number;
}

export default function GraphTooltip({ node, x, y }: Props): JSX.Element | null {
  if (!node) return null;

  const style = NODE_COLORS[node.kind] || NODE_COLORS.Unknown;
  const props = node.props || {};

  const propStr = (val: unknown): string | null => {
    if (val === undefined || val === null) return null;
    return String(val);
  };

  const tier = propStr(props.tier);
  const team = propStr(props.team);
  const severity = propStr(props.severity);
  const status = propStr(props.status);
  const version = propStr(props.version);
  const source = propStr(props.source);
  const weight = propStr(props.weight);

  return (
    <div
      style={{
        position: "absolute",
        left: x + 16,
        top: y - 16,
        pointerEvents: "none",
        zIndex: 30,
        backgroundColor: "rgba(11, 15, 25, 0.96)",
        border: `1.5px solid ${node.isGhost ? "#64748b" : style.stroke}`,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 11,
        color: "#e2e8f0",
        boxShadow: `0 8px 24px rgba(0, 0, 0, 0.6), 0 0 12px ${node.isGhost ? "transparent" : style.glow}`,
        maxWidth: 260,
        backdropFilter: "blur(8px)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 4,
            backgroundColor: node.isGhost ? "#334155" : style.fill,
            color: "#ffffff",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {node.isGhost ? "REMOVED EVIDENCE" : node.label || node.kind}
        </span>
        {node.highlight && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 5px",
              borderRadius: 4,
              backgroundColor: "#f59e0b",
              color: "#0f172a",
            }}
          >
            HIGHLIGHTED
          </span>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc", marginBottom: 6 }}>
        {node.name || node.id}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3, borderTop: "1px solid rgba(51, 65, 85, 0.6)", paddingTop: 4 }}>
        {node.score !== undefined && node.score !== null && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>Score:</span>
            <span style={{ fontWeight: 600, color: "#38bdf8" }}>{node.score} (heuristic)</span>
          </div>
        )}

        {tier && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>Tier:</span>
            <span>{tier}</span>
          </div>
        )}

        {team && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>Team:</span>
            <span>{team}</span>
          </div>
        )}

        {severity && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>Severity:</span>
            <span style={{ fontWeight: 600, color: severity === "SEV1" ? "#ef4444" : "#f97316" }}>
              {severity}
            </span>
          </div>
        )}

        {status && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>Status:</span>
            <span style={{ color: status === "open" ? "#ef4444" : "#10b981", fontWeight: 600 }}>
              {status}
            </span>
          </div>
        )}

        {version && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>Version:</span>
            <span style={{ color: "#fbbf24" }}>{version}</span>
          </div>
        )}

        {source && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>Source:</span>
            <span style={{ color: "#22d3ee" }}>{source}</span>
          </div>
        )}

        {weight && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>Weight:</span>
            <span>{weight}</span>
          </div>
        )}

        {node.isGhost && (
          <div style={{ color: "#f87171", fontSize: 10, marginTop: 2, fontStyle: "italic" }}>
            ⚠️ Evidence perturbed in counterfactual shock scenario
          </div>
        )}
      </div>
    </div>
  );
}
