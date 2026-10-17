import React, { useEffect, useState } from "react";
import { api, type CatalogService, type GraphEdge, type GraphNode, type OwnerResponse } from "../../api/client";

export interface ServiceInspectorProps {
  serviceName: string;
  node: GraphNode | null;
  edges: GraphEdge[];
  nodes?: GraphNode[];
  catalogService?: CatalogService;
  onFocus?: (serviceName: string) => void;
  onAskChat?: (prompt: string) => void;
  onViewOwners?: (serviceName: string) => void;
  onStressTest?: (serviceName?: string) => void;
  onClose?: () => void;
}

export default function ServiceInspector({
  serviceName,
  node,
  edges,
  nodes = [],
  catalogService,
  onFocus,
  onAskChat,
  onViewOwners,
  onStressTest,
  onClose,
}: ServiceInspectorProps): JSX.Element {
  const [ownerData, setOwnerData] = useState<OwnerResponse | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(false);

  // Fetch current owner details for the selected service
  useEffect(() => {
    let active = true;
    setOwnerLoading(true);
    api
      .owner(serviceName)
      .then((res) => {
        if (active) {
          setOwnerData(res);
          setOwnerLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setOwnerLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [serviceName]);

  // Derive dependencies from current graph edges
  const svcId = node?.id || `svc:${serviceName}`;
  const upstreamDeps = edges
    .filter(
      (e) =>
        e.type === "DEPENDS_ON" &&
        (e.source === svcId || e.source === serviceName)
    )
    .map((e) => String(e.target).replace(/^svc:/, ""));

  const downstreamDeps = edges
    .filter(
      (e) =>
        e.type === "DEPENDS_ON" &&
        (e.target === svcId || e.target === serviceName)
    )
    .map((e) => String(e.source).replace(/^svc:/, ""));

  // Connected deployments, incidents, and evidence from graph
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const connectedDeploys: GraphNode[] = [];
  const connectedIncidents: GraphNode[] = [];
  const connectedEvidence: GraphNode[] = [];

  edges.forEach((e) => {
    const isConn = e.source === svcId || e.target === svcId || e.source === serviceName || e.target === serviceName;
    if (!isConn) return;
    const otherId = e.source === svcId || e.source === serviceName ? String(e.target) : String(e.source);
    const otherNode = nodeMap.get(otherId);
    if (!otherNode) return;
    const l = otherNode.label.toLowerCase();
    if (l.includes("deploy")) connectedDeploys.push(otherNode);
    else if (l.includes("incident")) connectedIncidents.push(otherNode);
    else if (l.includes("evidence")) connectedEvidence.push(otherNode);
  });

  const tier = catalogService?.tier || (node?.props as any)?.tier || "Tier 2";
  const team = catalogService?.team || (node?.props as any)?.team || "Engineering";
  const description = (node?.props as any)?.description as string | undefined;
  const score = node?.score;

  return (
    <div
      className="service-inspector-card"
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        width: 320,
        maxHeight: "calc(100% - 32px)",
        overflowY: "auto",
        backgroundColor: "rgba(10, 15, 29, 0.94)",
        border: "1px solid rgba(56, 189, 248, 0.35)",
        borderRadius: 12,
        padding: 16,
        boxShadow: "0 16px 40px -8px rgba(0, 0, 0, 0.75), 0 0 20px rgba(56, 189, 248, 0.15)",
        backdropFilter: "blur(14px)",
        color: "#f8fafc",
        zIndex: 35,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: "1px solid rgba(51, 65, 85, 0.6)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#38bdf8" }}>⚡</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#94a3b8",
              }}
            >
              Service Inspector
            </span>
          </div>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "#f8fafc",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            {serviceName}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                backgroundColor: tier.includes("1") ? "rgba(239, 68, 68, 0.2)" : "rgba(56, 189, 248, 0.2)",
                color: tier.includes("1") ? "#fca5a5" : "#7dd3fc",
                border: `1px solid ${tier.includes("1") ? "rgba(239, 68, 68, 0.4)" : "rgba(56, 189, 248, 0.4)"}`,
              }}
            >
              {tier}
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{team}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: 4,
            fontSize: 16,
            lineHeight: 1,
            borderRadius: 4,
          }}
          title="Clear service selection"
          aria-label="Clear service selection"
        >
          ✕
        </button>
      </div>

      {description && (
        <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.4, marginBottom: 12 }}>
          {description}
        </div>
      )}

      {/* Heuristic Score Card (if present) */}
      {typeof score === "number" && (
        <div
          style={{
            backgroundColor: "rgba(15, 23, 42, 0.7)",
            border: "1px solid rgba(56, 189, 248, 0.25)",
            borderRadius: 8,
            padding: "8px 10px",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Heuristic Score</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#38bdf8" }}>{score.toFixed(1)}</span>
          </div>
          <div style={{ fontSize: 9, color: "#64748b", marginTop: 2, fontStyle: "italic" }}>
            * heuristic, not a probability
          </div>
        </div>
      )}

      {/* Owner Info */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>
          Current Owner
        </div>
        {ownerLoading ? (
          <div style={{ fontSize: 11, color: "#64748b" }}>Loading owner...</div>
        ) : ownerData ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              backgroundColor: "rgba(15, 23, 42, 0.5)",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid rgba(51, 65, 85, 0.5)",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                backgroundColor: "#0284c7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              {ownerData.owner ? ownerData.owner.charAt(0).toUpperCase() : "?"}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#f8fafc" }}>
                {ownerData.owner || "Unknown"}
              </div>
              {ownerData.valid_from ? (
                <div style={{ fontSize: 10, color: "#64748b" }}>
                  Effective since {ownerData.valid_from}
                </div>
              ) : ownerData.date ? (
                <div style={{ fontSize: 10, color: "#64748b" }}>
                  As of {ownerData.date}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#64748b" }}>Ownership not recorded</div>
        )}
      </div>

      {/* Dependencies */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 6 }}>
          Service Relationships
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div>
            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>
              Upstream dependencies ({upstreamDeps.length}):
            </div>
            {upstreamDeps.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {upstreamDeps.map((dep) => (
                  <span
                    key={dep}
                    onClick={() => onFocus?.(dep)}
                    style={{
                      fontSize: 10,
                      backgroundColor: "rgba(56, 189, 248, 0.12)",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      color: "#7dd3fc",
                      padding: "2px 6px",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                    title={`Click to focus on ${dep}`}
                  >
                    {dep}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 10, color: "#475569" }}>None</span>
            )}
          </div>

          <div>
            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>
              Downstream callers ({downstreamDeps.length}):
            </div>
            {downstreamDeps.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {downstreamDeps.map((dep) => (
                  <span
                    key={dep}
                    onClick={() => onFocus?.(dep)}
                    style={{
                      fontSize: 10,
                      backgroundColor: "rgba(148, 163, 184, 0.12)",
                      border: "1px solid rgba(148, 163, 184, 0.3)",
                      color: "#cbd5e1",
                      padding: "2px 6px",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                    title={`Click to focus on ${dep}`}
                  >
                    {dep}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 10, color: "#475569" }}>None</span>
            )}
          </div>
        </div>
      </div>

      {/* Connected Deployments */}
      {connectedDeploys.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>
            Recent Deployments ({connectedDeploys.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {connectedDeploys.map((d) => (
              <div
                key={d.id}
                style={{
                  fontSize: 10,
                  backgroundColor: "rgba(59, 130, 246, 0.12)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  color: "#93c5fd",
                  padding: "4px 8px",
                  borderRadius: 4,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>📦 {d.name || d.id}</span>
                {(d.props as any)?.version && <span>{(d.props as any).version}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connected Incidents */}
      {connectedIncidents.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>
            Incident History ({connectedIncidents.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {connectedIncidents.map((inc) => (
              <div
                key={inc.id}
                style={{
                  fontSize: 10,
                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#fca5a5",
                  padding: "4px 8px",
                  borderRadius: 4,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>⚠️ {inc.name || inc.id}</span>
                {(inc.props as any)?.severity && <span>{(inc.props as any).severity}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supporting Evidence */}
      {connectedEvidence.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>
            Supporting Evidence ({connectedEvidence.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {connectedEvidence.map((ev) => (
              <div
                key={ev.id}
                style={{
                  fontSize: 10,
                  backgroundColor: Boolean(ev.props?.removed)
                    ? "rgba(100, 116, 139, 0.15)"
                    : "rgba(20, 184, 166, 0.15)",
                  border: `1px solid ${
                    Boolean(ev.props?.removed) ? "rgba(100, 116, 139, 0.4)" : "rgba(20, 184, 166, 0.4)"
                  }`,
                  color: Boolean(ev.props?.removed) ? "#94a3b8" : "#5eead4",
                  padding: "4px 8px",
                  borderRadius: 4,
                  textDecoration: Boolean(ev.props?.removed) ? "line-through" : "none",
                }}
              >
                <span>⚡ {ev.name || (ev.props as any)?.label || ev.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          paddingTop: 10,
          borderTop: "1px solid rgba(51, 65, 85, 0.6)",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => onFocus?.(serviceName)}
            style={{
              flex: 1,
              padding: "6px 8px",
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: "rgba(56, 189, 248, 0.18)",
              border: "1px solid rgba(56, 189, 248, 0.45)",
              color: "#38bdf8",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <span>🎯</span> Center
          </button>

          {onViewOwners && (
            <button
              onClick={() => onViewOwners(serviceName)}
              style={{
                flex: 1,
                padding: "6px 8px",
                fontSize: 11,
                fontWeight: 600,
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(51, 65, 85, 0.7)",
                color: "#cbd5e1",
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <span>📋</span> Owners
            </button>
          )}
        </div>

        {onAskChat && (
          <button
            onClick={() => onAskChat(`Who owns ${serviceName} and what recent incidents occurred?`)}
            style={{
              padding: "6px 8px",
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: "rgba(30, 41, 59, 0.8)",
              border: "1px solid rgba(51, 65, 85, 0.7)",
              color: "#f8fafc",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <span>💬</span> Ask in Copilot Chat
          </button>
        )}

        {onStressTest && (
          <button
            onClick={() => onStressTest(serviceName)}
            style={{
              padding: "6px 8px",
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: "rgba(126, 34, 206, 0.2)",
              border: "1px solid rgba(192, 132, 252, 0.4)",
              color: "#c084fc",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <span>⚡</span> Stress-test in Shock Lab
          </button>
        )}
      </div>
    </div>
  );
}
