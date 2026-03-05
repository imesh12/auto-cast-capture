// public/capture/assets/js/config.js

const CLOUD_RUN_API = "https://town-capture-api-822639495360.asia-northeast1.run.app";

const API_BASE = useMemo(() => {
  if (location.protocol === "https:" && location.hostname !== "localhost") {
    return CLOUD_RUN_API;   // ✅ production (GitHub Pages)
  }
  return "http://192.168.1.183:4450"; // ✅ local
}, []);

export function getCameraId() {
  const params = new URLSearchParams(location.search);
  return params.get("cameraId");
}

export const LIVE_UI_LIMIT_MS = 4 * 60 * 1000;