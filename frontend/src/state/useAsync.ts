import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/errors";

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  /** Increments every time a request settles (success or failure), even if the data is an identical object. */
  settled: number;
  reload: () => void;
}

interface Slot<T> {
  key: string;
  data: T | undefined;
  error: string | null;
  loading: boolean;
  settled: number;
}

/**
 * Runs `fn` and tracks its loading / error / data state.
 * - `key` identifies the thing being loaded. Data is bound to the key it was loaded for, so switching the key
 *   never shows the previous subject's data (incident A is never shown while B loads).
 * - `refreshKey` re-runs the request but keeps the current data visible until the new response arrives.
 * - `enabled=false` skips the request; nothing is loaded and `data` is undefined.
 * Responses from superseded requests are ignored.
 */
export function useAsync<T>(fn: () => Promise<T>, key: string, refreshKey = 0, enabled = true): AsyncState<T> {
  const [slot, setSlot] = useState<Slot<T>>({ key, data: undefined, error: null, loading: enabled, settled: 0 });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) {
      setSlot((s) => ({ key, data: undefined, error: null, loading: false, settled: s.settled }));
      return;
    }
    let stale = false;
    setSlot((s) => ({ key, data: s.key === key ? s.data : undefined, error: null, loading: true, settled: s.settled }));
    fnRef.current().then(
      (data) => {
        if (!stale) setSlot((s) => ({ key, data, error: null, loading: false, settled: s.settled + 1 }));
      },
      (e: unknown) => {
        if (!stale) setSlot((s) => ({ key, data: undefined, error: errorMessage(e), loading: false, settled: s.settled + 1 }));
      },
    );
    return () => {
      stale = true;
    };
  }, [key, refreshKey, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Until the effect has caught up with a new key, report "loading, no data" instead of the previous key's slot.
  if (slot.key !== key) return { data: undefined, error: null, loading: enabled, settled: slot.settled, reload };
  return { data: slot.data, error: slot.error, loading: slot.loading, settled: slot.settled, reload };
}
