import type { NodeKind } from "./types";

export interface NodeStyleConfig {
  fill: string;
  stroke: string;
  text: string;
  glow: string;
  badge?: string;
}

export const NODE_COLORS: Record<NodeKind, NodeStyleConfig> = {
  Service: {
    fill: "#0f172a",
    stroke: "#38bdf8",
    text: "#f8fafc",
    glow: "rgba(56, 189, 248, 0.6)",
  },
  Incident: {
    fill: "#1e1e2e",
    stroke: "#f43f5e",
    text: "#ffffff",
    glow: "rgba(244, 63, 94, 0.8)",
  },
  Deploy: {
    fill: "#1e293b",
    stroke: "#60a5fa",
    text: "#e2e8f0",
    glow: "rgba(96, 165, 250, 0.5)",
  },
  Engineer: {
    fill: "#064e3b",
    stroke: "#34d399",
    text: "#ffffff",
    glow: "rgba(52, 211, 153, 0.6)",
  },
  Fix: {
    fill: "#1e1b4b",
    stroke: "#c084fc",
    text: "#ffffff",
    glow: "rgba(192, 132, 252, 0.6)",
  },
  Evidence: {
    fill: "#083344",
    stroke: "#22d3ee",
    text: "#ffffff",
    glow: "rgba(34, 211, 238, 0.6)",
  },
  Unknown: {
    fill: "#1e293b",
    stroke: "#64748b",
    text: "#94a3b8",
    glow: "rgba(148, 163, 184, 0.3)",
  },
};

export const FOCAL_NODE_STYLE: NodeStyleConfig = {
  fill: "#047857",
  stroke: "#34d399",
  text: "#ffffff",
  glow: "rgba(16, 185, 129, 0.95)",
};

export const GHOST_EVIDENCE_STYLE: NodeStyleConfig = {
  fill: "rgba(15, 23, 42, 0.4)",
  stroke: "#475569",
  text: "#64748b",
  glow: "transparent",
};

export interface EdgeStyleConfig {
  color: string;
  dash: number[];
  width: number;
  arrow: boolean;
}

export function getEdgeStyle(
  type: string,
  props?: Record<string, any>,
  highlight = false,
  isGhost = false
): EdgeStyleConfig {
  if (isGhost) {
    return {
      color: "rgba(100, 116, 139, 0.3)",
      dash: [3, 3],
      width: 0.8,
      arrow: false,
    };
  }

  const baseAlpha = highlight ? 1.0 : 0.38;

  switch (type) {
    case "DEPENDS_ON":
      return {
        color: highlight ? "#38bdf8" : `rgba(34, 211, 238, ${baseAlpha})`,
        dash: [],
        width: highlight ? 2.2 : 0.85,
        arrow: highlight,
      };

    case "ATTEMPTED": {
      const status = props?.status?.toUpperCase();
      if (status === "SUCCESS") {
        return {
          color: highlight ? "#4ade80" : `rgba(34, 197, 94, ${baseAlpha * 1.5})`,
          dash: [],
          width: highlight ? 2.6 : 1.4,
          arrow: false,
        };
      }
      // FAILED
      return {
        color: highlight ? "#f87171" : `rgba(239, 68, 68, ${baseAlpha * 1.5})`,
        dash: [4, 3],
        width: highlight ? 2.6 : 1.4,
        arrow: false,
      };
    }

    case "ORIGINATED_IN":
      return {
        color: highlight ? "#fb923c" : `rgba(249, 115, 22, ${baseAlpha})`,
        dash: [4, 3],
        width: highlight ? 2.2 : 1.0,
        arrow: highlight,
      };

    case "IMPACTED":
      return {
        color: highlight ? "#fb7185" : `rgba(244, 63, 94, ${baseAlpha})`,
        dash: [2, 2],
        width: highlight ? 2.0 : 0.9,
        arrow: highlight,
      };

    case "FOLLOWED":
      return {
        color: highlight ? "#c084fc" : `rgba(168, 85, 247, ${baseAlpha})`,
        dash: [3, 2],
        width: highlight ? 2.0 : 0.85,
        arrow: highlight,
      };

    case "TO":
      return {
        color: highlight ? "#60a5fa" : `rgba(56, 189, 248, ${baseAlpha})`,
        dash: [],
        width: highlight ? 2.0 : 0.85,
        arrow: highlight,
      };

    case "AUTHORED_BY":
      return {
        color: highlight ? "#34d399" : `rgba(52, 211, 153, ${baseAlpha})`,
        dash: [3, 3],
        width: highlight ? 1.8 : 0.85,
        arrow: false,
      };

    case "SUPPORTS": {
      const weight = typeof props?.weight === "number" ? props.weight : 1.0;
      const scaledWidth = Math.max(0.85, Math.min(3.5, weight * 0.9));
      return {
        color: highlight ? "#22d3ee" : `rgba(45, 212, 191, ${baseAlpha * 1.2})`,
        dash: [],
        width: highlight ? scaledWidth + 1.2 : scaledWidth,
        arrow: highlight,
      };
    }

    default:
      return {
        color: highlight ? "#38bdf8" : `rgba(34, 211, 238, ${baseAlpha})`,
        dash: [],
        width: highlight ? 2.0 : 0.85,
        arrow: highlight,
      };
  }
}
