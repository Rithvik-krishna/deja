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
    fill: "#0284c7",
    stroke: "#38bdf8",
    text: "#ffffff",
    glow: "rgba(56, 189, 248, 0.7)",
  },
  Incident: {
    fill: "#be123c",
    stroke: "#f43f5e",
    text: "#ffffff",
    glow: "rgba(244, 63, 94, 0.8)",
  },
  Deploy: {
    fill: "#d97706",
    stroke: "#fbbf24",
    text: "#ffffff",
    glow: "rgba(251, 191, 36, 0.7)",
  },
  Engineer: {
    fill: "#047857",
    stroke: "#34d399",
    text: "#ffffff",
    glow: "rgba(52, 211, 153, 0.6)",
  },
  Fix: {
    fill: "#7e22ce",
    stroke: "#c084fc",
    text: "#ffffff",
    glow: "rgba(192, 132, 252, 0.7)",
  },
  Evidence: {
    fill: "#0e7490",
    stroke: "#22d3ee",
    text: "#ffffff",
    glow: "rgba(34, 211, 238, 0.6)",
  },
  Unknown: {
    fill: "#334155",
    stroke: "#94a3b8",
    text: "#f8fafc",
    glow: "rgba(148, 163, 184, 0.4)",
  },
};

export const GHOST_EVIDENCE_STYLE: NodeStyleConfig = {
  fill: "rgba(30, 41, 59, 0.45)",
  stroke: "#64748b",
  text: "#94a3b8",
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
      color: "rgba(100, 116, 139, 0.45)",
      dash: [4, 4],
      width: 1.2,
      arrow: true,
    };
  }

  const baseAlpha = highlight ? 1.0 : 0.65;

  switch (type) {
    case "DEPENDS_ON":
      return {
        color: highlight ? "#38bdf8" : `rgba(71, 85, 105, ${baseAlpha * 0.75})`,
        dash: [],
        width: highlight ? 2.8 : 1.4,
        arrow: true,
      };

    case "ATTEMPTED": {
      const status = props?.status?.toUpperCase();
      if (status === "SUCCESS") {
        return {
          color: highlight ? "#4ade80" : `rgba(34, 197, 94, ${baseAlpha})`,
          dash: [],
          width: highlight ? 3.0 : 2.0,
          arrow: false,
        };
      }
      // FAILED
      return {
        color: highlight ? "#f87171" : `rgba(239, 68, 68, ${baseAlpha})`,
        dash: [5, 4],
        width: highlight ? 3.0 : 2.0,
        arrow: false,
      };
    }

    case "ORIGINATED_IN":
      return {
        color: highlight ? "#fb923c" : `rgba(249, 115, 22, ${baseAlpha})`,
        dash: [6, 3],
        width: highlight ? 2.8 : 1.8,
        arrow: true,
      };

    case "IMPACTED":
      return {
        color: highlight ? "#fb7185" : `rgba(244, 63, 94, ${baseAlpha})`,
        dash: [2, 2],
        width: highlight ? 2.5 : 1.5,
        arrow: true,
      };

    case "FOLLOWED":
      return {
        color: highlight ? "#c084fc" : `rgba(168, 85, 247, ${baseAlpha})`,
        dash: [3, 3],
        width: highlight ? 2.2 : 1.4,
        arrow: true,
      };

    case "TO":
      return {
        color: highlight ? "#60a5fa" : `rgba(96, 165, 250, ${baseAlpha})`,
        dash: [],
        width: highlight ? 2.2 : 1.4,
        arrow: true,
      };

    case "AUTHORED_BY":
      return {
        color: highlight ? "#34d399" : `rgba(52, 211, 153, ${baseAlpha})`,
        dash: [4, 3],
        width: highlight ? 2.0 : 1.2,
        arrow: false,
      };

    case "SUPPORTS": {
      const weight = typeof props?.weight === "number" ? props.weight : 1.0;
      const scaledWidth = Math.max(1.2, Math.min(6.5, weight * 1.5));
      return {
        color: highlight ? "#22d3ee" : `rgba(6, 182, 212, ${baseAlpha})`,
        dash: [],
        width: highlight ? scaledWidth + 1.5 : scaledWidth,
        arrow: true,
      };
    }

    default:
      return {
        color: highlight ? "#cbd5e1" : `rgba(148, 163, 184, ${baseAlpha})`,
        dash: [],
        width: highlight ? 2.0 : 1.0,
        arrow: true,
      };
  }
}
