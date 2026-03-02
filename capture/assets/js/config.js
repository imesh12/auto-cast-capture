// public/capture/assets/js/config.js

const CLOUD_RUN_API = "https://town-capture-api-822639495360.asia-northeast1.run.app";

export function getApiBase() {
  // Local dev (when you open capture page from your server or localhost)
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return "http://192.168.1.183:4450"; // your local API server
  }

  // GitHub Pages / any HTTPS site → MUST use HTTPS API
  return CLOUD_RUN_API;
}

export function getCameraId() {
  const params = new URLSearchParams(location.search);
  return params.get("cameraId");
}

export const LIVE_UI_LIMIT_MS = 4 * 60 * 1000;