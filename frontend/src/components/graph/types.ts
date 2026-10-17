import type { GraphEdge, GraphNode } from "../../api/client";

export type NodeKind = "Service" | "Incident" | "Deploy" | "Engineer" | "Fix" | "Evidence" | "Unknown";

export interface VisualNode extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  radius?: number;
  animScore?: number;
  kind: NodeKind;
  isFocused?: boolean;
  isGhost?: boolean;
  pulse?: boolean;
}

export interface VisualEdge extends Omit<GraphEdge, "source" | "target"> {
  source: string | VisualNode;
  target: string | VisualNode;
  isGhost?: boolean;
}

export interface GraphData {
  nodes: VisualNode[];
  links: VisualEdge[];
}

export interface GraphSettings {
  repulsion: number;       // Repulsion / Graph spacing (d3 charge strength, negative)
  nodeScale: number;       // Node size scale factor (0.4 - 2.5)
  linkThickness: number;   // Link thickness scale factor (0.4 - 3.0)
  centreForce: number;     // Canvas center pull strength (0.0 - 1.0)
  repelForce: number;      // Repel distance limit (50 - 1000)
  linkForce: number;       // Link pull strength (0.1 - 2.0)
  linkDistance: number;    // Link target distance (20 - 200)
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  repulsion: -160,
  nodeScale: 1.0,
  linkThickness: 0.85,
  centreForce: 0.42,
  repelForce: 360,
  linkForce: 0.95,
  linkDistance: 48,
};
