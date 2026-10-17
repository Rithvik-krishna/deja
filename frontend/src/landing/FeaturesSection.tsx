import React from "react";

export default function FeaturesSection(): JSX.Element {
  return (
    <section className="features-section" id="features" aria-label="Product Features">
      <div className="landing-container">
        {/* Section Header */}
        <div className="section-head">
          <div className="eyebrow-pill">CORE CAPABILITIES</div>
          <h2 className="section-title">Engineered for on-call clarity</h2>
          <p className="section-subtext">
            Déjà replaces siloed observability metrics with a live, querying graph
            that recalls past remedies and stress-tests hypotheses under pressure.
          </p>
        </div>

        {/* Features 4-column Grid */}
        <div className="features-grid">
          {/* Feature 1: Knowledge Graph */}
          <div className="feature-card">
            <div className="feature-icon-wrap" aria-hidden="true">
              🕸️
            </div>
            <h3 className="feature-card-title">Knowledge Graph</h3>
            <div style={{ color: "#38bdf8", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              "See the connections behind every incident."
            </div>
            <p className="feature-card-text">
              Services, incidents, deployments, owners, and fixes are connected as
              first-class graph entities in Neo4j. Uncover hidden single points of failure
              that slip past conventional fan-in metrics.
            </p>
          </div>

          {/* Feature 2: Evidence Shock */}
          <div className="feature-card">
            <div className="feature-icon-wrap" aria-hidden="true">
              ⚡
            </div>
            <h3 className="feature-card-title">Evidence Shock</h3>
            <div style={{ color: "#38bdf8", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              "Test whether your explanation survives scrutiny."
            </div>
            <p className="feature-card-text">
              Counterfactual evidence perturbation simulates the removal of telemetry or deploy logs.
              Instantly discover whether your top diagnosis is truly robust or flips to inconclusive under doubt.
            </p>
          </div>

          {/* Feature 3: Historical Context */}
          <div className="feature-card">
            <div className="feature-icon-wrap" aria-hidden="true">
              🧠
            </div>
            <h3 className="feature-card-title">Historical Context</h3>
            <div style={{ color: "#38bdf8", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              "Learn from incidents your systems have seen before."
            </div>
            <p className="feature-card-text">
              Institutional memory ensures teams never re-learn what was already solved.
              Déjà recalls which remedies succeeded (e.g. rollback worked 4/4) and which routinely fail.
            </p>
          </div>

          {/* Feature 4: Investigation Workflow */}
          <div className="feature-card">
            <div className="feature-icon-wrap" aria-hidden="true">
              🎯
            </div>
            <h3 className="feature-card-title">Investigation Workflow</h3>
            <div style={{ color: "#38bdf8", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              "Move from a signal to an actionable investigation."
            </div>
            <p className="feature-card-text">
              On-call engineers query symptoms directly. Déjà traverses dependency hops, highlights
              anomalous upstream releases, and identifies the current and historical owners in seconds.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
