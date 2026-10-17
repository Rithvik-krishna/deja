import React from "react";
import type { Theme } from "./useTheme";

export interface HeroSectionProps {
  theme: Theme;
  onLaunchApp: () => void;
}

export default function HeroSection({
  theme,
  onLaunchApp,
}: HeroSectionProps): JSX.Element {
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="hero-section" id="overview" aria-label="Hero Overview">
      <div className="landing-container">
        <div className="hero-grid">
          {/* Left Column: Core Narrative */}
          <div>
            <div className="eyebrow-pill">
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "#38bdf8",
                }}
              />
              <span>INCIDENT INTELLIGENCE FOR ENGINEERING TEAMS</span>
            </div>

            <h1 className="hero-title">
              Every incident leaves a trail.{" "}
              <span style={{ color: "var(--primary)" }}>Find it.</span>
            </h1>

            <p className="hero-subtext">
              Déjà connects services, deployments, incidents, and historical
              evidence into a knowledge graph that helps engineering teams
              investigate failures and understand what changed.
            </p>

            <div className="hero-ctas">
              <button
                onClick={() => scrollToSection("interactive-demo")}
                className="deja-btn-primary"
                style={{ padding: "12px 24px", fontSize: 15 }}
                aria-label="Explore interactive product demonstration"
              >
                <span>Explore the live demo</span>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>

              <button
                onClick={() => scrollToSection("how-it-works")}
                className="deja-btn-secondary"
                style={{ padding: "12px 22px", fontSize: 15 }}
                aria-label="Read how Déjà works"
              >
                <span>See how it works</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
              </button>
            </div>

            <div className="hero-pills-row">
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Neo4j Causal Graph
              </span>
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Counterfactual Shock Testing
              </span>
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Fix Outcome Memory
              </span>
            </div>
          </div>

          {/* Right Column: Visual Preview Card */}
          <div className="hero-graph-card">
            <div
              style={{
                height: 38,
                background: "var(--surface-2)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 14px",
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ef4444" }} />
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#f59e0b" }} />
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#10b981" }} />
                <span style={{ marginLeft: 6, color: "var(--text)", fontWeight: 600 }}>
                  live_investigation.cypher
                </span>
              </div>
              <span style={{ color: "#38bdf8" }}>Aura Live Engine</span>
            </div>

            {/* Simulated Live Diagnostic Stream */}
            <div
              style={{
                padding: "20px 22px",
                height: "calc(100% - 38px)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                background: "var(--surface)",
                fontFamily: "var(--mono)",
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ color: "#ef4444", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>●</span> INC-042 [SEV1]: checkout latency p99 spiking (+420ms)
                </div>
                <div style={{ color: "var(--text-muted)", lineHeight: 1.5, paddingLeft: 12, borderLeft: "2px solid var(--border)" }}>
                  MATCH (i:Incident &#123;id: "INC-042"&#125;)-[:IMPACTED]-&gt;(s:Service)<br />
                  -[:DEPENDS_ON*1..2]-&gt;(suspect:Service)<br />
                  WHERE suspect.risk_score &gt;= 20.0<br />
                  RETURN suspect.name, suspect.score ORDER BY score DESC
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      background: "rgba(37, 99, 235, 0.12)",
                      border: "1px solid rgba(37, 99, 235, 0.3)",
                      borderRadius: 6,
                      padding: "8px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--text)",
                    }}
                  >
                    <span>#1 Top Suspect: payments-api</span>
                    <strong style={{ color: "#38bdf8" }}>Score 33.0 (Tier-2)</strong>
                  </div>
                  <div
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "8px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>#2 inventory</span>
                    <span>Score 21.0</span>
                  </div>
                </div>
              </div>

              {/* Bottom callout */}
              <div
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Correlated deploy: v2.3.1 (Asha Menon)
                </span>
                <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>
                  Rollback worked 4/4 times
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
