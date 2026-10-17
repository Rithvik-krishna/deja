import { sourceLabel, type ShockRun } from "./types";

/** Session-local: lives in React state, so it is cleared by a page reload. Only runs for the current incident are passed in. */
export function ShockHistory({ runs }: { runs: ShockRun[] }) {
  if (runs.length === 0) return <p className="state">No stress tests run for this incident yet.</p>;
  return (
    <ol className="shock-history">
      {[...runs].reverse().map((r) => {
        const s = r.response;
        const removed = [...r.removedSources.map(sourceLabel), ...r.removedIds];
        return (
          <li key={r.seq} className={`verdict-${s.verdict}`}>
            <span className="hist-head">
              <strong>Run {r.seq}</strong>
              <span className="verdict-badge">{s.verdict.toUpperCase()}</span>
              {r.mode === "auto" && <span className="badge">Auto</span>}
            </span>
            <span className="row-meta">
              Removed: {removed.length ? removed.join(", ") : "nothing"}
            </span>
            <span className="row-meta">
              Top suspect {s.top_suspect_before} → {s.top_suspect_after} · margin {s.margin_before} → {s.margin_after}
            </span>
            <span className="hist-reco">{s.recommendation?.trim() || "No recommendation was returned by the backend."}</span>
          </li>
        );
      })}
    </ol>
  );
}
