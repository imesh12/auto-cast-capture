export function getApiBase() {
  return location.hostname === "localhost"
    ? "http://192.168.1.183:4450"
    : `http://${location.hostname}:4450`;
}

export function getCameraId() {
  const params = new URLSearchParams(location.search);
  return params.get("cameraId");
}

export const LIVE_UI_LIMIT_MS = 4 * 60 * 1000;
