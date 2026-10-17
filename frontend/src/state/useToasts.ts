import { useCallback, useEffect, useRef, useState } from "react";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

const MAX_VISIBLE = 4;
const LIFETIME_MS: Record<ToastKind, number> = { success: 5000, info: 5000, error: 10000 };

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (kind: ToastKind, text: string) => {
      const id = ++nextId.current;
      setToasts((all) => {
        const last = all[all.length - 1];
        // Don't stack an identical notification on top of itself.
        if (last && last.kind === kind && last.text === text) return all;
        return [...all, { id, kind, text }].slice(-MAX_VISIBLE);
      });
      timers.current.set(id, window.setTimeout(() => dismiss(id), LIFETIME_MS[kind]));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  return { toasts, notify, dismiss };
}
