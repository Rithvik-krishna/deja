import { useState } from "react";
import type { Health } from "../lib/apiTypes";
import { ConfirmDialog } from "./ConfirmDialog";

export type BusyAction = "wipe" | "reset" | null;

interface TopBarProps {
  health: { data: Health | undefined; error: string | null; loading: boolean };
  onRecheckHealth: () => void;
  sessionId: string;
  busy: BusyAction;
  onWipeSession: () => void;
  /** Resolves when the reset attempt is finished (the caller reports success / failure itself). */
  onResetDemo: () => Promise<void>;
}

/** Backend badge text comes from GET /health (`mode`, `neo4j`) — never inferred from a request merely succeeding. */
function BackendBadge({ health, onRecheck }: Pick<TopBarProps, "health"> & { onRecheck: () => void }) {
  const { data, error, loading } = health;
  let cls = "backend-badge";
  let text: string;
  let title: string;
  if (loading && !data) {
    cls += " is-checking";
    text = "Checking backend…";
    title = "Waiting for GET /health";
  } else if (error || !data) {
    cls += " is-down";
    text = "Backend unreachable";
    title = `${error ?? "No response"} — click to re-check`;
  } else if (data.mode === "mock") {
    cls += " is-ok";
    text = "MOCK · in-memory data";
    title = `GET /health → status=${data.status}, mode=${data.mode}, neo4j=${data.neo4j}. Click to re-check`;
  } else {
    cls += data.neo4j ? " is-ok" : " is-warn";
    text = `${data.mode.toUpperCase()} · Neo4j ${data.neo4j ? "connected" : "NOT connected"}`;
    title = `GET /health → status=${data.status}, mode=${data.mode}, neo4j=${data.neo4j}. Click to re-check`;
  }
  return (
    <button type="button" className={cls} title={title} onClick={onRecheck} aria-label={`Backend status: ${text}. Re-check`}>
      <span className="dot" aria-hidden="true" />
      {text}
    </button>
  );
}

export function TopBar({ health, onRecheckHealth, sessionId, busy, onWipeSession, onResetDemo }: TopBarProps) {
  const [confirmReset, setConfirmReset] = useState(false);

  async function confirmed() {
    await onResetDemo();
    setConfirmReset(false);
  }

  return (
    <header className="topbar">
      <div className="brand">
        <h1>Déjà</h1>
        <span className="tagline">the on-call copilot that remembers</span>
      </div>

      <div className="topbar-spacer" />

      <BackendBadge health={health} onRecheck={onRecheckHealth} />

      <span className="session" title={`Chat session ${sessionId}`}>
        Session <code>{sessionId.slice(0, 8)}</code>
      </span>

      <button type="button" className="btn" onClick={onWipeSession} disabled={busy !== null}>
        {busy === "wipe" ? "Wiping…" : "Wipe session"}
      </button>
      <button type="button" className="btn btn-danger-outline" onClick={() => setConfirmReset(true)} disabled={busy !== null}>
        Reset demo
      </button>

      {confirmReset && (
        <ConfirmDialog
          title="Reset demo data?"
          confirmLabel="Reset demo data"
          busy={busy === "reset"}
          onConfirm={confirmed}
          onCancel={() => setConfirmReset(false)}
        >
          <p>
            This reloads the seed data into the backend. Incidents, fix attempts and ownership changes recorded since
            then are <strong>lost</strong>, and all chat sessions are cleared.
          </p>
          <p>
            To clear only this conversation and keep the graph, use <strong>Wipe session</strong> instead.
          </p>
        </ConfirmDialog>
      )}
    </header>
  );
}
