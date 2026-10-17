import React, { useEffect, useState } from "react";
import { api, type BlastResponse, type GraphPayload, type RiskResponse } from "../api/client";

export interface RiskPanelProps {
  onGraph: (g: GraphPayload) => void;
  onSelectService?: (name: string) => void;
}

type WindowOption = 90 | 180 | 365;

export default function RiskPanel({ onGraph, onSelectService }: RiskPanelProps): JSX.Element {
  const [windowDays, setWindowDays] = useState<WindowOption>(180);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState<boolean>(false);
  const [riskData, setRiskData] = useState<RiskResponse | null>(null);

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [blastData, setBlastData] = useState<BlastResponse | null>(null);
  const [blastLoading, setBlastLoading] = useState<boolean>(false);
  const [blastError, setBlastError] = useState<string | null>(null);

  // Fetch risk data whenever windowDays changes
  const fetchRisk = async (days: WindowOption) => {
    setLoading(true);
    setError(null);
    setIsNotImplemented(false);

    try {
      const resp = await api.risk(days, 10);
      setRiskData(resp);
      onGraph(resp.graph);

      // Default select the top risk service
      if (resp.services.length > 0) {
        const topSvc = resp.services[0].service;
        setSelectedService(topSvc);
        loadBlast(topSvc, false);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("501") || msg.toLowerCase().includes("not implemented")) {
        setIsNotImplemented(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRisk(windowDays);
  }, [windowDays]);

  // Load blast radius for a service
  const loadBlast = async (svc: string, updateGraph = true) => {
    setBlastLoading(true);
    setBlastError(null);
    try {
      const resp = await api.blast(svc, 3);
      setBlastData(resp);
      if (updateGraph) {
        onGraph(resp.graph);
      }
    } catch (err: any) {
      setBlastError(err?.message || "Failed to load blast radius");
    } finally {
      setBlastLoading(false);
    }
  };

  // Row selection handler
  const handleSelect = (svc: string) => {
    setSelectedService(svc);
    onSelectService?.(svc);
    loadBlast(svc, true);
  };

  const handleShowRiskGraph = () => {
    if (riskData) {
      onGraph(riskData.graph);
    }
  };

  const selectedItem = riskData?.services.find((s) => s.service === selectedService) || null;
  const maxScore = Math.max(...(riskData?.services.map((s) => s.risk_score) || [1]), 1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "#0b0f19",
        color: "#f1f5f9",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 12,
        overflow: "hidden",
      }}
    >
      {/* Header & Window Controls */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #1e293b",
          backgroundColor: "#0f172a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#f8fafc", letterSpacing: 0.3 }}>
            Systemic Risk Map
          </span>
          {riskData && (
            <span
              style={{
                fontSize: 11,
                padding: "2px 7px",
                borderRadius: 999,
                backgroundColor: "#1e293b",
                color: "#94a3b8",
                border: "1px solid #334155",
              }}
            >
              {riskData.incidents_in_window} incidents
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Window:</span>
          {([90, 180, 365] as WindowOption[]).map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              style={{
                padding: "3px 9px",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: windowDays === d ? 700 : 500,
                backgroundColor: windowDays === d ? "#0284c7" : "#1e293b",
                color: windowDays === d ? "#ffffff" : "#94a3b8",
                border: `1px solid ${windowDays === d ? "#38bdf8" : "#334155"}`,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={() => fetchRisk(windowDays)}
            title="Refresh Risk Data"
            style={{
              padding: "3px 8px",
              borderRadius: 4,
              backgroundColor: "#1e293b",
              color: "#cbd5e1",
              border: "1px solid #334155",
              cursor: "pointer",
            }}
          >
            ↻
          </button>
        </div>
      </div>

      {/* 501 Not Implemented graceful banner */}
      {isNotImplemented && (
        <div
          style={{
            margin: 12,
            padding: "10px 14px",
            backgroundColor: "rgba(120, 53, 15, 0.3)",
            border: "1px solid #d97706",
            borderRadius: 6,
            color: "#fde68a",
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          <strong>⚠️ Live Neo4j Mode (501):</strong> Risk calculation is not yet implemented in live mode.
          Use <code>MODE=mock</code> on backend to test the full reference graph risk algorithm.
        </div>
      )}

      {/* General Error Banner */}
      {error && !isNotImplemented && (
        <div
          style={{
            margin: 12,
            padding: "10px 14px",
            backgroundColor: "rgba(153, 27, 27, 0.3)",
            border: "1px solid #ef4444",
            borderRadius: 6,
            color: "#fca5a5",
            fontSize: 11,
          }}
        >
          <strong>Error loading risk:</strong> {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                height: 38,
                backgroundColor: "#1e293b",
                borderRadius: 4,
                animation: "pulse 1.2s infinite ease-in-out",
              }}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && !isNotImplemented && (!riskData || riskData.services.length === 0) && (
        <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
          No risk metrics found for the selected {windowDays}d window.
        </div>
      )}

      {/* Content Area: Table + Detail Inspector */}
      {!loading && riskData && riskData.services.length > 0 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Risk Table */}
          <div style={{ flex: "0 1 55%", overflowY: "auto", borderBottom: "1px solid #1e293b" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: "#090d16",
                    color: "#94a3b8",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    borderBottom: "1px solid #1e293b",
                  }}
                >
                  <th style={{ padding: "8px 10px", width: 40 }}>#</th>
                  <th style={{ padding: "8px 10px" }}>Service</th>
                  <th style={{ padding: "8px 8px" }}>Tier</th>
                  <th style={{ padding: "8px 8px" }}>Owner</th>
                  <th style={{ padding: "8px 8px", textAlign: "right" }} title="Transitive Dependents">
                    Fan-In
                  </th>
                  <th style={{ padding: "8px 8px", textAlign: "right" }} title="Incidents Originated in window">
                    Incs
                  </th>
                  <th style={{ padding: "8px 10px", width: 120 }}>Risk Score</th>
                </tr>
              </thead>
              <tbody>
                {riskData.services.map((item) => {
                  const isSelected = item.service === selectedService;
                  const isTopRisk = item.rank === 1;
                  const scorePct = Math.round((item.risk_score / maxScore) * 100);

                  return (
                    <tr
                      key={item.service}
                      onClick={() => handleSelect(item.service)}
                      style={{
                        backgroundColor: isSelected
                          ? "rgba(2, 132, 199, 0.18)"
                          : isTopRisk
                          ? "rgba(244, 63, 94, 0.08)"
                          : "transparent",
                        borderLeft: isSelected
                          ? "3px solid #38bdf8"
                          : isTopRisk
                          ? "3px solid #f43f5e"
                          : "3px solid transparent",
                        borderBottom: "1px solid #1e293b",
                        cursor: "pointer",
                        transition: "background 0.12s ease",
                      }}
                    >
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: isTopRisk ? "#f43f5e" : "#94a3b8" }}>
                        {item.rank}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ fontWeight: 600, color: isTopRisk ? "#fecdd3" : "#f8fafc" }}>
                          {item.service}
                        </div>
                        {isTopRisk && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: "#f43f5e",
                              backgroundColor: "rgba(244, 63, 94, 0.18)",
                              padding: "1px 4px",
                              borderRadius: 3,
                              display: "inline-block",
                              marginTop: 2,
                            }}
                          >
                            ⚠️ HIDDEN TOP RISK
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "8px 8px" }}>
                        <span
                          style={{
                            fontSize: 10,
                            padding: "1px 5px",
                            borderRadius: 3,
                            backgroundColor:
                              item.tier === "tier-1"
                                ? "#0369a1"
                                : item.tier === "tier-2"
                                ? "#334155"
                                : "#1e293b",
                            color: item.tier === "tier-1" ? "#e0f2fe" : "#cbd5e1",
                          }}
                        >
                          {item.tier}
                        </span>
                      </td>
                      <td style={{ padding: "8px 8px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                        {item.owner || "—"}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", color: "#e2e8f0" }}>
                        {item.transitive_dependents}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", color: item.incidents_originated > 0 ? "#f87171" : "#94a3b8" }}>
                        {item.incidents_originated}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div
                            style={{
                              flex: 1,
                              height: 6,
                              backgroundColor: "#1e293b",
                              borderRadius: 3,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${scorePct}%`,
                                height: "100%",
                                backgroundColor: isTopRisk ? "#f43f5e" : "#0284c7",
                                borderRadius: 3,
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, width: 28, textAlign: "right" }}>
                            {Math.round(item.risk_score)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Selected Service Insight & Blast Radius Details */}
          {selectedItem && (
            <div
              style={{
                flex: "1 1 45%",
                overflowY: "auto",
                padding: "12px 16px",
                backgroundColor: "#090d16",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* Insight Comparison Card */}
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  border: `1px solid ${selectedItem.rank === 1 ? "#f43f5e" : "#334155"}`,
                  boxShadow: selectedItem.rank === 1 ? "0 0 12px rgba(244, 63, 94, 0.2)" : "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#f8fafc" }}>
                      {selectedItem.service}
                    </span>
                    <span style={{ color: "#94a3b8", fontSize: 11 }}>({selectedItem.team})</span>
                  </div>

                  {/* Rank Transformation Pill */}
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 12,
                      backgroundColor: selectedItem.rank === 1 ? "rgba(244,63,94,0.2)" : "rgba(2,132,199,0.2)",
                      color: selectedItem.rank === 1 ? "#fda4af" : "#38bdf8",
                      border: `1px solid ${selectedItem.rank === 1 ? "#f43f5e" : "#0284c7"}`,
                    }}
                  >
                    #{selectedItem.fan_in_rank} by fan-in, #{selectedItem.incident_rank} by incidents → #{selectedItem.rank} by risk
                  </div>
                </div>

                <div style={{ color: "#cbd5e1", fontSize: 11, lineHeight: 1.45 }}>
                  {selectedItem.insight}
                </div>
              </div>

              {/* Blast Radius Section */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: "#f8fafc" }}>
                      Blast Radius for {selectedItem.service}
                    </span>
                    {blastData && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 4,
                          backgroundColor: "#334155",
                          color: "#94a3b8",
                        }}
                      >
                        {blastData.total} transitive dependents
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleShowRiskGraph}
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 4,
                      backgroundColor: "#1e293b",
                      color: "#38bdf8",
                      border: "1px solid #0284c7",
                      cursor: "pointer",
                    }}
                  >
                    Show Full Risk Graph ↺
                  </button>
                </div>

                {blastLoading && (
                  <div style={{ padding: 12, color: "#94a3b8", fontSize: 11 }}>Calculating blast radius...</div>
                )}

                {blastError && (
                  <div style={{ padding: 8, color: "#f87171", fontSize: 11 }}>
                    Error loading blast: {blastError}
                  </div>
                )}

                {!blastLoading && blastData && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* Impacted Services List */}
                    <div
                      style={{
                        maxHeight: 120,
                        overflowY: "auto",
                        border: "1px solid #1e293b",
                        borderRadius: 4,
                      }}
                    >
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <tbody>
                          {blastData.impacted.map((imp) => (
                            <tr key={imp.service} style={{ borderBottom: "1px solid #1e293b" }}>
                              <td style={{ padding: "4px 8px", color: "#f1f5f9", fontWeight: 500 }}>
                                {imp.service}
                              </td>
                              <td style={{ padding: "4px 8px", color: "#94a3b8" }}>{imp.hops} hops</td>
                              <td style={{ padding: "4px 8px" }}>
                                <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 2, backgroundColor: "#1e293b", color: "#94a3b8" }}>
                                  {imp.tier}
                                </span>
                              </td>
                              <td style={{ padding: "4px 8px", color: "#94a3b8", textAlign: "right" }}>
                                {imp.owner || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Recent Deploys on this service */}
                    {blastData.recent_deploys && blastData.recent_deploys.length > 0 && (
                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: 4,
                          backgroundColor: "rgba(245, 158, 11, 0.1)",
                          border: "1px solid rgba(245, 158, 11, 0.3)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: 11,
                        }}
                      >
                        <span style={{ color: "#fbbf24", fontWeight: 600 }}>
                          🚀 Recent Deploy: {blastData.recent_deploys[0].version}
                        </span>
                        <span style={{ color: "#94a3b8" }}>
                          by {blastData.recent_deploys[0].author} ({blastData.recent_deploys[0].deployed_at.slice(0, 10)})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
