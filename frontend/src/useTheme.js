import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "ai-intel-hub-theme";

/**
 * Theme preference hook.
 *
 * Supports three modes:
 *   - "system" — follows OS prefers-color-scheme (default)
 *   - "dark"   — always dark
 *   - "light"  — always light
 *
 * Returns { mode, resolved, setMode }
 *   mode     — the user preference ("system" | "dark" | "light")
 *   resolved — the actual active theme ("dark" | "light")
 *   setMode  — function to change the preference
 */
export function useTheme() {
  const [mode, setModeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "system";
    } catch {
      return "system";
    }
  });

  const getSystemTheme = useCallback(() => {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }, []);

  const resolved = mode === "system" ? getSystemTheme() : mode;

  // Apply theme to <html> element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (mode !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      document.documentElement.setAttribute("data-theme", getSystemTheme());
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode, getSystemTheme]);

  const setMode = useCallback((newMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch { /* localStorage unavailable */ }
  }, []);

  return { mode, resolved, setMode };
}
