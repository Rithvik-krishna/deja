import { api } from "../api/client";
import type { StressController } from "../components/StressTestPanel";
import { chatAlert, detail045, riskResponse, shockInconclusive } from "../test/fixtures";
import { DEMO_MESSAGES, DEMO_STEPS, DemoCancelled, type DemoActions, type DemoContext } from "./script";

vi.mock("../api/client", () => ({ api: { risk: vi.fn(), incident: vi.fn() } }));
const m = vi.mocked(api);

const step = (id: string) => {
  const s = DEMO_STEPS.find((x) => x.id === id);
  if (!s) throw new Error(`no step ${id}`);
  return s;
};

function ctxWith(over: Partial<DemoActions> = {}, incidentId: string | null = null, cancelled = false) {
  const actions: DemoActions = {
    resetDemo: vi.fn().mockResolvedValue(undefined),
    wipeSession: vi.fn().mockResolvedValue(undefined),
    showTab: vi.fn(),
    sendChat: vi.fn().mockResolvedValue(chatAlert),
    stress: vi.fn().mockReturnValue(null),
    ...over,
  };
  const ctx: DemoContext = { actions, incidentId, isCancelled: () => cancelled };
  return { ctx, actions };
}

const controller = (over: Partial<StressController> = {}): StressController => ({
  incidentId: "INC-045",
  status: () => ({ kind: "ready" }),
  autoShock: vi.fn().mockResolvedValue(shockInconclusive),
  resetShocks: vi.fn().mockResolvedValue(5),
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("demo script order", () => {
  it("follows the documented story, with the shock segment and baseline restore after the first investigation", () => {
    expect(DEMO_STEPS.map((s) => s.id)).toEqual([
      "reset", "risk", "alert", "deploy", "shock", "baseline", "restart", "wipe", "recall", "reassign", "july", "finish",
    ]);
  });

  it("uses the documented chat wording (README / AGENTS.md demo script)", () => {
    expect(Object.values(DEMO_MESSAGES)).toEqual([
      "checkout latency is spiking",
      "I restarted, still failing",
      "it's back",
      "payments-api is now owned by Ravi",
      "who owned payments-api in July?",
    ]);
  });
});

describe("demo step captions come from the backend's responses", () => {
  it("risk: shows the Risk tab and describes the top service from /graph/risk", async () => {
    m.risk.mockResolvedValue(riskResponse);
    const { ctx, actions } = ctxWith();
    const caption = await step("risk").run(ctx);
    expect(actions.showTab).toHaveBeenCalledWith("risk");
    expect(m.risk).toHaveBeenCalledWith(180, 10);
    expect(caption).toBe("#1 by risk: payments-api (tier-2), #6 by fan-in, #1 by incidents, score 22.");
  });

  it("risk: fails honestly when the backend returns no services", async () => {
    m.risk.mockResolvedValue({ ...riskResponse, services: [] });
    await expect(step("risk").run(ctxWith().ctx)).rejects.toThrow("returned no services");
  });

  it("alert: sends the documented message, remembers the incident the backend opened, and returns the backend's reply", async () => {
    const { ctx, actions } = ctxWith();
    const caption = await step("alert").run(ctx);
    expect(actions.sendChat).toHaveBeenCalledWith("checkout latency is spiking");
    expect(ctx.incidentId).toBe("INC-045");
    expect(caption).toBe(chatAlert.reply);
  });

  it("alert: fails if the backend did not open an incident, and says what it answered", async () => {
    const { ctx } = ctxWith({ sendChat: vi.fn().mockResolvedValue({ ...chatAlert, incident_id: null, intent: "help", reply: "I can open an incident." }) });
    await expect(step("alert").run(ctx)).rejects.toThrow('did not open an incident (intent "help"): I can open an incident.');
    expect(ctx.incidentId).toBeNull();
  });

  it("deploy: describes the followed deploy from the incident detail", async () => {
    m.incident.mockResolvedValue(detail045);
    const { ctx, actions } = ctxWith({}, "INC-045");
    const caption = await step("deploy").run(ctx);
    expect(actions.showTab).toHaveBeenCalledWith("incident");
    expect(m.incident).toHaveBeenCalledWith("INC-045");
    expect(caption).toContain("likely origin payments-api, impacted checkout");
    expect(caption).toContain("Followed deploy: payments-api v2.3.1 by Asha Menon (14 Oct 2026, 04:50 UTC)");
  });

  it("deploy: does not invent a deploy when none is linked", async () => {
    m.incident.mockResolvedValue({ ...detail045, followed_deploy: null });
    const caption = await step("deploy").run(ctxWith({}, "INC-045").ctx);
    expect(caption).toContain("No deploy is linked to this incident.");
    expect(caption).not.toContain("v2.3.1");
  });

  it("deploy / shock / baseline refuse to run without an incident", async () => {
    for (const id of ["deploy", "shock", "baseline"]) {
      await expect(step(id).run(ctxWith().ctx)).rejects.toThrow("No incident is open");
    }
  });

  it("shock: drives the Stress panel's Auto-shock and reports its real verdict, suspects, margins and removed evidence", async () => {
    const c = controller();
    const { ctx, actions } = ctxWith({ stress: () => c }, "INC-045");
    const caption = await step("shock").run(ctx);
    expect(actions.showTab).toHaveBeenCalledWith("stress");
    expect(c.autoShock).toHaveBeenCalledTimes(1);
    expect(caption).toBe("INCONCLUSIVE: top suspect payments-api → inventory, margin 1 → 0, 3 evidence items removed.");
  });

  it("shock: surfaces the panel's error instead of a result", async () => {
    const c = controller({ autoShock: vi.fn().mockRejectedValue(new Error("500 /insights/evidence-shock: boom")) });
    await expect(step("shock").run(ctxWith({ stress: () => c }, "INC-045").ctx)).rejects.toThrow("500 /insights/evidence-shock: boom");
  });

  it("shock: fails fast when the panel could not load hypotheses", async () => {
    const c = controller({ status: () => ({ kind: "error", message: "501 /insights/hypotheses/INC-045: Not implemented" }) });
    await expect(step("shock").run(ctxWith({ stress: () => c }, "INC-045").ctx)).rejects.toThrow("501 /insights/hypotheses");
  });

  it("shock: ignores a panel that is showing a different incident", async () => {
    const other = controller({ incidentId: "INC-099" });
    const { ctx } = ctxWith({ stress: () => other }, "INC-045");
    ctx.isCancelled = () => true; // otherwise it would wait for the 20 s timeout
    await expect(step("shock").run(ctx)).rejects.toBeInstanceOf(DemoCancelled);
    expect(other.autoShock).not.toHaveBeenCalled();
  });

  it("baseline: restores via the panel and reports how many hypotheses were re-fetched", async () => {
    const c = controller();
    const caption = await step("baseline").run(ctxWith({ stress: () => c }, "INC-045").ctx);
    expect(c.resetShocks).toHaveBeenCalledTimes(1);
    expect(caption).toContain("5 hypotheses re-fetched");
  });

  it("wipe / reset use the app's own actions", async () => {
    const { ctx, actions } = ctxWith();
    await step("wipe").run(ctx);
    await step("reset").run(ctx);
    expect(actions.wipeSession).toHaveBeenCalledTimes(1);
    expect(actions.resetDemo).toHaveBeenCalledTimes(1);
  });

  it("chat steps send exactly the documented message and return the reply", async () => {
    const reply = { ...chatAlert, reply: "backend says hi" };
    for (const [id, text] of [["restart", DEMO_MESSAGES.restart], ["recall", DEMO_MESSAGES.recall], ["reassign", DEMO_MESSAGES.reassign], ["july", DEMO_MESSAGES.july]] as const) {
      const sendChat = vi.fn().mockResolvedValue(reply);
      expect(await step(id).run(ctxWith({ sendChat }).ctx)).toBe("backend says hi");
      expect(sendChat).toHaveBeenCalledExactlyOnceWith(text);
    }
  });

  it("chat steps propagate a failed send", async () => {
    const sendChat = vi.fn().mockRejectedValue(new Error("Can't reach the Déjà API."));
    await expect(step("recall").run(ctxWith({ sendChat }).ctx)).rejects.toThrow("Can't reach the Déjà API.");
  });
});
