// assets/js/config.js

export const LIVE_UI_LIMIT_MS = 4 * 60 * 1000; // 4 minutes

// cameraId from URL query (?cameraId=xxx)
export function getCameraId() {
  const sp = new URLSearchParams(window.location.search);
  return (sp.get("cameraId") || "").trim();
}

/**
 * API base resolution (DEV + PROD safe)
 *
 * Priority:
 * 1) window.API_BASE_URL  (set in HTML for prod)
 * 2) localhost / LAN => location.origin (ex: http://192.168.x.x:4450)
 * 3) otherwise => Cloud Run URL
 */
export function getApiBase() {
  // 1) explicit override (recommended for GitHub Pages)
  const w = window.API_BASE_URL;
  if (typeof w === "string" && w.trim()) return stripSlash(w.trim());

  const host = window.location.hostname || "";

  // 2) local dev / LAN dev
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("192.168.");

  if (isLocal) return stripSlash(window.location.origin);

  // 3) production default (Cloud Run)
  return "https://town-capture-api-822639495360.asia-northeast1.run.app";
}

function stripSlash(s) {
  return s.replace(/\/$/, "");
}