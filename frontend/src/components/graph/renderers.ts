import {
  GHOST_EVIDENCE_STYLE,
  NODE_COLORS,
  getEdgeStyle,
} from "./styles";
import type { NodeKind, VisualEdge, VisualNode } from "./types";

export function getNodeKind(label: string): NodeKind {
  const l = label.toLowerCase();
  if (l.includes("service")) return "Service";
  if (l.includes("incident")) return "Incident";
  if (l.includes("deploy")) return "Deploy";
  if (l.includes("engineer")) return "Engineer";
  if (l.includes("fix")) return "Fix";
  if (l.includes("evidence")) return "Evidence";
  return "Unknown";
}

export function drawNode(
  node: VisualNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  hasHighlights: boolean
): void {
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  ctx.save();

  // Dim unrelated elements when a highlight/focus exists
  const isDimmed = hasHighlights && !node.highlight && !node.isFocused;
  if (isDimmed) {
    ctx.globalAlpha = 0.22;
  }

  // Base node styling
  const isGhost = Boolean(node.isGhost);
  const baseStyle = isGhost ? GHOST_EVIDENCE_STYLE : NODE_COLORS[node.kind] || NODE_COLORS.Unknown;

  // Calculate radius
  let radius = 8;
  if (node.kind === "Service") {
    const score = node.animScore ?? node.score ?? 0;
    radius = Math.max(8, Math.min(26, 8 + Math.sqrt(Math.max(0, score)) * 2.8));
  } else if (node.kind === "Incident") {
    radius = 11;
  } else if (node.kind === "Deploy") {
    radius = 9;
  } else if (node.kind === "Evidence") {
    radius = 8;
  }

  // Pulse effect if requested (e.g. top suspect flip or near tie)
  if (node.pulse && !isDimmed) {
    const pulseFactor = 1 + 0.16 * Math.sin(Date.now() / 130);
    radius *= pulseFactor;
  }

  node.radius = radius;

  // Highlight glow
  if (node.highlight && !isDimmed) {
    ctx.shadowColor = baseStyle.glow;
    ctx.shadowBlur = 18;
  }

  // Draw node shape based on kind
  ctx.beginPath();
  if (node.kind === "Deploy") {
    // Rounded rectangle for Deploy
    const sz = radius * 1.8;
    ctx.roundRect(x - sz / 2, y - sz / 2, sz, sz, 4);
  } else if (node.kind === "Fix") {
    // Diamond shape for Fix
    ctx.moveTo(x, y - radius * 1.3);
    ctx.lineTo(x + radius * 1.3, y);
    ctx.lineTo(x, y + radius * 1.3);
    ctx.lineTo(x - radius * 1.3, y);
    ctx.closePath();
  } else {
    // Standard circle
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
  }

  ctx.fillStyle = baseStyle.fill;
  ctx.fill();

  // Stroke
  ctx.lineWidth = node.highlight ? 2.8 : 1.5;
  ctx.strokeStyle = node.highlight ? "#ffffff" : baseStyle.stroke;
  if (isGhost) {
    ctx.setLineDash([3, 3]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.stroke();

  // Reset shadow for badges and text
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  // Incident specific badge / ring
  if (node.kind === "Incident") {
    const rawStatus = node.props?.status;
    const status = typeof rawStatus === "string" ? rawStatus.toLowerCase() : "";
    const isResolved = status === "resolved";
    const rawSev = node.props?.severity;
    const sev = typeof rawSev === "string" ? rawSev.toUpperCase() : "";

    // Outer status ring
    ctx.beginPath();
    ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
    ctx.strokeStyle = isResolved ? "#10b981" : "#ef4444";
    ctx.lineWidth = 1.6;
    if (!isResolved) {
      ctx.setLineDash([4, 2]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Mini icon inside
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.max(8, radius * 0.9)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(isResolved ? "✓" : "!", x, y);

    // Severity indicator badge
    if (sev) {
      ctx.font = "bold 7px sans-serif";
      ctx.fillStyle = sev === "SEV1" ? "#ef4444" : sev === "SEV2" ? "#f97316" : "#eab308";
      ctx.fillText(sev, x, y - radius - 5);
    }
  }

  // Service score display inside node if large enough
  if (node.kind === "Service" && radius >= 12) {
    const scoreVal = (node.animScore ?? node.score ?? 0).toFixed(1);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.max(8, radius * 0.7)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(scoreVal, x, y);
  }

  // Evidence source badge
  if (node.kind === "Evidence" && node.props?.source) {
    const src = String(node.props.source);
    let badgeText = "EV";
    if (src.includes("cicd") || src.includes("deploy")) badgeText = "DEP";
    else if (src.includes("history")) badgeText = "HIST";
    else if (src.includes("topology")) badgeText = "TOPO";

    ctx.fillStyle = isGhost ? "#64748b" : "#22d3ee";
    ctx.font = "bold 7px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, x, y);
  }

  // Draw node label
  drawNodeLabel(node, ctx, x, y + radius + 8, isGhost, isDimmed);

  ctx.restore();
}

function drawNodeLabel(
  node: VisualNode,
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isGhost: boolean,
  isDimmed: boolean
): void {
  const isHighlight = Boolean(node.highlight);
  const fontSize = isHighlight ? 12 : 10;
  ctx.font = `${isHighlight ? "bold" : "normal"} ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Truncate long label names
  let labelText = node.name || node.id;
  if (!isHighlight && labelText.length > 18) {
    labelText = labelText.slice(0, 16) + "…";
  }

  // High-contrast background halo for dark mode readability
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#050811";
  ctx.strokeText(labelText, x, y);

  // Fill text
  ctx.fillStyle = isGhost ? "#94a3b8" : isHighlight ? "#ffffff" : "#cbd5e1";
  ctx.fillText(labelText, x, y);

  // Strikethrough label for ghost evidence
  if (isGhost) {
    const textWidth = ctx.measureText(labelText).width;
    const strikeY = y + fontSize / 2;
    ctx.beginPath();
    ctx.moveTo(x - textWidth / 2 - 2, strikeY);
    ctx.lineTo(x + textWidth / 2 + 2, strikeY);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.stroke();
  }
}

export function drawLink(
  link: VisualEdge,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  hasHighlights: boolean
): void {
  const source = link.source as VisualNode;
  const target = link.target as VisualNode;

  if (typeof source !== "object" || typeof target !== "object") return;
  const sx = source.x ?? 0;
  const sy = source.y ?? 0;
  const tx = target.x ?? 0;
  const ty = target.y ?? 0;

  if (sx === tx && sy === ty) return;

  ctx.save();

  const isDimmed = hasHighlights && !link.highlight;
  if (isDimmed) {
    ctx.globalAlpha = 0.16;
  }

  const isGhost = Boolean(link.isGhost || source.isGhost || target.isGhost);
  const style = getEdgeStyle(link.type, link.props, link.highlight, isGhost);

  // Draw main link line
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tx, ty);
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.setLineDash(style.dash);
  ctx.stroke();

  // ATTEMPTED edges: Draw visible status badge at midpoint so status is NOT conveyed by color alone
  if (link.type === "ATTEMPTED") {
    const status = String(link.props?.status || "").toUpperCase();
    const isSuccess = status === "SUCCESS";
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;

    const badgeLabel = isSuccess ? "✓ SUCCESS" : "✕ FAILED";
    ctx.font = "bold 9px sans-serif";
    const textWidth = ctx.measureText(badgeLabel).width;
    const padding = 3;

    ctx.fillStyle = "#090d16";
    ctx.fillRect(mx - textWidth / 2 - padding, my - 6, textWidth + padding * 2, 12);

    ctx.strokeStyle = isSuccess ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(mx - textWidth / 2 - padding, my - 6, textWidth + padding * 2, 12);

    ctx.fillStyle = isSuccess ? "#4ade80" : "#f87171";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeLabel, mx, my);
  }

  // Draw directional arrow for directed links
  if (style.arrow && !isGhost) {
    drawDirectionalArrow(sx, sy, tx, ty, target.radius ?? 8, style.color, ctx);
  }

  ctx.restore();
}

function drawDirectionalArrow(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  targetRadius: number,
  color: string,
  ctx: CanvasRenderingContext2D
): void {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;

  // Position arrow just outside target node boundary
  const stopOffset = targetRadius + 4;
  const arrowX = tx - (dx / dist) * stopOffset;
  const arrowY = ty - (dy / dist) * stopOffset;

  const angle = Math.atan2(dy, dx);
  const arrowLength = 7;
  const arrowAngle = Math.PI / 6;

  ctx.beginPath();
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(
    arrowX - arrowLength * Math.cos(angle - arrowAngle),
    arrowY - arrowLength * Math.sin(angle - arrowAngle)
  );
  ctx.lineTo(
    arrowX - arrowLength * Math.cos(angle + arrowAngle),
    arrowY - arrowLength * Math.sin(angle + arrowAngle)
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.setLineDash([]);
  ctx.fill();
}
