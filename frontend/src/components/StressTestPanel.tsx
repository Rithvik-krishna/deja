import { useEffect, useId, useRef, useState, type MutableRefObject } from "react";
import { api, type EvidenceShockRequest, type EvidenceShockResponse, type GraphPayload, type IncidentSummary } from "../api/client";
import { errorMessage, parseApiError } from "../lib/errors";
import { useAsync } from "../state/useAsync";
import type { ToastKind } from "../state/useToasts";
import ShockViz from "./ShockViz";
import { EvidenceInventory } from "./shock/EvidenceInventory";
import { ShockHistory } from "./shock/ShockHistory";
import { ShockSummary } from "./shock/ShockSummary";
import { comparisonGaps, hasGraph, removedEvidenceIds, sourceLabel, type ShockRun } from "./shock/types";

/** Required wording; shown verbatim. */
const SCORING_NOTE =
  "Heuristic score, not a probability. Synthetic data. Scoring rule: 3*recent deploy + 1 per matching past incident + 1/(hops+1).";

/** Lets the scripted demo drive the panel's own Auto-shock and Reset shocks (same code paths as the buttons). */
export interface StressController {
  incidentId: string;
  status: () => { kind: "loading" } | { kind: "ready" } | { kind: "busy" } | { kind: "error"; message: string };
  /** Resolves with the backend's shock result; rejects with the error the panel shows. */
  autoShock: () => Promise<EvidenceShockResponse>;
  /** Resolves with the number of baseline hypotheses once they have actually been re-fetched. */
  resetShocks: () => Promise<number>;
}

export interface StressTestPanelProps {
  incidentId: string | null;
  /** Whether the Stress Test tab is showing. Hypotheses are fetched lazily, on first view of each incident. */
  active: boolean;
  /** Latest shock result for the *current* incident only; App never passes another incident's result. */
  shock: EvidenceShockResponse | null;
  onShockResult: (incidentId: string, result: EvidenceShockResponse | null) => void;
  /** Replace the centre graph. Called only with a payload that actually contains nodes or edges. */
  onGraphChange: (graph: GraphPayload) => void;
  onNotify: (kind: ToastKind, text: string) => void;
  /** Filled with a controller for the incident currently shown (null when there is none). */
  controllerRef?: MutableRefObject<StressController | null>;
  onSelectIncident?: (id: string) => void;
}

export function StressTestPanel(props: StressTestPanelProps) {
  // History is kept per incident in React state (session-local) so results never mix between incidents.
  const [history, setHistory] = useState<Record<string, ShockRun[]>>({});
  const seq = useRef(0);
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);

  useEffect(() => {
    if (!props.incidentId && props.active && props.onSelectIncident && typeof api.incidents === "function") {
      api
        .incidents()
        .then((res) => {
          if (Array.isArray(res)) setIncidents(res);
        })
        .catch(() => {});
    }
  }, [props.incidentId, props.active, props.onSelectIncident]);

  if (!props.incidentId) {
    return (
      <div className="stress-panel">
        <p className="shock-note">{SCORING_NOTE}</p>
        <p className="state">Select an incident (in the Incident tab, or by raising one in chat) to stress-test its diagnosis.</p>
        {props.onSelectIncident && incidents.length > 0 && (
          <div
            className="shock-incident-picker"
            style={{
              marginTop: 16,
              padding: "12px 14px",
              background: "rgba(15, 23, 42, 0.7)",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-bright)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                ⚡ Quick Select Incident
              </span>
              <button
                type="button"
                className="btn btn-primary btn-small"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => props.onSelectIncident?.(incidents[0].id)}
              >
                Load Latest ({incidents[0].id})
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
              {incidents.slice(0, 8).map((inc) => (
                <button
                  key={inc.id}
                  type="button"
                  className="btn btn-secondary btn-small"
                  style={{
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    borderRadius: 6,
                  }}
                  onClick={() => props.onSelectIncident?.(inc.id)}
                  title={`Stress-test diagnosis for ${inc.title}`}
                >
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>
                    <span style={{ color: "var(--color-primary)", marginRight: 6 }}>{inc.id}</span>
                    {inc.title}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.7, whiteSpace: "nowrap", marginLeft: 8 }}>
                    {inc.severity} · {inc.origin || "alert"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const id = props.incidentId;
  return (
    // Keyed by incident: selection, errors and in-flight work cannot leak from one incident to the next.
    <StressTestBody
      key={id}
      {...props}
      incidentId={id}
      runs={history[id] ?? []}
      onRun={(run) => setHistory((h) => ({ ...h, [id]: [...(h[id] ?? []), run] }))}
      nextSeq={() => ++seq.current}
    />
  );
}

type Mode = "manual" | "auto";

function describeError(e: unknown): { unavailable: boolean; text: string } {
  const p = parseApiError(e);
  const unavailable = p !== null && (p.status === 501 || (p.status === 404 && /^not found$/i.test(p.detail.trim())));
  return { unavailable, text: errorMessage(e) };
}

interface BodyProps extends StressTestPanelProps {
  incidentId: string;
  runs: ShockRun[];
  onRun: (run: ShockRun) => void;
  nextSeq: () => number;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

function StressTestBody({ incidentId, active, shock, onShockResult, onGraphChange, onNotify, runs, onRun, nextSeq, controllerRef, onSelectIncident }: BodyProps) {
  const uid = useId();
  // Latch: once this incident's tab has been viewed, keep the data loaded even if the user switches tabs.
  const [wanted, setWanted] = useState(active);
  useEffect(() => {
    if (active) setWanted(true);
  }, [active]);
  const hyp = useAsync(() => api.hypotheses(incidentId), incidentId, 0, wanted);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<Mode | null>(null);
  const [runError, setRunError] = useState<{ unavailable: boolean; text: string } | null>(null);
  const inflight = useRef(false);
  const alive = useRef(true);
  const pushBaselineGraph = useRef(false);
  const resetWaiter = useRef<{ resolve: (n: number) => void; reject: (e: Error) => void } | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      resetWaiter.current?.reject(new Error("The stress panel closed before the baseline reloaded."));
      resetWaiter.current = null;
    };
  }, []);

  // After "Reset shocks" reloads the baseline, show the baseline graph (explicit user action only).
  useEffect(() => {
    if (!pushBaselineGraph.current || hyp.loading) return;
    if (hyp.data) {
      pushBaselineGraph.current = false;
      if (hasGraph(hyp.data.graph)) onGraphChange(hyp.data.graph);
      resetWaiter.current?.resolve(hyp.data.hypotheses.length);
      resetWaiter.current = null;
    } else if (hyp.error) {
      pushBaselineGraph.current = false;
      resetWaiter.current?.reject(new Error(`Couldn't reload the baseline: ${hyp.error}`));
      resetWaiter.current = null;
    }
  }, [hyp.data, hyp.loading, hyp.error, hyp.settled, onGraphChange]);

  const result = shock && shock.incident_id === incidentId ? shock : null;

  // A new result is the point of the action: bring it into view instead of leaving it at the panel's edge.
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView?.({ block: "start" });
  }, [result]);
  const removedIds = removedEvidenceIds(result);
  const sourceImpact = new Map((result?.critical_sources ?? []).map((s) => [s.source, s.impact_score]));
  const selectionCount = selectedIds.size + selectedSources.size;

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (!next.delete(value)) next.add(value);
    return next;
  };

  function record(res: EvidenceShockResponse, ids: string[], sources: string[], mode: Mode) {
    onShockResult(incidentId, res);
    onRun({ seq: nextSeq(), incidentId, mode, removedIds: ids, removedSources: sources, response: res });
    if (hasGraph(res.graph)) onGraphChange(res.graph); // no (or empty) graph: keep the current one
    onNotify("info", `Stress test finished: ${res.verdict.toUpperCase()}.`);
  }

  /** Runs one user action at a time; selection is never touched on failure so the user can simply retry. */
  async function guarded<T>(mode: Mode, work: () => Promise<T>): Promise<Outcome<T>> {
    if (inflight.current) return { ok: false, error: "A stress test is already running." };
    inflight.current = true;
    setRunning(mode);
    setRunError(null);
    try {
      return { ok: true, value: await work() };
    } catch (e) {
      const described = describeError(e);
      if (alive.current) setRunError(described);
      return { ok: false, error: described.text };
    } finally {
      inflight.current = false;
      if (alive.current) setRunning(null);
    }
  }

  const switchedAway = () => new Error("The incident changed before the stress test finished.");

  function runManual() {
    const ids = [...selectedIds];
    const sources = [...selectedSources];
    if (ids.length + sources.length === 0) return;
    const req: EvidenceShockRequest = { incident_id: incidentId };
    if (ids.length) req.remove_evidence_ids = ids;
    if (sources.length) req.remove_sources = sources;
    void guarded("manual", async () => {
      const res = await api.evidenceShock(req);
      if (!alive.current) throw switchedAway();
      record(res, ids, sources, "manual");
      return res;
    });
  }

  /**
   * The contract has no server-side auto-select: the caller names what to remove. So Auto-shock asks the backend
   * for its own critical-evidence ranking (a request with nothing removed) and removes the source it ranks first.
   */
  function runAuto(): Promise<Outcome<EvidenceShockResponse>> {
    return guarded("auto", async () => {
      const probe = await api.evidenceShock({ incident_id: incidentId });
      if (!alive.current) throw switchedAway();
      const top = probe.critical_sources?.[0]?.source;
      if (!top) throw new Error("The backend returned no critical sources, so there is nothing to auto-select.");
      setSelectedIds(new Set());
      setSelectedSources(new Set([top]));
      const res = await api.evidenceShock({ incident_id: incidentId, remove_sources: [top] });
      if (!alive.current) throw switchedAway();
      record(res, [], [top], "auto");
      return res;
    });
  }

  /** ShockViz's "critical channel" chips only select a source (nothing is sent); say so, since the inventory may be off-screen. */
  function chooseSource(src: string) {
    if (busy) return;
    const adding = !selectedSources.has(src);
    setSelectedSources((s) => toggle(s, src));
    onNotify("info", adding ? `${sourceLabel(src)} selected for removal. Press Run shock to test it.` : `${sourceLabel(src)} deselected.`);
  }

  function reset(): Promise<number> {
    setSelectedIds(new Set());
    setSelectedSources(new Set());
    setRunError(null);
    onShockResult(incidentId, null);
    pushBaselineGraph.current = true;
    resetWaiter.current?.reject(new Error("Superseded by a newer reset."));
    const done = new Promise<number>((resolve, reject) => {
      resetWaiter.current = { resolve, reject };
    });
    hyp.reload();
    return done;
  }

  // The controller always calls the latest render's functions and state.
  const latest = useRef({ hyp, running, runAuto, reset });
  latest.current = { hyp, running, runAuto, reset };
  useEffect(() => {
    if (!controllerRef) return;
    const controller: StressController = {
      incidentId,
      status: () => {
        const { hyp: h, running: r } = latest.current;
        if (h.error) return { kind: "error", message: h.error };
        if (!h.data || h.loading) return { kind: "loading" };
        return r !== null ? { kind: "busy" } : { kind: "ready" };
      },
      autoShock: async () => {
        const outcome = await latest.current.runAuto();
        if (!outcome.ok) throw new Error(outcome.error);
        return outcome.value;
      },
      resetShocks: () => latest.current.reset(),
    };
    controllerRef.current = controller;
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [controllerRef, incidentId]);

  const busy = running !== null;
  const gaps = result ? comparisonGaps(result) : [];
  const ranked = [...(hyp.data?.hypotheses ?? [])].sort((a, b) => a.rank - b.rank);

  return (
    <div className="stress-panel">
      <div className="stress-head">
        <h3>Evidence Shock Lab</h3>
        <code className="inc-id">{incidentId}</code>
        {hyp.data && (
          <span className="row-meta">
            {hyp.data.service} · {hyp.data.symptom}
          </span>
        )}
        {onSelectIncident && (
          <button
            type="button"
            className="btn btn-small btn-secondary"
            style={{ fontSize: 11, padding: "2px 8px", marginLeft: "auto" }}
            onClick={() => onSelectIncident("")}
            title="Switch incident"
          >
            Switch incident
          </button>
        )}
      </div>
      <p className="shock-note">{SCORING_NOTE}</p>

      {hyp.error ? (
        <HypothesesError error={hyp.error} onRetry={hyp.reload} />
      ) : !hyp.data ? (
        <p className="state" role="status">
          {wanted ? "Loading hypotheses…" : "Open this tab to load hypotheses."}
        </p>
      ) : ranked.length === 0 ? (
        <p className="state">The backend returned no hypotheses for this incident, so there is nothing to stress-test.</p>
      ) : (
        <>
          <section className="section" aria-labelledby={`${uid}-base`}>
            <h4 id={`${uid}-base`} className="subhead">
              Baseline hypotheses
            </h4>
            <ol className="hyp-list">
              {ranked.map((h) => (
                <li key={h.service}>
                  <span className="hyp-rank">#{h.rank}</span>
                  <strong>{h.service}</strong>
                  <span className="row-meta">
                    score {h.score} · {h.hops} hop{h.hops === 1 ? "" : "s"}
                    {h.owner ? <> · owner {h.owner}</> : null} · {h.evidence?.length ?? 0} evidence
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="section" aria-labelledby={`${uid}-ev`}>
            <h4 id={`${uid}-ev`} className="subhead">
              Evidence: choose what to remove
            </h4>
            <EvidenceInventory
              hypotheses={ranked}
              selectedIds={selectedIds}
              selectedSources={selectedSources}
              removedIds={removedIds}
              sourceImpact={sourceImpact}
              disabled={busy}
              onToggleId={(id) => setSelectedIds((s) => toggle(s, id))}
              onToggleSource={(src) => setSelectedSources((s) => toggle(s, src))}
            />

            <p className="row-meta" aria-live="polite">
              Selected for removal: {selectedSources.size} source{selectedSources.size === 1 ? "" : "s"}, {selectedIds.size} item
              {selectedIds.size === 1 ? "" : "s"}. Nothing is sent until you run a shock.
            </p>
            <div className="shock-actions">
              <button type="button" className="btn btn-primary" disabled={busy || selectionCount === 0} onClick={runManual}>
                {running === "manual" ? "Running…" : "Run shock"}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void runAuto()}>
                {running === "auto" ? "Auto-shocking…" : "Auto-shock"}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void reset().catch(() => undefined)}>
                Reset shocks
              </button>
            </div>
            <p className="hint">Auto-shock removes the evidence source the backend ranks most critical (by its own F(e) impact score).</p>
            {runError && (
              <div className="state state-error" role="alert">
                <p>
                  {runError.unavailable
                    ? "Evidence Shock isn't available on this backend. "
                    : "The stress test didn't complete, and your selection is kept. "}
                  {runError.text}
                </p>
              </div>
            )}
          </section>
        </>
      )}

      {result && (
        <section className="section" aria-labelledby={`${uid}-res`} ref={resultRef}>
          <h4 id={`${uid}-res`} className="subhead">
            Result (after removal)
          </h4>
          <ShockSummary shock={result} />
          {gaps.length > 0 ? (
            // ShockViz would silently use the post-shock value as the baseline when before-values are missing.
            // Show only what the backend actually sent rather than an invented comparison.
            <div className="state" role="status">
              <p>
                The backend response has no before/after values for {gaps.join(", ")}, so no comparison is drawn. Post-shock ranking as
                returned:
              </p>
              <ol className="hyp-list">
                {[...result.hypotheses]
                  .sort((a, b) => a.rank - b.rank)
                  .map((h) => (
                    <li key={h.service}>
                      <span className="hyp-rank">#{h.rank}</span>
                      <strong>{h.service}</strong>
                      <span className="row-meta">score {h.score}</span>
                    </li>
                  ))}
              </ol>
            </div>
          ) : (
            <div className="shockviz-host">
              <ShockViz shock={result} onSelectSource={chooseSource} />
            </div>
          )}
        </section>
      )}

      <section className="section" aria-labelledby={`${uid}-hist`}>
        <h4 id={`${uid}-hist`} className="subhead">
          Shock history <span className="hint-inline">(this session only; cleared on reload)</span>
        </h4>
        <ShockHistory runs={runs} />
      </section>
    </div>
  );
}

function HypothesesError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const p = parseApiError(error);
  const unavailable = p !== null && (p.status === 501 || (p.status === 404 && /^not found$/i.test(p.detail.trim())));
  const unknownIncident = p !== null && p.status === 404 && !unavailable;
  return (
    <div className="state state-error" role="alert">
      <p>
        {unavailable
          ? `Evidence Shock isn't available on this backend (HTTP ${p?.status}). Nothing is retried automatically.`
          : unknownIncident
            ? `The backend doesn't know this incident: ${p?.detail}`
            : `Couldn't load hypotheses: ${error}`}
      </p>
      <button type="button" className="btn btn-small" onClick={onRetry}>
        {unavailable ? "Check again" : "Try again"}
      </button>
    </div>
  );
}
