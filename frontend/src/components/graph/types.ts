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
