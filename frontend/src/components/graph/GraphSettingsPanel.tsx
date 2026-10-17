import React, { useState } from "react";
import ObsidianSlider from "./ObsidianSlider";
import { DEFAULT_GRAPH_SETTINGS, type GraphSettings } from "./types";

export interface GraphSettingsPanelProps {
  settings: GraphSettings;
  onSettingsChange: (settings: GraphSettings) => void;
  onAnimate: () => void;
  isAnimating?: boolean;
  onClose?: () => void;
}

export default function GraphSettingsPanel({
  settings,
  onSettingsChange,
  onAnimate,
  isAnimating = false,
  onClose,
}: GraphSettingsPanelProps): JSX.Element {
  const [forcesExpanded, setForcesExpanded] = useState(true);

  const updateSetting = <K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  };

  const handleResetDefaults = () => {
    onSettingsChange({ ...DEFAULT_GRAPH_SETTINGS });
  };

  return (
    <div
      className="obsidian-scroll"
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        zIndex: 30,
        width: 380,
        maxWidth: "calc(100% - 28px)",
        maxHeight: "calc(100% - 28px)",
        overflowY: "auto",
        backgroundColor: "rgba(15, 23, 42, 0.94)",
        border: "1px solid rgba(51, 65, 85, 0.8)",
        borderRadius: 18,
        padding: "18px 20px",
        color: "#f1f5f9",
        backdropFilter: "blur(12px)",
        boxShadow: "0 16px 40px -6px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          paddingBottom: 10,
          borderBottom: "1px solid rgba(51, 65, 85, 0.5)",
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#f8fafc",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Graph settings
        </span>

        {onClose && (
          <button
            onClick={onClose}
            className="obsidian-icon-btn"
            title="Close settings"
            aria-label="Close settings"
            style={{ width: 28, height: 28, borderRadius: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Main Controls */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Negative-valued repulsion slider at the top */}
        <ObsidianSlider
          label="Repulsion"
          value={settings.repulsion}
          min={-600}
          max={-40}
          step={10}
          onChange={(val) => updateSetting("repulsion", val)}
        />

        {/* Node size */}
        <ObsidianSlider
          label="Node size"
          value={settings.nodeScale}
          min={0.4}
          max={2.5}
          step={0.1}
          onChange={(val) => updateSetting("nodeScale", val)}
        />

        {/* Link thickness */}
        <ObsidianSlider
          label="Link thickness"
          value={settings.linkThickness}
          min={0.4}
          max={3.0}
          step={0.1}
          onChange={(val) => updateSetting("linkThickness", val)}
        />

        {/* Animate Button */}
        <div style={{ marginTop: 4 }}>
          <button
            onClick={onAnimate}
            disabled={isAnimating}
            className={`obsidian-animate-btn ${isAnimating ? "animating" : ""}`}
            aria-label="Animate graph"
          >
            {isAnimating ? (
              <>
                <svg
                  style={{ animation: "spin 1s linear infinite" }}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span>Animating...</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Animate</span>
              </>
            )}
          </button>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid rgba(51, 65, 85, 0.5)", margin: "4px 0" }} />

        {/* Collapsible Forces Section */}
        <div>
          <button
            onClick={() => setForcesExpanded(!forcesExpanded)}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              padding: "4px 0 8px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              color: "#e2e8f0",
              fontWeight: 600,
              fontSize: 13,
              userSelect: "none",
            }}
            aria-expanded={forcesExpanded}
          >
            <span>Forces</span>
            <span style={{ fontSize: 11, color: "#94a3b8", transition: "transform 0.15s ease" }}>
              {forcesExpanded ? "▼" : "▶"}
            </span>
          </button>

          {forcesExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6, paddingLeft: 2 }}>
              {/* Centre force */}
              <ObsidianSlider
                label="Centre force"
                value={settings.centreForce}
                min={0.0}
                max={1.0}
                step={0.05}
                onChange={(val) => updateSetting("centreForce", val)}
              />

              {/* Repel force */}
              <ObsidianSlider
                label="Repel force"
                value={settings.repelForce}
                min={50}
                max={1000}
                step={25}
                onChange={(val) => updateSetting("repelForce", val)}
              />

              {/* Link force */}
              <ObsidianSlider
                label="Link force"
                value={settings.linkForce}
                min={0.1}
                max={2.0}
                step={0.1}
                onChange={(val) => updateSetting("linkForce", val)}
              />

              {/* Link distance */}
              <ObsidianSlider
                label="Link distance"
                value={settings.linkDistance}
                min={20}
                max={200}
                step={5}
                onChange={(val) => updateSetting("linkDistance", val)}
              />
            </div>
          )}
        </div>

        {/* Footer Reset */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={handleResetDefaults}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#94a3b8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
          >
            Reset forces to default
          </button>
        </div>
      </div>
    </div>
  );
}
