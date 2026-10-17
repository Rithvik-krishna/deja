import { api, type ChatResponse } from "../api/client";
import type { StressController } from "../components/StressTestPanel";
import { removedEvidenceIds } from "../components/shock/types";
import { formatTs } from "../lib/format";

export type DemoTab = "risk" | "incident" | "stress" | "owners";

/** What the demo can do. App implements each one with the same code paths the buttons use. */
export interface DemoActions {
  resetDemo: () => Promise<void>;
  wipeSession: () => Promise<void>;
  showTab: (tab: DemoTab) => void;
  /** Sends through the Chat component, exactly like typing the message. */
  sendChat: (text: string) => Promise<ChatResponse>;
  stress: () => StressController | null;
}

export interface DemoContext {
  actions: DemoActions;
  /** Set from the backend's reply to the first chat message; never invented. */
  incidentId: string | null;
  isCancelled: () => boolean;
}

export interface DemoStep {
  id: string;
  label: string;
  /** Performs the step and returns a caption built only from what the backend returned. */
  run: (ctx: DemoContext) => Promise<string>;
}

/** Thrown when the user stops the demo while a step is waiting. */
export class DemoCancelled extends Error {
  constructor() {
    super("Stopped by the user.");
  }
}

/**
 * The chat messages, in the order of the demo script in AGENTS.md / README.md (TASKS.md T3: "the 5 demo messages").
 * The ownership question names the service: the backend's parser does not resolve "it", so the README wording is used.
 */
export const DEMO_MESSAGES = {
  alert: "checkout latency is spiking",
  restart: "I restarted, still failing",
  recall: "it's back",
  reassign: "payments-api is now owned by Ravi",
  july: "who owned payments-api in July?",
} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function needIncident(ctx: DemoContext): string {
  if (!ctx.incidentId) throw new Error("No incident is open: the investigation step did not return one.");
  return ctx.incidentId;
}

/** Waits until the Stress Test panel shows this incident with its baseline loaded. Fails fast on a load error. */
async function readyStressPanel(ctx: DemoContext, incidentId: string, timeoutMs = 20000): Promise<StressController> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (ctx.isCancelled()) throw new DemoCancelled();
    const c = ctx.actions.stress();
    if (c && c.incidentId === incidentId) {
      const st = c.status();
      if (st.kind === "ready") return c;
      if (st.kind === "error") throw new Error(st.message);
    }
    if (Date.now() > deadline) throw new Error("The Stress Test panel did not finish loading the hypotheses in time.");
    await sleep(100);
  }
}

async function chatStep(ctx: DemoContext, text: string): Promise<ChatResponse> {
  return ctx.actions.sendChat(text);
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "reset",
    label: "Reset demo data to the seed",
    run: async ({ actions }) => {
      await actions.resetDemo();
      return "Seed data reloaded. Chat, graph and selection cleared.";
    },
  },
  {
    id: "risk",
    label: "Risk map: hidden single point of failure",
    run: async ({ actions }) => {
      actions.showTab("risk");
      const r = await api.risk(180, 10);
      const top = r.services[0];
      if (!top) throw new Error("The risk endpoint returned no services.");
      return `#${top.rank} by risk: ${top.service} (${top.tier}), #${top.fan_in_rank} by fan-in, #${top.incident_rank} by incidents, score ${top.risk_score}.`;
    },
  },
  {
    id: "alert",
    label: `Chat: "${DEMO_MESSAGES.alert}"`,
    run: async (ctx) => {
      const res = await chatStep(ctx, DEMO_MESSAGES.alert);
      if (!res.incident_id) throw new Error(`The backend did not open an incident (intent "${res.intent || "none"}"): ${res.reply}`);
      ctx.incidentId = res.incident_id;
      return res.reply;
    },
  },
  {
    id: "deploy",
    label: "Upstream path and recent deploy",
    run: async (ctx) => {
      const id = needIncident(ctx);
      ctx.actions.showTab("incident");
      const d = await api.incident(id);
      const dep = d.followed_deploy;
      const deploy = dep
        ? `Followed deploy: ${dep.service} ${dep.version} by ${dep.author} (${formatTs(dep.deployed_at)}).`
        : "No deploy is linked to this incident.";
      return `${d.id}: likely origin ${d.origin}, impacted ${d.impacted.join(", ") || "none"}. ${deploy}`;
    },
  },
  {
    id: "shock",
    label: "Evidence Shock: remove the most critical evidence source",
    run: async (ctx) => {
      const id = needIncident(ctx);
      ctx.actions.showTab("stress");
      const panel = await readyStressPanel(ctx, id);
      const r = await panel.autoShock();
      const removed = removedEvidenceIds(r).size;
      return `${r.verdict.toUpperCase()}: top suspect ${r.top_suspect_before} → ${r.top_suspect_after}, margin ${r.margin_before} → ${r.margin_after}, ${removed} evidence item${removed === 1 ? "" : "s"} removed.`;
    },
  },
  {
    id: "baseline",
    label: "Restore the baseline (Reset shocks)",
    run: async (ctx) => {
      const id = needIncident(ctx);
      const panel = await readyStressPanel(ctx, id);
      const n = await panel.resetShocks();
      return `Baseline restored: ${n} hypotheses re-fetched from the backend and the shock result cleared.`;
    },
  },
  {
    id: "restart",
    label: `Chat: "${DEMO_MESSAGES.restart}"`,
    run: async (ctx) => {
      ctx.actions.showTab("incident");
      return (await chatStep(ctx, DEMO_MESSAGES.restart)).reply;
    },
  },
  {
    id: "wipe",
    label: "Wipe the chat session",
    run: async ({ actions }) => {
      await actions.wipeSession();
      return "Chat memory wiped on the backend. The graph and incidents were not touched.";
    },
  },
  {
    id: "recall",
    label: `Chat: "${DEMO_MESSAGES.recall}"`,
    run: async (ctx) => (await chatStep(ctx, DEMO_MESSAGES.recall)).reply,
  },
  {
    id: "reassign",
    label: `Chat: "${DEMO_MESSAGES.reassign}"`,
    run: async (ctx) => {
      ctx.actions.showTab("owners");
      return (await chatStep(ctx, DEMO_MESSAGES.reassign)).reply;
    },
  },
  {
    id: "july",
    label: `Chat: "${DEMO_MESSAGES.july}"`,
    run: async (ctx) => (await chatStep(ctx, DEMO_MESSAGES.july)).reply,
  },
  {
    id: "finish",
    label: "Finish",
    run: async (ctx) => {
      ctx.actions.showTab("incident");
      return `Demo complete. The backend now holds the demo's changes (${ctx.incidentId ?? "the new incident"}, its failed restart, the new owner). Press Reset demo to return to the seed.`;
    },
  },
];
