import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "deja-theme";

/** Only an explicit choice is stored; otherwise the OS preference decides (dark if unknown). Storage may be blocked. */
function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

const current = (): Theme => {
  const attr = document.documentElement.dataset.theme;
  return attr === "light" || attr === "dark" ? attr : (readStored() ?? systemTheme());
};

/**
 * The inline script in index.html sets data-theme before first paint (no flash); this hook only reads that attribute,
 * lets the user toggle it, and follows OS changes until the user has made an explicit choice.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(current);

  const apply = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t;
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* the choice still applies for this session */
    }
    apply(next);
  }, [apply]);

  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia("(prefers-color-scheme: light)");
    } catch {
      return;
    }
    const onChange = () => {
      if (!readStored()) apply(systemTheme());
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [apply]);

  return { theme, toggle };
}
