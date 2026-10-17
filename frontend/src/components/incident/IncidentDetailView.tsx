import type { IncidentDetail } from "../../api/client";
import { formatTs } from "../../lib/format";
import { OutcomeBadge, SeverityBadge, StatusBadge } from "./badges";

interface IncidentDetailViewProps {
  detail: IncidentDetail | undefined;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

export function IncidentDetailView({ detail, loading, error, onReload }: IncidentDetailViewProps) {
  if (error) {
    return (
      <section className="section state state-error" role="alert">
        <p>Couldn't load this incident: {error}</p>
        <button type="button" className="btn btn-small" onClick={onReload}>
          Try again
        </button>
      </section>
    );
  }
  if (!detail) {
    return (
      <section className="section">
        <p className="state" role="status">
          {loading ? "Loading incident…" : "Select an incident to see its details."}
        </p>
      </section>
    );
  }

  return (
    <section className="section" aria-labelledby="incident-detail-title">
      <div className="detail-head">
        <code className="inc-id">{detail.id}</code>
        <SeverityBadge severity={detail.severity} />
        <StatusBadge status={detail.status} />
      </div>
      <h3 id="incident-detail-title" className="detail-title">
        {detail.title}
      </h3>
      {detail.summary && <p className="detail-summary">{detail.summary}</p>}

      <dl className="facts">
        <dt>Symptom</dt>
        <dd>{detail.symptom}</dd>
        <dt>{detail.status === "open" ? "Likely origin" : "Origin"}</dt>
        <dd>{detail.origin}</dd>
        <dt>Impacted</dt>
        <dd>{detail.impacted.length ? detail.impacted.join(", ") : "—"}</dd>
        <dt>Started</dt>
        <dd>{formatTs(detail.started_at)}</dd>
        {detail.resolved_at && (
          <>
            <dt>Resolved</dt>
            <dd>{formatTs(detail.resolved_at)}</dd>
          </>
        )}
        {detail.followed_deploy && (
          <>
            <dt>Followed deploy</dt>
            <dd>
              {detail.followed_deploy.service} {detail.followed_deploy.version} by {detail.followed_deploy.author} ·{" "}
              {formatTs(detail.followed_deploy.deployed_at)}
            </dd>
          </>
        )}
      </dl>

      <h4 className="subhead">Fix attempts</h4>
      {detail.attempts.length === 0 ? (
        <p className="state">No fixes tried yet.</p>
      ) : (
        <ul className="attempts">
          {detail.attempts.map((a) => (
            <li key={a.id}>
              <span className="attempt-line">
                <code>{a.fix}</code>
                <OutcomeBadge status={a.status} />
              </span>
              <span className="row-meta">
                {a.engineer} · {formatTs(a.ts)}
              </span>
              {a.notes && <span className="attempt-notes">{a.notes}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
