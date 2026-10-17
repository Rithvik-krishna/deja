import React, { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { CatalogService, GraphNode, GraphPayload } from "../api/client";
import GraphLegend from "./graph/GraphLegend";
import GraphSettingsPanel from "./graph/GraphSettingsPanel";
import GraphTooltip from "./graph/GraphTooltip";
import ServiceInspector from "./graph/ServiceInspector";
import "./graph/obsidian-graph.css";
import { drawLink, drawNode, getNodeKind } from "./graph/renderers";
import {
  DEFAULT_GRAPH_SETTINGS,
  type GraphSettings,
  type VisualEdge,
  type VisualNode,
} from "./graph/types";

export interface GraphViewProps {
  payload: GraphPayload | null;
  onNodeClick?: (node: GraphNode) => void;
  focusIds?: string[];
  height?: number | string;
  onAskChat?: (prompt: string) => void;
  onViewOwners?: (serviceName: string) => void;
  onStressTest?: (serviceName?: string) => void;
  catalogServices?: CatalogService[];
  graphMode?: "topology" | "evidence";
  onGraphModeChange?: (mode: "topology" | "evidence") => void;
}

interface ViewHistoryItem {
  focusIds: string[];
  label: string;
}

export default function GraphView({
  payload,
  onNodeClick,
  focusIds = [],
  height = "100%",
  onAskChat,
  onViewOwners,
  onStressTest,
  catalogServices,
  graphMode = "topology",
  onGraphModeChange,
}: GraphViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<VisualNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Obsidian graph settings
  const [settings, setSettings] = useState<GraphSettings>({ ...DEFAULT_GRAPH_SETTINGS });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOverflowMenuOpen, setIsOverflowMenuOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [legendVisible, setLegendVisible] = useState(true);

  // View navigation history for Back / Forward buttons
  const [history, setHistory] = useState<ViewHistoryItem[]>([{ focusIds: [], label: "Initial view" }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isNavigatingRef = useRef(false);

  // Persistent position cache to avoid scrambling node coordinates across updates
  const nodePosCache = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Score transition animation tracker (400ms duration)
  const scoreAnimMap = useRef<Map<string, { startScore: number; targetScore: number; startTime: number }>>(
    new Map()
  );

  // Top suspect memory to detect rank flips
  const prevTopServiceRef = useRef<string | null>(null);

  // Sync external focusIds with selectedNode
  useEffect(() => {
    if (focusIds.length === 1 && payload?.nodes) {
      const match = payload.nodes.find(
        (n) => n.id === focusIds[0] || n.name === focusIds[0].replace(/^svc:/, "")
      );
      if (match) {
        setSelectedNode(match);
      }
    }
  }, [focusIds, payload]);

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

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(updateSize);
      ro.observe(containerRef.current);
    }
    window.addEventListener("resize", updateSize);
    return () => {
      ro?.disconnect();
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

    const currentFocus = history[historyIndex]?.focusIds ?? focusIds;
    const focusSet = new Set(currentFocus);

    // Connected neighbors when a node is selected
    const selectedId = selectedNode?.id;
    const connectedNodeIds = new Set<string>();
    const connectedEdgeIds = new Set<string>();
    if (selectedId) {
      connectedNodeIds.add(selectedId);
      (payload.edges || []).forEach((e) => {
        if (e.source === selectedId || e.target === selectedId) {
          connectedEdgeIds.add(e.id);
          connectedNodeIds.add(String(e.source));
          connectedNodeIds.add(String(e.target));
        }
      });
    }

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
      const isSelected = selectedId === node.id;
      const isNeighbor = Boolean(selectedId && connectedNodeIds.has(node.id));
      const isFocused = focusSet.has(node.id) || isSelected;
      const isHighlight = Boolean(node.highlight || isFocused || isNeighbor);

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
        highlight: isHighlight,
        pulse: pulseFlag && (isHighlight || isFocused),
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
        (edge.type === "SUPPORTS" &&
          (ghostNodeIds.has(String(edge.source)) || Boolean(edge.props?.removed)));

      const isEdgeSelected = Boolean(selectedId && connectedEdgeIds.has(edge.id));
      const highlight = Boolean(edge.highlight || isEdgeSelected);

      return {
        ...edge,
        isGhost,
        highlight,
      };
    });

    const anyHighlight =
      visualNodes.some((n) => n.highlight || n.isFocused) ||
      visualLinks.some((l) => l.highlight) ||
      focusSet.size > 0 ||
      Boolean(selectedId);

    return {
      graphData: { nodes: visualNodes, links: visualLinks },
      hasHighlights: anyHighlight,
      shouldPulse: pulseFlag,
    };
  }, [payload, focusIds, history, historyIndex, selectedNode]);

  // Matching services for search autocomplete
  const matchingServices = useMemo(() => {
    if (!payload?.nodes || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return payload.nodes
      .filter((n) => {
        const name = (n.name || n.id).toLowerCase();
        return name.includes(q) || n.id.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [payload?.nodes, searchQuery]);

  const handleSelectSearchedService = (targetNode: GraphNode) => {
    setSelectedNode(targetNode);
    setSearchQuery("");
    setIsSearchFocused(false);
    onNodeClick?.(targetNode);

    // Center on selected node
    const matched = graphData.nodes.find((n) => n.id === targetNode.id);
    if (matched && typeof matched.x === "number" && typeof matched.y === "number" && fgRef.current) {
      fgRef.current.centerAt(matched.x, matched.y, 600);
      fgRef.current.zoom(2.4, 600);
    }

    // Push into navigation history
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      next.push({
        focusIds: [targetNode.id],
        label: targetNode.name || targetNode.id,
      });
      return next;
    });
    setHistoryIndex((prev) => prev + 1);
  };

  // Track incoming focusIds into view navigation history
  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }
    if (focusIds.length === 0) return;

    setHistory((prev) => {
      const last = prev[prev.length - 1];
      const same =
        last &&
        last.focusIds.length === focusIds.length &&
        last.focusIds.every((id, i) => id === focusIds[i]);
      if (same) return prev;

      const next = prev.slice(0, historyIndex + 1);
      next.push({
        focusIds,
        label: focusIds.join(", "),
      });
      return next;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [focusIds]);

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

  // Center / Zoom on active focus
  const currentActiveFocus = history[historyIndex]?.focusIds ?? focusIds;
  useEffect(() => {
    if (!currentActiveFocus || currentActiveFocus.length === 0 || !fgRef.current) return;

    const matchedNodes = graphData.nodes.filter(
      (n) => currentActiveFocus.includes(n.id) && typeof n.x === "number" && typeof n.y === "number"
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
  }, [currentActiveFocus, graphData]);

  // Apply d3 forces dynamically when Obsidian slider settings change
  useEffect(() => {
    if (!fgRef.current) return;
    const fg = fgRef.current;

    // Charge / Repulsion force
    const chargeForce = fg.d3Force("charge");
    if (chargeForce) {
      if (typeof chargeForce.strength === "function") {
        chargeForce.strength(settings.repulsion);
      }
      if (typeof chargeForce.distanceMax === "function") {
        chargeForce.distanceMax(settings.repelForce);
      }
    }

    // Center force
    const centerForce = fg.d3Force("center");
    if (centerForce && typeof centerForce.strength === "function") {
      centerForce.strength(settings.centreForce);
    }

    // Link force & distance
    const linkForce = fg.d3Force("link");
    if (linkForce) {
      if (typeof linkForce.distance === "function") {
        linkForce.distance(settings.linkDistance);
      }
      if (typeof linkForce.strength === "function") {
        linkForce.strength(settings.linkForce);
      }
    }

    fg.d3ReheatSimulation();
  }, [
    settings.repulsion,
    settings.centreForce,
    settings.repelForce,
    settings.linkForce,
    settings.linkDistance,
  ]);

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

  // Animate button handler
  const handleAnimate = () => {
    if (!fgRef.current) return;
    setIsAnimating(true);
    fgRef.current.d3ReheatSimulation();
    setTimeout(() => {
      setIsAnimating(false);
    }, 1200);
  };

  // Navigation handlers
  const handleGoBack = () => {
    if (historyIndex > 0) {
      isNavigatingRef.current = true;
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleGoForward = () => {
    if (historyIndex < history.length - 1) {
      isNavigatingRef.current = true;
      setHistoryIndex(historyIndex + 1);
    }
  };

  // Node click with history push & inspector opening
  const handleInternalNodeClick = (node: GraphNode) => {
    setSelectedNode(node);
    onNodeClick?.(node);

    // Push into navigation history
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      next.push({
        focusIds: [node.id],
        label: node.name || node.id,
      });
      return next;
    });
    setHistoryIndex((prev) => prev + 1);
  };

  // Overflow menu actions
  const handleResetView = () => {
    setIsOverflowMenuOpen(false);
    if (!fgRef.current) return;
    fgRef.current.centerAt(0, 0, 500);
    fgRef.current.zoom(1, 500);
  };

  const handleFitScreen = () => {
    setIsOverflowMenuOpen(false);
    if (!fgRef.current) return;
    fgRef.current.zoomToFit(500, 40);
  };

  const handleToggleSettings = () => {
    setIsOverflowMenuOpen(false);
    setIsSettingsOpen((prev) => !prev);
  };

  const handleToggleLegend = () => {
    setIsOverflowMenuOpen(false);
    setLegendVisible((prev) => !prev);
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
      {/* Sleek Obsidian-style Header Bar */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 14,
          right: 14,
          zIndex: 25,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          pointerEvents: "none",
          flexWrap: "wrap",
        }}
      >
        {/* Left: History navigation & Mode Switch */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            pointerEvents: "auto",
          }}
        >
          {/* Navigation History Controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              border: "1px solid rgba(51, 65, 85, 0.6)",
              borderRadius: 8,
              padding: "2px 4px",
              backdropFilter: "blur(8px)",
            }}
          >
            <button
              onClick={handleGoBack}
              disabled={historyIndex <= 0}
              className="obsidian-icon-btn"
              title="Go back in view history"
              aria-label="Go back in view history"
              style={{ width: 26, height: 26 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <button
              onClick={handleGoForward}
              disabled={historyIndex >= history.length - 1}
              className="obsidian-icon-btn"
              title="Go forward in view history"
              aria-label="Go forward in view history"
              style={{ width: 26, height: 26 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>

          {/* Dual Graph Mode Toggle */}
          {onGraphModeChange && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(51, 65, 85, 0.6)",
                borderRadius: 8,
                padding: 2,
                backdropFilter: "blur(8px)",
              }}
            >
              <button
                onClick={() => onGraphModeChange("topology")}
                style={{
                  background: graphMode === "topology" ? "rgba(37, 99, 235, 0.6)" : "transparent",
                  color: graphMode === "topology" ? "#ffffff" : "#94a3b8",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 9px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title="Service architecture & blast radius"
              >
                🌐 Topology
              </button>
              <button
                onClick={() => onGraphModeChange("evidence")}
                style={{
                  background: graphMode === "evidence" ? "rgba(126, 34, 206, 0.6)" : "transparent",
                  color: graphMode === "evidence" ? "#ffffff" : "#94a3b8",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 9px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title="Hypotheses & counterfactual evidence perturbation"
              >
                ⚡ Evidence Graph
              </button>
            </div>
          )}
        </div>

        {/* Right: Search, Zoom Controls, Settings & Overflow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            pointerEvents: "auto",
            position: "relative",
          }}
        >
          {/* Service Search Input with Autocomplete */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              style={{
                width: 150,
                height: 28,
                padding: "0 8px 0 24px",
                fontSize: 11,
                borderRadius: 6,
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(51, 65, 85, 0.7)",
                color: "#f8fafc",
                outline: "none",
              }}
            />
            <span style={{ position: "absolute", left: 7, top: 6, fontSize: 11, color: "#64748b" }}>🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 6,
                  top: 6,
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: 0,
                }}
              >
                ✕
              </button>
            )}

            {/* Dropdown Autocomplete */}
            {isSearchFocused && matchingServices.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 32,
                  right: 0,
                  width: 200,
                  maxHeight: 220,
                  overflowY: "auto",
                  backgroundColor: "rgba(15, 23, 42, 0.96)",
                  border: "1px solid rgba(56, 189, 248, 0.4)",
                  borderRadius: 8,
                  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.7)",
                  backdropFilter: "blur(12px)",
                  zIndex: 50,
                  padding: "4px 0",
                }}
              >
                {matchingServices.map((node) => (
                  <div
                    key={node.id}
                    onMouseDown={() => handleSelectSearchedService(node)}
                    style={{
                      padding: "6px 10px",
                      fontSize: 11,
                      color: "#e2e8f0",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(56, 189, 248, 0.2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <span style={{ fontWeight: 600 }}>{node.name || node.id}</span>
                    <span style={{ fontSize: 9, color: "#94a3b8" }}>{node.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Zoom & Reset Buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              border: "1px solid rgba(51, 65, 85, 0.6)",
              borderRadius: 8,
              padding: "2px 4px",
              backdropFilter: "blur(8px)",
              gap: 2,
            }}
          >
            <button
              onClick={() => fgRef.current?.zoom((fgRef.current.zoom() || 1) * 1.3, 300)}
              className="obsidian-icon-btn"
              title="Zoom in"
              aria-label="Zoom in"
              style={{ width: 26, height: 26, fontSize: 14 }}
            >
              +
            </button>
            <button
              onClick={() => fgRef.current?.zoom((fgRef.current.zoom() || 1) / 1.3, 300)}
              className="obsidian-icon-btn"
              title="Zoom out"
              aria-label="Zoom out"
              style={{ width: 26, height: 26, fontSize: 14 }}
            >
              −
            </button>
            <button
              onClick={handleFitScreen}
              className="obsidian-icon-btn"
              title="Fit graph to viewport"
              aria-label="Fit graph to viewport"
              style={{ width: 26, height: 26, fontSize: 12 }}
            >
              ⛶
            </button>
            <button
              onClick={handleResetView}
              className="obsidian-icon-btn"
              title="Reset view"
              aria-label="Reset view"
              style={{ width: 26, height: 26, fontSize: 12 }}
            >
              🎯
            </button>
          </div>

          {/* Toggle Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="obsidian-icon-btn"
            title={isSettingsOpen ? "Hide graph settings" : "Open graph settings"}
            aria-label={isSettingsOpen ? "Hide graph settings" : "Open graph settings"}
            style={{
              width: 30,
              height: 30,
              backgroundColor: isSettingsOpen ? "rgba(37, 99, 235, 0.25)" : "rgba(15, 23, 42, 0.75)",
              border: `1px solid ${isSettingsOpen ? "#3b82f6" : "rgba(51, 65, 85, 0.6)"}`,
              borderRadius: 8,
              color: isSettingsOpen ? "#60a5fa" : "#94a3b8",
              backdropFilter: "blur(8px)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </button>

          {/* Overflow Menu Button */}
          <button
            onClick={() => setIsOverflowMenuOpen(!isOverflowMenuOpen)}
            className="obsidian-icon-btn"
            title="Graph view options"
            aria-label="Graph view options"
            style={{
              width: 30,
              height: 30,
              backgroundColor: isOverflowMenuOpen ? "rgba(51, 65, 85, 0.85)" : "rgba(15, 23, 42, 0.75)",
              border: "1px solid rgba(51, 65, 85, 0.6)",
              borderRadius: 8,
              backdropFilter: "blur(8px)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          {/* Overflow Dropdown Menu */}
          {isOverflowMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: 38,
                right: 0,
                zIndex: 40,
                backgroundColor: "rgba(15, 23, 42, 0.96)",
                border: "1px solid rgba(51, 65, 85, 0.8)",
                borderRadius: 10,
                padding: "6px 0",
                minWidth: 170,
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.6)",
                backdropFilter: "blur(10px)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <button
                onClick={handleFitScreen}
                style={{
                  background: "transparent",
                  border: "none",
                  textAlign: "left",
                  padding: "8px 14px",
                  fontSize: 12,
                  color: "#e2e8f0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(51, 65, 85, 0.5)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <span>🔍</span> Fit to screen
              </button>
              <button
                onClick={handleResetView}
                style={{
                  background: "transparent",
                  border: "none",
                  textAlign: "left",
                  padding: "8px 14px",
                  fontSize: 12,
                  color: "#e2e8f0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(51, 65, 85, 0.5)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <span>🎯</span> Reset view
              </button>
              <div style={{ height: 1, backgroundColor: "rgba(51, 65, 85, 0.5)", margin: "4px 0" }} />
              <button
                onClick={handleToggleSettings}
                style={{
                  background: "transparent",
                  border: "none",
                  textAlign: "left",
                  padding: "8px 14px",
                  fontSize: 12,
                  color: "#e2e8f0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(51, 65, 85, 0.5)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <span>⚙️</span> {isSettingsOpen ? "Hide settings" : "Show settings"}
              </button>
              <button
                onClick={handleToggleLegend}
                style={{
                  background: "transparent",
                  border: "none",
                  textAlign: "left",
                  padding: "8px 14px",
                  fontSize: 12,
                  color: "#e2e8f0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(51, 65, 85, 0.5)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <span>🗺️</span> {legendVisible ? "Hide legend" : "Show legend"}
              </button>
            </div>
          )}
        </div>
      </div>

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
          backgroundColor="#060913"
          nodeRelSize={6}
          nodeCanvasObject={(node, ctx, globalScale) =>
            drawNode(node as VisualNode, ctx, globalScale, hasHighlights, settings.nodeScale)
          }
          linkCanvasObject={(link, ctx, globalScale) =>
            drawLink(link as VisualEdge, ctx, globalScale, hasHighlights, settings.linkThickness)
          }
          nodePointerAreaPaint={(node: any, color, ctx) => {
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, (node.radius ?? 8) + 6, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          onNodeClick={(node: any) => handleInternalNodeClick(node as GraphNode)}
          onBackgroundClick={() => setSelectedNode(null)}
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

      {/* Floating Obsidian Graph Settings Panel */}
      {isSettingsOpen && (
        <GraphSettingsPanel
          settings={settings}
          onSettingsChange={setSettings}
          onAnimate={handleAnimate}
          isAnimating={isAnimating}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* Interactive Legend Overlay */}
      {legendVisible && <GraphLegend />}

      {/* Hover Node Tooltip Card */}
      <GraphTooltip node={hoveredNode} x={mousePos.x} y={mousePos.y} />

      {/* Floating Service Details Inspector */}
      {selectedNode && getNodeKind(selectedNode.label) === "Service" && (
        <ServiceInspector
          serviceName={selectedNode.name || selectedNode.id.replace(/^svc:/, "")}
          node={selectedNode}
          edges={payload?.edges || []}
          nodes={payload?.nodes || []}
          catalogService={catalogServices?.find(
            (s) => s.name === (selectedNode.name || selectedNode.id.replace(/^svc:/, ""))
          )}
          onFocus={(svc) => {
            const target = graphData.nodes.find(
              (n) => n.name === svc || n.id === `svc:${svc}` || n.id === svc
            );
            if (target && target.x !== undefined && target.y !== undefined && fgRef.current) {
              fgRef.current.centerAt(target.x, target.y, 600);
              fgRef.current.zoom(2.4, 600);
            }
          }}
          onAskChat={onAskChat}
          onViewOwners={onViewOwners}
          onStressTest={onStressTest}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
