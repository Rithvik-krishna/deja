import React from "react";
import type { Theme } from "./useTheme";

export interface FooterProps {
  theme: Theme;
  onLaunchApp: () => void;
}

export default function Footer({
  theme,
  onLaunchApp,
}: FooterProps): JSX.Element {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="landing-footer" role="contentinfo">
      <div className="landing-container">
        <div className="footer-top">
          {/* Brand Info */}
          <div style={{ maxWidth: 360 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.2"
              >
                <circle cx="6" cy="6" r="3" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="12" cy="18" r="3" />
                <line x1="8.5" y1="7.5" x2="10" y2="15.5" />
                <line x1="15.5" y1="7.5" x2="14" y2="15.5" />
                <line x1="9" y1="6" x2="15" y2="6" />
              </svg>
              <strong style={{ fontSize: 18, color: "var(--text)" }}>Déjà</strong>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
              On-call incident copilot with institutional graph memory, powered by Neo4j.
              Connecting services, deploys, owners, and past outcomes.
            </p>
          </div>

          {/* Navigation Links */}
          <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                Product
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <a href="#overview" onClick={(e) => { e.preventDefault(); scrollTo("overview"); }} className="nav-link">
                  Overview
                </a>
                <a href="#how-it-works" onClick={(e) => { e.preventDefault(); scrollTo("how-it-works"); }} className="nav-link">
                  How it works
                </a>
                <a href="#features" onClick={(e) => { e.preventDefault(); scrollTo("features"); }} className="nav-link">
                  Features
                </a>
                <a href="#interactive-demo" onClick={(e) => { e.preventDefault(); scrollTo("interactive-demo"); }} className="nav-link">
                  Interactive Demo
                </a>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                Application
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <button
                  onClick={onLaunchApp}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    textAlign: "left",
                    color: "var(--primary)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Launch Déjà Copilot →
                </button>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  Theme: {theme === "dark" ? "Dark mode" : "Light mode"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="footer-bottom">
          <span>© 2026 Déjà. Built for Neo4j × hackFront Build Sprint.</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
            Institutional memory on graph
          </span>
        </div>
      </div>
    </footer>
  );
}
