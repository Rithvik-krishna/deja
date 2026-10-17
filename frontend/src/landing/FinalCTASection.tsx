import React from "react";

export interface FinalCTASectionProps {
  onLaunchApp: () => void;
}

export default function FinalCTASection({
  onLaunchApp,
}: FinalCTASectionProps): JSX.Element {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section
      style={{
        padding: "96px 0",
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
        textAlign: "center",
      }}
      aria-label="Call to Action"
    >
      <div className="landing-container">
        <div style={{ maxWidth: 660, margin: "0 auto" }}>
          <div className="eyebrow-pill" style={{ marginBottom: 16 }}>
            GET STARTED TODAY
          </div>

          <h2
            style={{
              fontSize: "clamp(30px, 4vw, 44px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--text)",
              marginBottom: 16,
              lineHeight: 1.15,
            }}
          >
            Make the next incident less unfamiliar.
          </h2>

          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: "var(--text-muted)",
              marginBottom: 32,
            }}
          >
            Explore how connected evidence can help your team understand the
            relationships behind an incident. Experience the full interactive copilot
            or run the live demo with zero configuration.
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={onLaunchApp}
              className="deja-btn-primary"
              style={{ padding: "13px 28px", fontSize: 16 }}
              aria-label="Launch full Déjà Incident Copilot"
            >
              <span>Explore the demo</span>
              <svg
                width="16"
                height="16"
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
              onClick={scrollToTop}
              className="deja-btn-secondary"
              style={{ padding: "13px 24px", fontSize: 16 }}
              aria-label="Return to top of page"
            >
              Back to overview ↑
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
