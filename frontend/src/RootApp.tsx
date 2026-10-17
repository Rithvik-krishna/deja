import React, { useEffect, useState } from "react";
import App from "./App";
import LandingPage from "./landing/LandingPage";

export type RouteView = "landing" | "app";

export function getInitialRoute(): RouteView {
  if (typeof window === "undefined") return "landing";
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();

  if (
    path === "/app" ||
    path.startsWith("/app/") ||
    hash === "#app" ||
    hash === "#/app" ||
    search.includes("view=app")
  ) {
    return "app";
  }

  return "landing";
}

export default function RootApp(): JSX.Element {
  const [route, setRoute] = useState<RouteView>(getInitialRoute);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(getInitialRoute());
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handlePopState);
    };
  }, []);

  const navigateToApp = () => {
    try {
      window.history.pushState(null, "", "/app");
    } catch {
      window.location.hash = "#app";
    }
    setRoute("app");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const navigateToLanding = () => {
    try {
      window.history.pushState(null, "", "/");
    } catch {
      window.location.hash = "";
    }
    setRoute("landing");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (route === "app") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Subtle home button floating in app mode */}
        <button
          onClick={navigateToLanding}
          style={{
            position: "fixed",
            bottom: 12,
            right: 12,
            zIndex: 1000,
            background: "rgba(15, 23, 42, 0.92)",
            border: "1px solid rgba(51, 65, 85, 0.8)",
            color: "#94a3b8",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#f8fafc";
            e.currentTarget.style.borderColor = "#38bdf8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#94a3b8";
            e.currentTarget.style.borderColor = "rgba(51, 65, 85, 0.8)";
          }}
          title="Back to Landing Page"
        >
          <span>←</span>
          <span>Landing Page</span>
        </button>

        <App />
      </div>
    );
  }

  return <LandingPage onLaunchApp={navigateToApp} />;
}
