"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const KEY = "tastespec-theme";

/** Runs before paint (inlined in <head>) so a saved theme never flashes. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function apply(t: Theme) {
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {}
}

/** Paper by day, "after hours" by night. Cycles system → light → dark. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a per-browser preference after hydration
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);
  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const label = theme === "system" ? "Theme: follows your system" : theme === "light" ? "Theme: paper (light)" : "Theme: after hours (dark)";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`${label}. Click to change.`}
      title={label}
      onClick={() => {
        const t = next[theme];
        setTheme(t);
        apply(t);
      }}
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      ) : theme === "light" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
      )}
    </button>
  );
}
