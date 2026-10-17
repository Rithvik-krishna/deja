import React, { useState } from "react";
import { NODE_COLORS } from "./styles";

export interface GraphLegendProps {
  defaultCollapsed?: boolean;
}

export default function GraphLegend({ defaultCollapsed = true }: GraphLegendProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Expand graph legend"
        aria-label="Expand graph legend"
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          zIndex: 20,
          backgroundColor: "rgba(15, 23, 42, 0.88)",
          border: "1px solid rgba(51, 65, 85, 0.8)",
          borderRadius: 6,
          padding: "5px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: "#94a3b8",
          backdropFilter: "blur(6px)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "system-ui, -apple-system, sans-serif",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#38bdf8";
          e.currentTarget.style.color = "#f8fafc";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(51, 65, 85, 0.8)";
          e.currentTarget.style.color = "#94a3b8";
        }}
      >
        <span style={{ fontSize: 13 }}>🗺️</span>
        <span>Legend</span>
        <span style={{ fontSize: 9, opacity: 0.7 }}>▲</span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        zIndex: 20,
        backgroundColor: "rgba(15, 23, 42, 0.94)",
        border: "1px solid rgba(51, 65, 85, 0.85)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 11,
        color: "#cbd5e1",
        backdropFilter: "blur(8px)",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
        width: 230,
        maxHeight: "calc(100% - 24px)",
        overflowY: "auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          fontWeight: 600,
          color: "#f8fafc",
          userSelect: "none",
          borderBottom: "1px solid rgba(51, 65, 85, 0.6)",
          paddingBottom: 6,
        }}
        onClick={() => setCollapsed(true)}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13 }}>🗺️</span>
          <span style={{ fontSize: 12 }}>Legend</span>
        </span>
        <span
          style={{
            fontSize: 10,
            color: "#38bdf8",
            padding: "2px 6px",
            borderRadius: 4,
            backgroundColor: "rgba(56, 189, 248, 0.1)",
          }}
        >
          Collapse ▼
        </span>
      </div>

      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <div
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              color: "#94a3b8",
              marginBottom: 4,
              letterSpacing: 0.5,
              fontWeight: 700,
            }}
          >
            Nodes
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  backgroundColor: NODE_COLORS.Service.fill,
                  border: `1.5px solid ${NODE_COLORS.Service.stroke}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10 }}>Service (score)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  backgroundColor: NODE_COLORS.Incident.fill,
                  border: "1.5px dashed #ef4444",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10 }}>Incident (! open)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  backgroundColor: NODE_COLORS.Deploy.fill,
                  border: `1.5px solid ${NODE_COLORS.Deploy.stroke}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10 }}>Deploy</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  backgroundColor: NODE_COLORS.Engineer.fill,
                  border: `1.5px solid ${NODE_COLORS.Engineer.stroke}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10 }}>Engineer</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  transform: "rotate(45deg)",
                  backgroundColor: NODE_COLORS.Fix.fill,
                  border: `1.5px solid ${NODE_COLORS.Fix.stroke}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10 }}>Fix</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  backgroundColor: NODE_COLORS.Evidence.fill,
                  border: `1.5px solid ${NODE_COLORS.Evidence.stroke}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10 }}>Evidence</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                backgroundColor: "rgba(30,41,59,0.5)",
                border: "1.5px dashed #64748b",
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#94a3b8", fontSize: 10 }}>Removed Evidence (ghost)</span>
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(51, 65, 85, 0.6)", paddingTop: 6 }}>
          <div
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              color: "#94a3b8",
              marginBottom: 4,
              letterSpacing: 0.5,
              fontWeight: 700,
            }}
          >
            Edges
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, height: 2, backgroundColor: "#38bdf8", flexShrink: 0 }} />
              <span style={{ fontSize: 10 }}>DEPENDS_ON (→)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, height: 2, backgroundColor: "#22c55e", flexShrink: 0 }} />
              <span style={{ color: "#4ade80", fontSize: 10 }}>ATTEMPTED ✓ SUCCESS</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, height: 2, borderTop: "2px dashed #ef4444", flexShrink: 0 }} />
              <span style={{ color: "#f87171", fontSize: 10 }}>ATTEMPTED ✕ FAILED</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, height: 3, backgroundColor: "#06b6d4", flexShrink: 0 }} />
              <span style={{ fontSize: 10 }}>SUPPORTS (thickness ~ weight)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
