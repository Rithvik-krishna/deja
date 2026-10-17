import type { ReactNode } from "react";

/** Explicit "not built yet" panel for right-hand tabs whose feature is not available in this build. Shows no data and offers no controls. */
export function TabPlaceholder({ title, status, children }: { title: string; status: string; children?: ReactNode }) {
  return (
    <div className="tab-placeholder">
      <h3>{title}</h3>
      <p className="badge badge-pending">{status}</p>
      {children && <p className="hint">{children}</p>}
    </div>
  );
}
