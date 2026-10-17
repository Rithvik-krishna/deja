import type { GraphPayload } from "../../api/client";

/**
 * TEMPORARY integration boundary for the centre panel. Rithvik owns the real graph view (`components/GraphView.tsx`),
 * which does not exist yet. This placeholder only summarises the payload App holds, so the Phase 1 data flow
 * (chat reply / incident pick -> graph state) is visible and testable. It draws nothing graph-like.
 *
 * To integrate: in App.tsx replace `<GraphPlaceholder graph={graph} />` with `<GraphView ... />`; delete this file.
 */
export function GraphPlaceholder({ graph }: { graph: GraphPayload | null }) {
  const byLabel = new Map<string, number>();
  graph?.nodes.forEach((n) => byLabel.set(n.label, (byLabel.get(n.label) ?? 0) + 1));
  const highlighted = graph?.nodes.filter((n) => n.highlight) ?? [];

  return (
    <div className="graph-placeholder">
      <h2 className="pane-title">Incident graph</h2>

      {!graph ? (
        <div className="state">
          <p>No graph yet.</p>
          <p>Send an alert in chat or pick an incident, and the graph the backend returns will be held here.</p>
        </div>
      ) : (
        <div className="graph-summary" aria-live="polite">
          <p className="hint">
            Graph view not integrated yet (Rithvik's <code>GraphView</code>). Showing a summary of the payload received.
          </p>
          <p className="graph-totals">
            <strong>{graph.nodes.length}</strong> nodes · <strong>{graph.edges.length}</strong> edges
          </p>
          <ul className="label-counts">
            {[...byLabel].map(([label, n]) => (
              <li key={label}>
                <span className="badge">{label}</span> {n}
              </li>
            ))}
          </ul>
          {highlighted.length > 0 && (
            <>
              <h3 className="subhead">Highlighted path</h3>
              <ul className="highlighted">
                {highlighted.map((n) => (
                  <li key={n.id}>
                    <span className="badge">{n.label}</span> {n.name}
                    {typeof n.score === "number" && <span className="row-meta"> score {n.score}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
