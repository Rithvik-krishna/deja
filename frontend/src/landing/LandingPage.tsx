import React from "react";
import FeaturesSection from "./FeaturesSection";
import FinalCTASection from "./FinalCTASection";
import Footer from "./Footer";
import HeroSection from "./HeroSection";
import HowItWorksSection from "./HowItWorksSection";
import InteractiveGraphDemo from "./InteractiveGraphDemo";
import "./landing.css";
import Navbar from "./Navbar";
import ProductPreviewSection from "./ProductPreviewSection";
import { useTheme } from "./useTheme";

export interface LandingPageProps {
  onLaunchApp: () => void;
}

export default function LandingPage({
  onLaunchApp,
}: LandingPageProps): JSX.Element {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="landing-wrap landing-grid-bg">
      {/* Sticky Navigation */}
      <Navbar
        theme={theme}
        onToggleTheme={toggleTheme}
        onLaunchApp={onLaunchApp}
      />

      <main>
        {/* Hero Section */}
        <HeroSection theme={theme} onLaunchApp={onLaunchApp} />

        {/* Automated Interactive Graph Demonstration (Phase 5, 6, 7) */}
        <section
          style={{ padding: "40px 0 80px 0" }}
          aria-label="Interactive Product Demonstration"
        >
          <div className="landing-container">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div className="eyebrow-pill">SELF-RUNNING INTERACTIVE PREVIEW</div>
              <h2 className="section-title">Experience the investigation in action</h2>
              <p className="section-subtext" style={{ maxWidth: 640, margin: "0 auto" }}>
                Step through the 7-stage incident resolution story or click any node to explore
                dependencies, releases, and counterfactual evidence shock in real time.
              </p>
            </div>

            <InteractiveGraphDemo theme={theme} onLaunchApp={onLaunchApp} />
          </div>
        </section>

        {/* How It Works (Phase 9) */}
        <HowItWorksSection />

        {/* Core Product Features (Phase 8) */}
        <FeaturesSection />

        {/* Realistic Product Workspace Preview (Phase 10) */}
        <ProductPreviewSection />

        {/* Final Call to Action (Phase 11) */}
        <FinalCTASection onLaunchApp={onLaunchApp} />
      </main>

      {/* Footer (Phase 12) */}
      <Footer theme={theme} onLaunchApp={onLaunchApp} />
    </div>
  );
}
