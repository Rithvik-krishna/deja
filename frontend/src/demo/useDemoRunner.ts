import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/errors";
import { DemoCancelled, type DemoActions, type DemoContext, type DemoStep } from "./script";

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";
export type DemoPhase = "idle" | "running" | "stopping" | "done" | "failed" | "stopped";

export interface StepState {
  id: string;
  label: string;
  status: StepStatus;
  caption?: string;
  error?: string;
}

export interface DemoRunnerState {
  phase: DemoPhase;
  steps: StepState[];
  /** Index of the step that is running, or that finished / failed / was stopped last. */
  current: number;
}

interface Options {
  /** Pause after each step so the audience can read it (TASKS.md: 2 s). */
  pauseMs: number;
  /** A step that takes longer than this fails instead of hanging the demo. */
  stepTimeoutMs?: number;
}

const fresh = (steps: DemoStep[]): StepState[] => steps.map((s) => ({ id: s.id, label: s.label, status: "pending" }));

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`"${label}" did not finish within ${Math.round(ms / 1000)} s.`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Runs the scripted demo one step at a time. Only one run can be active. Stop takes effect between steps (an
 * in-flight request is allowed to finish, since the API client cannot abort), and a failed step stops the run
 * with its error and can be retried from that step.
 */
export function useDemoRunner(steps: DemoStep[], actions: DemoActions, { pauseMs, stepTimeoutMs = 30000 }: Options) {
  const [state, setState] = useState<DemoRunnerState>({ phase: "idle", steps: fresh(steps), current: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;
  const running = useRef(false);
  const cancelled = useRef(false);
  const alive = useRef(true);
  const wake = useRef<(() => void) | null>(null);
  const ctxRef = useRef<DemoContext | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelled.current = true;
      wake.current?.();
    };
  }, []);

  const patch = (i: number, s: Partial<StepState>) =>
    setState((st) => ({ ...st, steps: st.steps.map((x, j) => (j === i ? { ...x, ...s } : x)) }));

  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        wake.current = null;
        resolve();
      }
      wake.current = done;
    });

  const runFrom = useCallback(
    async (from: number) => {
      if (running.current) return; // no duplicate runs
      running.current = true;
      cancelled.current = false;
      if (from === 0 || !ctxRef.current) {
        // Actions are looked up at call time so a step always uses the current session, refs and state.
        const live: DemoActions = {
          resetDemo: () => actionsRef.current.resetDemo(),
          wipeSession: () => actionsRef.current.wipeSession(),
          showTab: (t) => actionsRef.current.showTab(t),
          sendChat: (m) => actionsRef.current.sendChat(m),
          stress: () => actionsRef.current.stress(),
        };
        ctxRef.current = { actions: live, incidentId: null, isCancelled: () => cancelled.current };
      }
      const ctx = ctxRef.current;
      setState((st) => ({
        phase: "running",
        current: from,
        steps: from === 0 ? fresh(steps) : st.steps.map((x, j) => (j >= from ? { id: x.id, label: x.label, status: "pending" } : x)),
      }));

      let phase: DemoPhase = "done";
      let last = from;
      for (let i = from; i < steps.length; i++) {
        if (cancelled.current) {
          phase = "stopped";
          break;
        }
        last = i;
        setState((st) => ({ ...st, current: i }));
        patch(i, { status: "running" });
        try {
          const caption = await withTimeout(steps[i].run(ctx), stepTimeoutMs, steps[i].label);
          patch(i, { status: "done", caption });
        } catch (e) {
          if (e instanceof DemoCancelled) {
            patch(i, { status: "skipped" });
            phase = "stopped";
          } else {
            patch(i, { status: "failed", error: errorMessage(e) });
            phase = "failed";
          }
          break;
        }
        if (i < steps.length - 1) await pause(pauseMs);
        if (cancelled.current && i < steps.length - 1) {
          phase = "stopped";
          break;
        }
      }

      running.current = false;
      if (!alive.current) return;
      setState((st) => ({
        ...st,
        phase,
        current: last,
        steps: phase === "stopped" ? st.steps.map((x) => (x.status === "pending" ? { ...x, status: "skipped" } : x)) : st.steps,
      }));
    },
    [steps, pauseMs, stepTimeoutMs],
  );

  const start = useCallback(() => void runFrom(0), [runFrom]);

  const stop = useCallback(() => {
    if (!running.current) return;
    cancelled.current = true;
    setState((st) => ({ ...st, phase: "stopping" }));
    wake.current?.();
  }, []);

  /** Re-runs the failed step and continues from there, keeping what earlier steps learned (e.g. the incident id). */
  const retry = useCallback(() => {
    const st = stateRef.current;
    if (st.phase === "failed") void runFrom(st.current);
  }, [runFrom]);

  const dismiss = useCallback(() => {
    if (running.current) return;
    setState({ phase: "idle", steps: fresh(steps), current: 0 });
  }, [steps]);

  return { state, start, stop, retry, dismiss, active: state.phase === "running" || state.phase === "stopping" };
}
