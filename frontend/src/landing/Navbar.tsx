import React, { useState } from "react";
import type { Theme } from "./useTheme";

export interface NavbarProps {
  theme: Theme;
  onToggleTheme: () => void;
  onLaunchApp: () => void;
}

export default function Navbar({
  theme,
  onToggleTheme,
  onLaunchApp,
}: NavbarProps): JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetId: string
  ) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header className="landing-navbar" role="banner">
      <div className="landing-container">
        <div className="navbar-inner">
          {/* Logo */}
          <a
            href="/"
            className="nav-logo"
            aria-label="Déjà Home"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="12" cy="18" r="3" />
              <line x1="8.5" y1="7.5" x2="10" y2="15.5" />
              <line x1="15.5" y1="7.5" x2="14" y2="15.5" />
              <line x1="9" y1="6" x2="15" y2="6" />
            </svg>
            <span>Déjà</span>
          </a>

          {/* Desktop Nav Links */}
          <nav className="nav-links" aria-label="Main Navigation">
            <a
              href="#overview"
              className="nav-link"
              onClick={(e) => handleNavClick(e, "overview")}
            >
              Product
            </a>
            <a
              href="#how-it-works"
              className="nav-link"
              onClick={(e) => handleNavClick(e, "how-it-works")}
            >
              How it works
            </a>
            <a
              href="#features"
              className="nav-link"
              onClick={(e) => handleNavClick(e, "features")}
            >
              Features
            </a>
            <a
              href="#interactive-demo"
              className="nav-link"
              onClick={(e) => handleNavClick(e, "interactive-demo")}
            >
              Demo
            </a>
          </nav>

          {/* Actions: Theme Toggle & Primary CTA */}
          <div className="nav-actions">
            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              className="theme-toggle-btn"
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? (
                // Sun Icon
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                // Moon Icon
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Launch App Button */}
            <button
              onClick={onLaunchApp}
              className="deja-btn-primary"
              aria-label="Explore live demo in full workspace"
            >
              <span>Explore demo</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="theme-toggle-btn"
              style={{ display: "none" }}
              aria-label="Toggle mobile menu"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div
            style={{
              padding: "16px 0",
              borderTop: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <a
              href="#overview"
              className="nav-link"
              onClick={(e) => handleNavClick(e, "overview")}
            >
              Product
            </a>
            <a
              href="#how-it-works"
              className="nav-link"
              onClick={(e) => handleNavClick(e, "how-it-works")}
            >
              How it works
            </a>
            <a
              href="#features"
              className="nav-link"
              onClick={(e) => handleNavClick(e, "features")}
            >
              Features
            </a>
            <a
              href="#interactive-demo"
              className="nav-link"
              onClick={(e) => handleNavClick(e, "interactive-demo")}
            >
              Demo
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
