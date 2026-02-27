export const state = {
  // hls instances
  hls: null,
  liveHls: null,

  // server session
  sessionId: null,

  // overlays
  overlays: [],
  selected: { frame: null, logo: null },

  // capture control
  cancelCaptureFlag: false,

  // capture settings
  captureType: "video", // "photo" | "video"
  durationSec: 3,       // 3 | 15 (video only)

  // timers
  liveUiTimer: null,
};
