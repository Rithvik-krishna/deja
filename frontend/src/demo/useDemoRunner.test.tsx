import { act, renderHook, waitFor } from "@testing-library/react";
import { deferred } from "../test/fixtures";
import type { DemoActions, DemoStep } from "./script";
import { useDemoRunner } from "./useDemoRunner";

const noActions: DemoActions = {
  resetDemo: async () => undefined,
  wipeSession: async () => undefined,
  showTab: () => undefined,
  sendChat: async () => {
    throw new Error("unused");
  },
  stress: () => null,
};

const step = (id: string, run: DemoStep["run"]): DemoStep => ({ id, label: `Step ${id}`, run });
const statuses = (r: { current: ReturnType<typeof useDemoRunner> }) => r.current.state.steps.map((s) => s.status);

describe("useDemoRunner", () => {
  it("runs steps in order with captions, ending in 'done'", async () => {
    const calls: string[] = [];
    const steps = ["a", "b", "c"].map((id) => step(id, async () => (calls.push(id), `caption ${id}`)));
    const { result } = renderHook(() => useDemoRunner(steps, noActions, { pauseMs: 0 }));

    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("done"));

    expect(calls).toEqual(["a", "b", "c"]);
    expect(result.current.state.steps.map((s) => s.caption)).toEqual(["caption a", "caption b", "caption c"]);
    expect(statuses(result)).toEqual(["done", "done", "done"]);
    expect(result.current.active).toBe(false);
  });

  it("ignores a second start while running (no duplicate run)", async () => {
    const held = deferred<string>();
    const run = vi.fn(() => held.promise);
    const { result } = renderHook(() => useDemoRunner([step("a", run)], noActions, { pauseMs: 0 }));

    act(() => {
      result.current.start();
      result.current.start();
      result.current.start();
    });
    await waitFor(() => expect(result.current.state.phase).toBe("running"));
    act(() => result.current.start());

    expect(run).toHaveBeenCalledTimes(1);
    held.resolve("ok");
    await waitFor(() => expect(result.current.state.phase).toBe("done"));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("can be started again after it finishes, from a clean slate", async () => {
    const run = vi.fn(async () => "ok");
    const { result } = renderHook(() => useDemoRunner([step("a", run)], noActions, { pauseMs: 0 }));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("done"));
    act(() => result.current.start());
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.state.phase).toBe("done"));
  });

  it("stops during the pause between steps without waiting it out, and skips the rest", async () => {
    const steps = [step("a", async () => "a"), step("b", vi.fn(async () => "b")), step("c", vi.fn(async () => "c"))];
    const { result } = renderHook(() => useDemoRunner(steps, noActions, { pauseMs: 60000 }));

    act(() => result.current.start());
    await waitFor(() => expect(statuses(result)[0]).toBe("done")); // now sitting in the 60 s pause
    const t0 = Date.now();
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.state.phase).toBe("stopped"));

    expect(Date.now() - t0).toBeLessThan(2000);
    expect(statuses(result)).toEqual(["done", "skipped", "skipped"]);
    expect(steps[1].run).not.toHaveBeenCalled();
  });

  it("stop lets the step in flight finish, then stops", async () => {
    const held = deferred<string>();
    const second = vi.fn(async () => "b");
    const { result } = renderHook(() => useDemoRunner([step("a", () => held.promise), step("b", second)], noActions, { pauseMs: 0 }));

    act(() => result.current.start());
    await waitFor(() => expect(statuses(result)[0]).toBe("running"));
    act(() => result.current.stop());
    expect(result.current.state.phase).toBe("stopping");
    expect(result.current.active).toBe(true);

    held.resolve("done a");
    await waitFor(() => expect(result.current.state.phase).toBe("stopped"));
    expect(statuses(result)).toEqual(["done", "skipped"]);
    expect(second).not.toHaveBeenCalled();
  });

  it("a thrown error fails that step, stops the run, and shows the real message", async () => {
    const after = vi.fn(async () => "x");
    const { result } = renderHook(() =>
      useDemoRunner([step("a", async () => "a"), step("b", async () => { throw new Error("500 /chat: nope"); }), step("c", after)], noActions, { pauseMs: 0 }),
    );
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("failed"));

    expect(statuses(result)).toEqual(["done", "failed", "pending"]);
    expect(result.current.state.steps[1].error).toBe("500 /chat: nope");
    expect(result.current.state.current).toBe(1);
    expect(after).not.toHaveBeenCalled();
  });

  it("a step that never finishes fails with a timeout instead of hanging the demo", async () => {
    const { result } = renderHook(() => useDemoRunner([step("a", () => new Promise<string>(() => undefined))], noActions, { pauseMs: 0, stepTimeoutMs: 30 }));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("failed"));
    expect(result.current.state.steps[0].error).toMatch(/did not finish within/);
  });

  it("retry re-runs only the failed step and the rest, sharing the earlier context", async () => {
    let attempts = 0;
    const first = vi.fn(async (ctx: { incidentId: string | null }) => ((ctx.incidentId = "INC-045"), "a"));
    const flaky: DemoStep["run"] = async () => {
      if (++attempts === 1) throw new Error("transient");
      return "b";
    };
    const seen: Array<string | null> = [];
    const third: DemoStep["run"] = async (ctx) => (seen.push(ctx.incidentId), "c");
    const { result } = renderHook(() => useDemoRunner([step("a", first), step("b", flaky), step("c", third)], noActions, { pauseMs: 0 }));

    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("failed"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.phase).toBe("done"));

    expect(first).toHaveBeenCalledTimes(1); // not repeated
    expect(attempts).toBe(2);
    expect(seen).toEqual(["INC-045"]); // the incident learned in step a survived the retry
    expect(statuses(result)).toEqual(["done", "done", "done"]);
  });

  it("retry does nothing unless the run failed; dismiss resets only when not running", async () => {
    const held = deferred<string>();
    const run = vi.fn(() => held.promise);
    const { result } = renderHook(() => useDemoRunner([step("a", run)], noActions, { pauseMs: 0 }));
    act(() => result.current.retry());
    expect(run).not.toHaveBeenCalled();

    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("running"));
    act(() => result.current.dismiss());
    expect(result.current.state.phase).toBe("running"); // cannot be dismissed mid-run

    held.resolve("ok");
    await waitFor(() => expect(result.current.state.phase).toBe("done"));
    act(() => result.current.dismiss());
    expect(result.current.state.phase).toBe("idle");
    expect(statuses(result)).toEqual(["pending"]);
  });

  it("always hands steps the latest actions, so a step after a state change uses the current session", async () => {
    const seen: string[] = [];
    const steps = [step("a", async (ctx) => (await ctx.actions.sendChat("x"), "a")), step("b", async (ctx) => (await ctx.actions.sendChat("y"), "b"))];
    let session = "s1";
    const { result, rerender } = renderHook(() =>
      useDemoRunner(steps, { ...noActions, sendChat: async (t) => (seen.push(`${session}:${t}`), {} as never) }, { pauseMs: 20 }),
    );
    act(() => result.current.start());
    await waitFor(() => expect(seen).toEqual(["s1:x"]));
    session = "s2"; // e.g. the demo's own wipe step swapped the session between steps
    rerender();
    await waitFor(() => expect(result.current.state.phase).toBe("done"));
    expect(seen).toEqual(["s1:x", "s2:y"]);
  });
});
