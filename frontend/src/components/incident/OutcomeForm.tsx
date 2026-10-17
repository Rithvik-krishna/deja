import { useId, useState, type FormEvent } from "react";
import type { IncidentDetail } from "../../api/client";
import type { CatalogFix } from "../../lib/apiTypes";
import { errorMessage } from "../../lib/errors";

type Outcome = "SUCCESS" | "FAILED";

interface OutcomeFormProps {
  incident: IncidentDetail;
  /** Fix options come from GET /catalog, never a hardcoded list. */
  fixes: CatalogFix[] | undefined;
  catalogError: string | null;
  onReloadCatalog: () => void;
  /** Rejects with the API error; the form shows it inline and keeps what the user typed. */
  onSubmit: (fix: string, status: Outcome, notes: string) => Promise<void>;
}

export function OutcomeForm({ incident, fixes, catalogError, onReloadCatalog, onSubmit }: OutcomeFormProps) {
  const uid = useId();
  const [fix, setFix] = useState("");
  const [status, setStatus] = useState<Outcome>("FAILED");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const failedHere = new Set(incident.attempts.filter((a) => a.status === "FAILED").map((a) => a.fix));
  const chosen = fixes?.find((f) => f.id === fix);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!fix || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(fix, status, notes.trim());
      setFix("");
      setNotes("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="section" aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`}>Record a fix outcome</h3>
      {incident.status === "resolved" && (
        <p className="hint">This incident is already resolved. A new outcome is added to its history.</p>
      )}

      {catalogError ? (
        <div className="state state-error" role="alert">
          <p>Couldn't load the fix catalog: {catalogError}</p>
          <button type="button" className="btn btn-small" onClick={onReloadCatalog}>
            Try again
          </button>
        </div>
      ) : (
        <form className="outcome-form" onSubmit={submit}>
          <label htmlFor={`${uid}-fix`}>Fix tried</label>
          <select id={`${uid}-fix`} value={fix} onChange={(e) => setFix(e.target.value)} disabled={!fixes || submitting} required>
            <option value="">{fixes ? "Choose a fix…" : "Loading fixes…"}</option>
            {fixes?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {failedHere.has(f.id) ? " (already failed here)" : ""}
              </option>
            ))}
          </select>
          {chosen?.description && <p className="hint">{chosen.description}</p>}

          <fieldset className="radio-row" disabled={submitting}>
            <legend>Result</legend>
            <label>
              <input type="radio" name={`${uid}-status`} checked={status === "FAILED"} onChange={() => setStatus("FAILED")} />
              Failed
            </label>
            <label>
              <input type="radio" name={`${uid}-status`} checked={status === "SUCCESS"} onChange={() => setStatus("SUCCESS")} />
              Worked <span className="hint-inline">(resolves the incident)</span>
            </label>
          </fieldset>

          <label htmlFor={`${uid}-notes`}>Notes (optional)</label>
          <textarea id={`${uid}-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={submitting} />

          {error && (
            <p className="form-error" role="alert">
              Couldn't record the outcome: {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={!fix || submitting}>
            {submitting ? "Recording…" : "Record outcome"}
          </button>
        </form>
      )}
    </section>
  );
}
