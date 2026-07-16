"use client";

import { useEffect } from "react";

// Access tokens live 15 minutes. Middleware silently renews on page
// navigation, but a page the user just sits on (the docs editor autosaving
// in the background, for instance) never triggers a new navigation — this
// covers that case with its own periodic refresh, comfortably inside the
// 15-minute window.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function SessionKeepAlive() {
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}
