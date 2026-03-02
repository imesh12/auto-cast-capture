// public/capture/assets/js/config.js

const CLOUD_RUN_API =
  "https://town-capture-api-822639495360.asia-northeast1.run.app";

export function getApiBase() {
  // production = any https site that is not localhost
  if (location.protocol === "https:" && location.hostname !== "localhost") {
    return CLOUD_RUN_API;
  }
  return "http://192.168.1.183:4450";
}

export function getCameraId() {
  const params = new URLSearchParams(location.search);
  return params.get("cameraId");
}

export const LIVE_UI_LIMIT_MS = 4 * 60 * 1000;