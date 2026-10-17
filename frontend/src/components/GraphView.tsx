import React, { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { GraphNode, GraphPayload } from "../api/client";
import GraphLegend from "./graph/GraphLegend";
import GraphTooltip from "./graph/GraphTooltip";
import { drawLink, drawNode, getNodeKind } from "./graph/renderers";
import type { VisualEdge, VisualNode } from "./graph/types";

export interface GraphViewProps {
  payload: GraphPayload | null;
  onNodeClick?: (node: GraphNode) => void;
  focusIds?: string[];
  height?: number | string;
}

export default function GraphView({
  payload,
  onNodeClick,
  focusIds = [],
  height = "100%",
}: GraphViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<VisualNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Persistent position cache to avoid scrambling node coordinates across updates
  const nodePosCache = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Score transition animation tracker (400ms duration)
  const scoreAnimMap = useRef<Map<string, { startScore: number; targetScore: number; startTime: number }>>(
    new Map()
  );

  // Top suspect memory to detect rank flips
  const prevTopServiceRef = useRef<string | null>(null);

  // Measure container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || 800,
          height: containerRef.current.clientHeight || 600,
        });
      }
    };
    updateSize();

    const ro = new ResizeObserver(updateSize);
    ro.observe(containerRef.current);
    window.addEventListener("resize", updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  // Track mouse coordinates for tooltip positioning
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // Convert raw GraphPayload to visual graph data with animations and styling flags
  const { graphData, hasHighlights, shouldPulse } = useMemo(() => {
    if (!payload || !payload.nodes || payload.nodes.length === 0) {
      return { graphData: { nodes: [], links: [] }, hasHighlights: false, shouldPulse: false };
    }

    const focusSet = new Set(focusIds);

    // Identify Service scores to detect top rank flips and near ties (within 0.25)
    const serviceNodes = payload.nodes
      .filter((n) => getNodeKind(n.label) === "Service")
      .map((n) => ({ service: n.name, score: n.score ?? 0 }))
      .sort((a, b) => b.score - a.score);

    const currentTop = serviceNodes[0]?.service || null;
    const topChanged =
      prevTopServiceRef.current !== null &&
      currentTop !== null &&
      prevTopServiceRef.current !== currentTop;
    prevTopServiceRef.current = currentTop;

    const nearTie =
      serviceNodes.length >= 2 &&
      Math.abs(serviceNodes[0].score - serviceNodes[1].score) <= 0.25;

    const pulseFlag = topChanged || nearTie;

    const nowTime = performance.now();

    // Map visual nodes
    const visualNodes: VisualNode[] = payload.nodes.map((node) => {
      const kind = getNodeKind(node.label);
      const isGhost = kind === "Evidence" && Boolean(node.props?.removed);
      const isFocused = focusSet.has(node.id);

      // Score animation tracking for Service nodes
      const currentScore = node.score ?? 0;
      let animScore = currentScore;
      if (kind === "Service") {
        const prevAnim = scoreAnimMap.current.get(node.id);
        if (prevAnim) {
          scoreAnimMap.current.set(node.id, {
            startScore: prevAnim.targetScore,
            targetScore: currentScore,
            startTime: nowTime,
          });
        } else {
          scoreAnimMap.current.set(node.id, {
            startScore: currentScore,
            targetScore: currentScore,
            startTime: nowTime,
          });
        }
      }

      // Check persistent coordinates
      const cached = nodePosCache.current.get(node.id);

      return {
        ...node,
        kind,
        isGhost,
        isFocused,
        pulse: pulseFlag && (node.highlight || isFocused),
        animScore,
        x: cached?.x,
        y: cached?.y,
      };
    });

    const ghostNodeIds = new Set(visualNodes.filter((n) => n.isGhost).map((n) => n.id));

    // Map visual links
    const visualLinks: VisualEdge[] = (payload.edges || []).map((edge) => {
      const isGhost =
        ghostNodeIds.has(String(edge.source)) ||
        ghostNodeIds.has(String(edge.target)) ||
        edge.type === "SUPPORTS" &&
          (ghostNodeIds.has(String(edge.source)) || Boolean(edge.props?.removed));

      return {
        ...edge,
        isGhost,
      };
    });

    const anyHighlight =
      visualNodes.some((n) => n.highlight) ||
      visualLinks.some((l) => l.highlight) ||
      focusSet.size > 0;

    return {
      graphData: { nodes: visualNodes, links: visualLinks },
      hasHighlights: anyHighlight,
      shouldPulse: pulseFlag,
    };
  }, [payload, focusIds]);

  // Animation frame loop for smooth score transition interpolation
  useEffect(() => {
    let animId: number;
    const animate = () => {
      const nowTime = performance.now();
      let hasActiveTransition = false;

      graphData.nodes.forEach((node) => {
        if (node.kind === "Service") {
          const anim = scoreAnimMap.current.get(node.id);
          if (anim) {
            const elapsed = nowTime - anim.startTime;
            const progress = Math.min(1, Math.max(0, elapsed / 400));
            // easeOutQuad
            const ease = 1 - (1 - progress) * (1 - progress);
            node.animScore = anim.startScore + (anim.targetScore - anim.startScore) * ease;
            if (progress < 1) {
              hasActiveTransition = true;
            }
          }
        }
      });

      if (hasActiveTransition || shouldPulse) {
        animId = requestAnimationFrame(animate);
      }
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [graphData, shouldPulse]);

  // Center / Zoom on focusIds
  useEffect(() => {
    if (!focusIds || focusIds.length === 0 || !fgRef.current) return;

    const matchedNodes = graphData.nodes.filter(
      (n) => focusIds.includes(n.id) && typeof n.x === "number" && typeof n.y === "number"
    );

    if (matchedNodes.length === 0) return;

    if (matchedNodes.length === 1) {
      const target = matchedNodes[0];
      fgRef.current.centerAt(target.x, target.y, 600);
      fgRef.current.zoom(2.4, 600);
    } else {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      matchedNodes.forEach((n) => {
        if (n.x !== undefined && n.y !== undefined) {
          minX = Math.min(minX, n.x);
          maxX = Math.max(maxX, n.x);
          minY = Math.min(minY, n.y);
          maxY = Math.max(maxY, n.y);
        }
      });
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      fgRef.current.centerAt(midX, midY, 600);
      fgRef.current.zoom(1.8, 600);
    }
  }, [focusIds, graphData]);

  // Cache node positions as the simulation runs
  const handleEngineTick = () => {
    graphData.nodes.forEach((n) => {
      if (typeof n.x === "number" && typeof n.y === "number") {
        nodePosCache.current.set(n.id, { x: n.x, y: n.y });
      }
    });
  };

  const handleNodeDragEnd = (node: any) => {
    if (node && typeof node.x === "number" && typeof node.y === "number") {
      nodePosCache.current.set(node.id, { x: node.x, y: node.y });
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      style={{
        position: "relative",
        width: "100%",
        height,
        backgroundColor: "#090d16",
        overflow: "hidden",
        borderRadius: 8,
      }}
    >
      {/* Empty State */}
      {(!payload || !payload.nodes || payload.nodes.length === 0) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#64748b",
            fontSize: 14,
            gap: 12,
            backgroundColor: "#090d16",
            border: "1px dashed #1e293b",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 32 }}>🕸️</div>
          <div style={{ fontWeight: 600, color: "#94a3b8" }}>No graph data loaded</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Select a service, view risk map, or trigger an incident alert to inspect dependencies.
          </div>
        </div>
      )}

      {/* Force Graph Canvas */}
      {payload && payload.nodes && payload.nodes.length > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          backgroundColor="#090d16"
          nodeRelSize={6}
          nodeCanvasObject={(node, ctx, globalScale) =>
            drawNode(node as VisualNode, ctx, globalScale, hasHighlights)
          }
          linkCanvasObject={(link, ctx, globalScale) =>
            drawLink(link as VisualEdge, ctx, globalScale, hasHighlights)
          }
          nodePointerAreaPaint={(node: any, color, ctx) => {
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, (node.radius ?? 8) + 6, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          onNodeClick={(node: any) => onNodeClick?.(node as GraphNode)}
          onNodeHover={(node: any) => setHoveredNode(node as VisualNode | null)}
          onEngineTick={handleEngineTick}
          onNodeDragEnd={handleNodeDragEnd}
          cooldownTicks={120}
          warmupTicks={30}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
      )}

      {/* Interactive Legend Overlay */}
      <GraphLegend />

      {/* Hover Node Tooltip Card */}
      <GraphTooltip node={hoveredNode} x={mousePos.x} y={mousePos.y} />
    </div>
  );
}
