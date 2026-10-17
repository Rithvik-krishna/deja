import { useEffect, useId, useState, type FormEvent } from "react";
import { api, type Catalog, type ReassignResponse } from "../api/client";
import { errorMessage } from "../lib/errors";
import type { AsyncState } from "../state/useAsync";
import { useAsync } from "../state/useAsync";
import type { ToastKind } from "../state/useToasts";
import { ConfirmDialog } from "./ConfirmDialog";
import { OwnershipHistory } from "./owners/OwnershipHistory";

export interface OwnersPanelProps {
  /** Shared GET /catalog state owned by App (services with current owner, engineers). */
  catalog: AsyncState<Catalog>;
  /** Bump when ownership changed elsewhere (e.g. a chat reassignment) so the lookup is re-run. */
  refreshToken: number;
  onNotify: (kind: ToastKind, text: string) => void;
  /**
   * Show this service, e.g. the one a chat reply just reassigned (taken from the backend's tool call).
   * `seq` changes on every request so asking for the same service again still applies.
   */
  focusService?: { service: string; seq: number } | null;
}

export function OwnersPanel({ catalog, refreshToken, onNotify, focusService }: OwnersPanelProps) {
  const uid = useId();
  const services = catalog.data?.services ?? [];
  const engineers = catalog.data?.engineers ?? [];

  const [chosenService, setChosenService] = useState("");
  const [date, setDate] = useState(""); // "" = not chosen: the backend uses today
  const [localTick, setLocalTick] = useState(0);

  useEffect(() => {
    if (focusService) setChosenService(focusService.service);
  }, [focusService]);

  // Default to the first catalog service, but only once the catalog has actually provided one.
  const service = services.some((s) => s.name === chosenService) ? chosenService : (services[0]?.name ?? "");

  const lookup = useAsync(() => api.owner(service, date || undefined), `${service}|${date}`, refreshToken + localTick, service !== "");
  const result = lookup.data && lookup.data.service === service ? lookup.data : undefined;

  return (
    <div className="owners-panel">
      <section className="section" aria-labelledby={`${uid}-lookup`}>
        <h3 id={`${uid}-lookup`}>Who owns it?</h3>

        {catalog.error ? (
          <div className="state state-error" role="alert">
            <p>Couldn't load the service catalog: {catalog.error}</p>
            <button type="button" className="btn btn-small" onClick={catalog.reload}>
              Try again
            </button>
          </div>
        ) : catalog.loading && !catalog.data ? (
          <p className="state" role="status">
            Loading services…
          </p>
        ) : services.length === 0 ? (
          <p className="state">The catalog returned no services.</p>
        ) : (
          <div className="owner-controls">
            <label htmlFor={`${uid}-svc`}>Service</label>
            <select id={`${uid}-svc`} value={service} onChange={(e) => setChosenService(e.target.value)}>
              {services.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.team})
                </option>
              ))}
            </select>

            <label htmlFor={`${uid}-date`}>As of date</label>
            <div className="date-row">
              <input id={`${uid}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <button type="button" className="btn btn-small" disabled={date === ""} onClick={() => setDate("")}>
                Today
              </button>
            </div>
            <p className="hint">Leave empty for today (the backend's clock). Past dates query the ownership history.</p>
          </div>
        )}

        {service !== "" && (
          <div className="owner-result" aria-live="polite">
            {lookup.error ? (
              <div className="state state-error" role="alert">
                <p>Couldn't look up the owner: {lookup.error}</p>
                <button type="button" className="btn btn-small" onClick={lookup.reload}>
                  Try again
                </button>
              </div>
            ) : !result ? (
              <p className="state" role="status">
                Looking up owner…
              </p>
            ) : result.owner ? (
              <>
                <p className="owner-line">
                  <span className="row-meta">
                    {result.service} on {result.date}
                  </span>
                  <strong className="owner-name">{result.owner}</strong>
                </p>
                <p className="row-meta">
                  Valid {result.valid_from ?? "?"} → {result.valid_to ?? "present"}
                </p>
              </>
            ) : (
              <p className="state">
                No ownership record for {result.service} on {result.date}. The backend has no owner for that date, so none is shown.
              </p>
            )}
          </div>
        )}
      </section>

      {result && (
        <section className="section" aria-labelledby={`${uid}-hist`}>
          <h3 id={`${uid}-hist`}>Ownership history</h3>
          <OwnershipHistory history={result.history} matchedValidFrom={result.owner ? result.valid_from : null} />
        </section>
      )}

      {service !== "" && engineers.length > 0 && (
        <ReassignForm
          key={service}
          service={service}
          currentOwner={services.find((s) => s.name === service)?.owner ?? null}
          engineers={engineers}
          onNotify={onNotify}
          onDone={() => {
            setLocalTick((t) => t + 1);
            catalog.reload();
          }}
        />
      )}
    </div>
  );
}

interface ReassignFormProps {
  service: string;
  currentOwner: string | null;
  engineers: Catalog["engineers"];
  onNotify: (kind: ToastKind, text: string) => void;
  onDone: () => void;
}

function ReassignForm({ service, currentOwner, engineers, onNotify, onDone }: ReassignFormProps) {
  const uid = useId();
  const [engineer, setEngineer] = useState("");
  const [effective, setEffective] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<ReassignResponse | null>(null);

  const chosen = engineers.find((e) => e.id === engineer);

  function ask(e: FormEvent) {
    e.preventDefault();
    if (engineer && !submitting) setConfirming(true);
  }

  async function submit() {
    if (!engineer || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.reassign(service, engineer, effective || undefined);
      setLast(res);
      onNotify("success", `Reassigned ${res.service} to ${res.owner ?? engineer}.`);
      setEngineer("");
      setEffective("");
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  return (
    <section className="section" aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`}>Reassign {service}</h3>
      <p className="hint">The current record is closed the day before the effective date and kept in the history; nothing is overwritten.</p>

      <form className="outcome-form" onSubmit={ask}>
        <label htmlFor={`${uid}-eng`}>New owner</label>
        <select id={`${uid}-eng`} value={engineer} onChange={(e) => setEngineer(e.target.value)} disabled={submitting} required>
          <option value="">Choose an engineer…</option>
          {engineers.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.team})
            </option>
          ))}
        </select>

        <label htmlFor={`${uid}-eff`}>Effective date (optional)</label>
        <input id={`${uid}-eff`} type="date" value={effective} onChange={(e) => setEffective(e.target.value)} disabled={submitting} />
        <p className="hint">Empty = today (the backend's clock).</p>

        {error && (
          <p className="form-error" role="alert">
            Couldn't reassign: {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={!engineer || submitting}>
          {submitting ? "Reassigning…" : "Reassign…"}
        </button>
      </form>

      {last && last.service === service && (
        <div className="reassign-result" role="status">
          <strong>
            Backend confirmed: {last.owner ?? "—"} owns {last.service} from {last.valid_from ?? "?"}
          </strong>
          {last.superseded ? (
            <span className="row-meta">
              Superseded record: {last.superseded.engineer}, {last.superseded.valid_from} → {last.superseded.valid_to ?? "present"}
            </span>
          ) : (
            <span className="row-meta">The backend reported no previous record to supersede.</span>
          )}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Reassign ownership?"
          confirmLabel="Reassign"
          confirmTone="primary"
          busy={submitting}
          onConfirm={() => void submit()}
          onCancel={() => setConfirming(false)}
        >
          <p>
            Make <strong>{chosen?.name ?? engineer}</strong> the owner of <strong>{service}</strong>
            {effective ? <> effective {effective}</> : <> effective today</>}
            {currentOwner ? <> (currently {currentOwner})</> : null}.
          </p>
          <p>The previous ownership record is closed, not deleted.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
