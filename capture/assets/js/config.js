export function getApiBase() {
  const host = location.hostname;

  // Local dev
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://192.168.1.183:4450"; // change if needed
  }

  // GitHub Pages / production
  return "https://town-capture-api-822639495360.asia-northeast1.run.app";
}

export function getCameraId() {
  const params = new URLSearchParams(location.search);
  return params.get("cameraId");
}

export const LIVE_UI_LIMIT_MS = 4 * 60 * 1000;