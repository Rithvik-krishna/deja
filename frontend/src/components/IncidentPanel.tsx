import { useEffect, useRef, useState } from "react";
import { api, type Catalog, type GraphPayload } from "../api/client";
import type { Recommendation } from "../lib/apiTypes";
import { useAsync, type AsyncState } from "../state/useAsync";
import type { ToastKind } from "../state/useToasts";
import { IncidentDetailView } from "./incident/IncidentDetailView";
import { IncidentList, type IncidentFilter } from "./incident/IncidentList";
import { IncidentTimeline } from "./incident/IncidentTimeline";
import { OutcomeForm } from "./incident/OutcomeForm";

export interface IncidentPanelProps {
  /** Owned by App: set by chat replies and by picking a row here. */
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  /** Bump to make the panel refetch the list, detail and timeline (e.g. after chat changed an incident). */
  refreshToken: number;
  /** Show this incident-scoped graph in the centre panel. Only called for explicit user actions, never on background refreshes. */
  onGraphChange: (graph: GraphPayload) => void;
  onNotify: (kind: ToastKind, text: string) => void;
  /** Shared GET /catalog state owned by App (fix options for the outcome form). */
  catalog: AsyncState<Catalog>;
}

interface OutcomeResult {
  incidentId: string;
  recommendations: Recommendation[];
}

export function IncidentPanel({ selectedIncidentId, onSelectIncident, refreshToken, onGraphChange, onNotify, catalog }: IncidentPanelProps) {
  const [filter, setFilter] = useState<IncidentFilter>("all");
  const [localTick, setLocalTick] = useState(0);
  const [lastOutcome, setLastOutcome] = useState<OutcomeResult | null>(null);
  const userPicked = useRef<string | null>(null);

  const refreshKey = refreshToken + localTick;
  const id = selectedIncidentId;
  const list = useAsync(() => api.incidents(), "incidents", refreshKey);
  const detail = useAsync(() => api.incident(id as string), id ?? "", refreshKey, id !== null);
  const timeline = useAsync(() => api.timeline(id as string), id ?? "", refreshKey, id !== null);

  const detailData = detail.data && detail.data.id === id ? detail.data : undefined;

  // When the user picks an incident, show its graph in the centre once the detail arrives.
  useEffect(() => {
    if (detailData && userPicked.current === detailData.id) {
      userPicked.current = null;
      onGraphChange(detailData.graph);
    }
  }, [detailData, onGraphChange]);

  function pick(pickedId: string) {
    if (pickedId === id && detailData) {
      onGraphChange(detailData.graph);
      return;
    }
    userPicked.current = pickedId;
    onSelectIncident(pickedId);
  }

  async function recordOutcome(fix: string, status: "SUCCESS" | "FAILED", notes: string) {
    if (!id) return;
    const res = await api.outcome(id, fix, status, notes);
    onNotify(
      "success",
      `Recorded ${fix}: ${status === "SUCCESS" ? "worked" : "failed"} on ${id}.${res.incident.status === "resolved" ? " Incident resolved." : ""}`,
    );
    onGraphChange(res.graph);
    setLastOutcome({ incidentId: id, recommendations: res.recommendations });
    setLocalTick((t) => t + 1);
  }

  const next = lastOutcome && lastOutcome.incidentId === id ? lastOutcome.recommendations.slice(0, 3) : [];

  return (
    <div className="incident-panel">
      <IncidentList
        incidents={list.data}
        loading={list.loading}
        error={list.error}
        filter={filter}
        onFilterChange={setFilter}
        selectedId={id}
        onPick={pick}
        onReload={list.reload}
      />

      {id && (
        <>
          <IncidentDetailView detail={detailData} loading={detail.loading} error={detail.error} onReload={detail.reload} />
          <IncidentTimeline events={timeline.data} loading={timeline.loading} error={timeline.error} onReload={timeline.reload} />
          {detailData && (
            <OutcomeForm
              key={detailData.id}
              incident={detailData}
              fixes={catalog.data?.fixes}
              catalogError={catalog.error}
              onReloadCatalog={catalog.reload}
              onSubmit={recordOutcome}
            />
          )}
          {next.length > 0 && (
            <section className="section" aria-labelledby="next-fix-title">
              <h3 id="next-fix-title">Recommended next</h3>
              <ul className="recs">
                {next.map((r) => (
                  <li key={r.fix} className={r.avoid ? "rec-avoid" : undefined}>
                    <code>{r.fix}</code>
                    {r.avoid && <span className="badge badge-failed">Avoid</span>}
                    {r.already_failed_here && <span className="badge badge-failed">Failed here</span>}
                    <span className="row-meta">
                      {r.successes}/{r.attempts} worked · {r.rationale}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {!id && list.data && list.data.length > 0 && (
        <p className="state">Select an incident above to see its details, timeline and record fix outcomes.</p>
      )}
    </div>
  );
}
