import type { IncidentSummary } from "../../api/client";
import { formatTs } from "../../lib/format";
import { SeverityBadge, StatusBadge } from "./badges";

export type IncidentFilter = "all" | "open" | "resolved";

const FILTERS: { id: IncidentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
];

interface IncidentListProps {
  incidents: IncidentSummary[] | undefined;
  loading: boolean;
  error: string | null;
  filter: IncidentFilter;
  onFilterChange: (f: IncidentFilter) => void;
  selectedId: string | null;
  onPick: (id: string) => void;
  onReload: () => void;
}

export function IncidentList({ incidents, loading, error, filter, onFilterChange, selectedId, onPick, onReload }: IncidentListProps) {
  // Filtering is applied to the incidents actually returned by GET /incidents.
  const count = (f: IncidentFilter) => (incidents ? incidents.filter((i) => f === "all" || i.status === f).length : 0);
  const shown = incidents?.filter((i) => filter === "all" || i.status === filter) ?? [];

  return (
    <section className="section" aria-labelledby="incident-list-title">
      <div className="section-head">
        <h3 id="incident-list-title">Incidents</h3>
        <div className="segmented" role="group" aria-label="Filter incidents by status">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="segment"
              aria-pressed={filter === f.id}
              onClick={() => onFilterChange(f.id)}
            >
              {f.label}
              {incidents && <span className="count">{count(f.id)}</span>}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="state state-error" role="alert">
          <p>Couldn't load incidents: {error}</p>
          <button type="button" className="btn btn-small" onClick={onReload}>
            Try again
          </button>
        </div>
      ) : loading && !incidents ? (
        <p className="state" role="status">
          Loading incidents…
        </p>
      ) : incidents && incidents.length === 0 ? (
        <p className="state">No incidents recorded yet. Send an alert in chat to open one.</p>
      ) : shown.length === 0 ? (
        <p className="state">No {filter} incidents.</p>
      ) : (
        <ul className="incident-list">
          {shown.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="incident-row"
                aria-current={i.id === selectedId ? "true" : undefined}
                onClick={() => onPick(i.id)}
              >
                <span className="row-top">
                  <code className="inc-id">{i.id}</code>
                  <SeverityBadge severity={i.severity} />
                  <StatusBadge status={i.status} />
                </span>
                <span className="row-title">{i.title}</span>
                <span className="row-meta">
                  {i.symptom} · origin {i.origin} · {formatTs(i.started_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
