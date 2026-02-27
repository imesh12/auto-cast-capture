// live.js (PAGE VERSION - NO MODAL)
import { apiJson, fetchJsonOrEmpty } from "./api.js";

export async function guardCameraOrBlock(API_BASE, cameraId, dom, ui) {
  if (!cameraId) return false;
  try {
    const { r, j } = await fetchJsonOrEmpty(
      `${API_BASE}/public/overlays?cameraId=${encodeURIComponent(cameraId)}`,
      { cache: "no-store" }
    );

    // ✅ IN USE (if your backend ever returns it here)
    if (r.status === 409 || r.status === 423) {
      ui.hideOffline?.();
      ui.showInUse?.("Camera is currently in use");
      return true;
    }

    if (!r.ok || j.ok === false) {
      const msg = (j && j.error) ? String(j.error) : "Camera not available";
      ui.hideInUse?.();
      ui.showOffline(msg);
      return true;
    }

    ui.hideInUse?.();
    ui.hideOffline?.();
    return false;
  } catch {
    ui.hideInUse?.();
    ui.showOffline("ネットワークエラーです。接続を確認して再試行してください。");
    return true;
  }
}


export function resetVideo(state, videoEl, isLive = false) {
  try {
    const h = isLive ? state.liveHls : state.hls;
    if (h) h.destroy();
  } catch {}

  if (isLive) state.liveHls = null;
  else state.hls = null;

  try { videoEl.pause(); } catch {}
  videoEl.removeAttribute("src");
  videoEl.load();
}

export async function stopServerLive(API_BASE, cameraId, sessionId, reason = "user_close") {
  try {
    if (!cameraId) return;
    await fetch(`${API_BASE}/public/stop-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraId, sessionId, reason }),
    });
  } catch (e) {
    console.warn("stopServerLive failed:", e?.message || e);
  }
}

export function clearLiveUiTimeout(state) {
  if (state.liveUiTimer) {
    clearTimeout(state.liveUiTimer);
    state.liveUiTimer = null;
  }
}

function startLiveUiTimeout(limitMs, state, onTimeout) {
  clearLiveUiTimeout(state);
  state.liveUiTimer = setTimeout(onTimeout, limitMs);
}

function setPillLive(dom, isLive) {
  // support both old id (#livePill) and new one (#livePill2) if you added it
  const pills = [dom.livePill, dom.livePill2].filter(Boolean);

  pills.forEach((pill) => {
    pill.classList.remove("live", "off");
    pill.classList.add(isLive ? "live" : "off");
    pill.textContent = isLive ? "LIVE" : "OFF";
  });
}

export function closeLivePage(state, dom) {
  try { resetVideo(state, dom.liveVideo, true); } catch {}
  clearLiveUiTimeout(state);

  if (dom.liveStatus) dom.liveStatus.textContent = "準備中…";
  setPillLive(dom, false);
}

/**
 * Start live stream into dom.liveVideo (NO MODAL)
 */
export async function openLivePage(API_BASE, cameraId, state, dom, ui, { LIVE_UI_LIMIT_MS, onTimeout }) {
  try {
    const blocked = await ui.guard();
    if (blocked) return;

    clearLiveUiTimeout(state);

    if (dom.liveStatus) dom.liveStatus.textContent = "セッション作成中…";
    if (dom.btnLiveCapture) dom.btnLiveCapture.disabled = true;

    // 1) create session
    const s = await apiJson(
      API_BASE,
      `/public/session?cameraId=${encodeURIComponent(cameraId)}`,
      { method: "POST" }
    );
    state.sessionId = s.sessionId;

    // 2) start stream
    if (dom.liveStatus) dom.liveStatus.textContent = "ライブ開始中…";
    const h = await apiJson(
      API_BASE,
      `/public/start-stream?cameraId=${encodeURIComponent(cameraId)}&sessionId=${encodeURIComponent(state.sessionId)}`
    );

    // 3) attach HLS
    resetVideo(state, dom.liveVideo, true);

    const hlsUrl = API_BASE + h.hlsPath;

    if (window.Hls && window.Hls.isSupported()) {
      state.liveHls = new window.Hls({ lowLatencyMode: true });
      state.liveHls.loadSource(hlsUrl);
      state.liveHls.attachMedia(dom.liveVideo);
    } else {
      dom.liveVideo.src = hlsUrl;
    }

    setPillLive(dom, true);

    // overlays
    ui.applyLiveOverlay?.();

    // timeout
    startLiveUiTimeout(LIVE_UI_LIMIT_MS, state, onTimeout);

    if (dom.btnLiveCapture) dom.btnLiveCapture.disabled = false;
    if (dom.liveStatus) dom.liveStatus.textContent = "準備完了。「撮影」を押してください。";
    } catch (e) {
    clearLiveUiTimeout(state);

    // ✅ CAMERA IN USE (409 Conflict) — your real error
    if (e?.status === 409) {
      ui.hideOffline?.();
      ui.showInUse?.("Camera is currently in use");
      if (dom.btnLiveCapture) dom.btnLiveCapture.disabled = false;
      return;
    }

    // offline
    if (String(e.message).toLowerCase().includes("offline")) {
      ui.hideInUse?.();
      ui.showOffline(e.message);
      return;
    }

    if (dom.liveStatus) dom.liveStatus.textContent = e.message || "ライブ開始に失敗しました";
    if (dom.btnLiveCapture) dom.btnLiveCapture.disabled = false;
  }

}
