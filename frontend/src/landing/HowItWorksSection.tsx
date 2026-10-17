import React from "react";

export default function HowItWorksSection(): JSX.Element {
  return (
    <section className="how-section" id="how-it-works" aria-label="How Déjà Works">
      <div className="landing-container">
        {/* Section Header */}
        <div className="section-head">
          <div className="eyebrow-pill">INVESTIGATION ARCHITECTURE</div>
          <h2 className="section-title">How Déjà works</h2>
          <p className="section-subtext">
            Three disciplined stages that transform raw system telemetry and on-call confusion
            into grounded, repeatable incident resolution.
          </p>
        </div>

        {/* 3 Step Columns */}
        <div className="how-steps-grid">
          {/* Step 1 */}
          <div className="how-step-card">
            <div className="how-step-num">01</div>
            <h3 className="how-step-title">Connect the evidence</h3>
            <p className="how-step-body">
              Continuously map services, CI/CD releases, historical outages, ownership records,
              and fix attempts into an interconnected Neo4j graph model.
            </p>
            <div
              style={{
                marginTop: "auto",
                padding: "8px 12px",
                borderRadius: 6,
                background: "var(--surface-2)",
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              (Service)-[:DEPENDS_ON]-&gt;(Deploy)
            </div>
          </div>

          {/* Step 2 */}
          <div className="how-step-card">
            <div className="how-step-num">02</div>
            <h3 className="how-step-title">Investigate relationships</h3>
            <p className="how-step-body">
              When an alert fires, traverse causal dependency chains to identify correlated releases,
              fan-in blast radiuses, and the specific engineers who authored recent changes.
            </p>
            <div
              style={{
                marginTop: "auto",
                padding: "8px 12px",
                borderRadius: 6,
                background: "var(--surface-2)",
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              Upstream path &gt; payments-api #1 risk
            </div>
          </div>

          {/* Step 3 */}
          <div className="how-step-card">
            <div className="how-step-num">03</div>
            <h3 className="how-step-title">Challenge the explanation</h3>
            <p className="how-step-body">
              Run counterfactual evidence perturbations. Determine whether your diagnosis
              remains robust or ties with competitors when crucial evidence channels are withheld.
            </p>
            <div
              style={{
                marginTop: "auto",
                padding: "8px 12px",
                borderRadius: 6,
                background: "var(--surface-2)",
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              Evidence Shock &gt; Robust vs Inconclusive
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
