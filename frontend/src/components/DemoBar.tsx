import type { DemoRunnerState, StepStatus } from "../demo/useDemoRunner";

interface DemoBarProps {
  state: DemoRunnerState;
  onStop: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}

const PHASE_LABEL = {
  idle: "",
  running: "Running",
  stopping: "Stopping after this step…",
  done: "Finished",
  failed: "Failed",
  stopped: "Stopped",
} as const;

const STATUS_LABEL: Record<StepStatus, string> = {
  pending: "not started",
  running: "running",
  done: "done",
  failed: "failed",
  skipped: "skipped",
};

/** Progress for the scripted demo. Captions come from the backend's own responses, never from this component. */
export function DemoBar({ state, onStop, onRetry, onDismiss }: DemoBarProps) {
  if (state.phase === "idle") return null;
  const total = state.steps.length;
  const step = state.steps[state.current];
  const running = state.phase === "running" || state.phase === "stopping";

  return (
    <section className={`demo-bar demo-${state.phase}`} aria-label="Scripted demo">
      <div className="demo-head">
        <strong>Scripted demo</strong>
        <span className="demo-count">
          Step {Math.min(state.current + 1, total)} of {total}
        </span>
        <span className="demo-phase badge">{PHASE_LABEL[state.phase]}</span>
        <span className="demo-label">{step?.label}</span>
        <span className="demo-spacer" />
        {running && (
          <button type="button" className="btn btn-small" onClick={onStop} disabled={state.phase === "stopping"}>
            Stop
          </button>
        )}
        {state.phase === "failed" && (
          <button type="button" className="btn btn-small btn-primary" onClick={onRetry}>
            Retry step
          </button>
        )}
        {!running && (
          <button type="button" className="btn btn-small" onClick={onDismiss}>
            Close
          </button>
        )}
      </div>

      <ol className="demo-steps" aria-label="Demo steps">
        {state.steps.map((s, i) => (
          <li
            key={s.id}
            className={`demo-dot is-${s.status}${i === state.current ? " is-current" : ""}`}
            title={`${i + 1}. ${s.label} (${STATUS_LABEL[s.status]})`}
            aria-label={`Step ${i + 1}, ${s.label}: ${STATUS_LABEL[s.status]}`}
          />
        ))}
      </ol>

      <p className="demo-caption" role={state.phase === "failed" ? "alert" : "status"} aria-live="polite">
        {state.phase === "failed" && step?.error
          ? `Step failed: ${step.error}`
          : step?.caption
            ? step.caption
            : step?.status === "running"
              ? "Working…"
              : ""}
      </p>
    </section>
  );
}
