import React from "react";

export interface ObsidianSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue?: (val: number) => string;
}

export default function ObsidianSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
}: ObsidianSliderProps): JSX.Element {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const displayVal = formatValue
    ? formatValue(value)
    : step < 0.1
    ? value.toFixed(2)
    : step < 1
    ? value.toFixed(1)
    : String(Math.round(value));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* Large numeric value on the left */}
        <span
          style={{
            minWidth: 54,
            fontSize: 19,
            fontWeight: 600,
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#f8fafc",
            textAlign: "left",
            letterSpacing: "-0.02em",
          }}
        >
          {displayVal}
        </span>

        {/* Custom styled slider on the right */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="obsidian-range-input"
            aria-label={label}
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${percentage}%, #334155 ${percentage}%, #334155 100%)`,
            }}
          />
        </div>
      </div>

      {/* Label underneath */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "#94a3b8",
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </span>
    </div>
  );
}
