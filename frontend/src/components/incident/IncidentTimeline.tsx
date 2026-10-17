import type { TimelineEvent } from "../../api/client";
import { byTimestamp, formatTs } from "../../lib/format";

const TYPE_LABEL: Record<TimelineEvent["type"], string> = {
  deploy: "Deploy",
  incident_opened: "Opened",
  attempt: "Fix attempt",
  resolved: "Resolved",
};

interface IncidentTimelineProps {
  events: TimelineEvent[] | undefined;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

export function IncidentTimeline({ events, loading, error, onReload }: IncidentTimelineProps) {
  return (
    <section className="section" aria-labelledby="incident-timeline-title">
      <h3 id="incident-timeline-title">Timeline</h3>
      {error ? (
        <div className="state state-error" role="alert">
          <p>Couldn't load the timeline: {error}</p>
          <button type="button" className="btn btn-small" onClick={onReload}>
            Try again
          </button>
        </div>
      ) : !events ? (
        <p className="state" role="status">
          {loading ? "Loading timeline…" : "No incident selected."}
        </p>
      ) : events.length === 0 ? (
        <p className="state">No timeline events recorded for this incident.</p>
      ) : (
        <ol className="timeline">
          {[...events].sort(byTimestamp).map((ev, i) => (
            <li key={`${ev.ts}-${ev.type}-${i}`} className={`tl-${ev.type}`}>
              <span className="tl-type">{TYPE_LABEL[ev.type]}</span>
              <time dateTime={ev.ts}>{formatTs(ev.ts)}</time>
              <span className="tl-text">{ev.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
