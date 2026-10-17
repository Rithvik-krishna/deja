import type { ToastItem } from "../state/useToasts";

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

/** Errors use role="alert" (announced immediately); success / info use role="status" (announced politely). */
export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div className="toast-viewport" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
          <span className="toast-text">{t.text}</span>
          <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => onDismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
