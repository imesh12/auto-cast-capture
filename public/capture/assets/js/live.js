// live.js (PAGE VERSION - NO MODAL)
import { apiJson, fetchJsonOrEmpty } from "./api.js";

alert("LIVE.JS LOADED 2026-03-06");

export async function guardCameraOrBlock(API_BASE, cameraId, dom, ui) {
  if (!cameraId) return false;

  try {
    const { r, j } = await fetchJsonOrEmpty(
      `${API_BASE}/public/overlays?cameraId=${encodeURIComponent(cameraId)}`,
      { cache: "no-store" }
    );

    if (r.status === 409 || r.status === 423) {
      ui.hideOffline?.();
      ui.showInUse?.("Camera is currently in use");
      return true;
    }

    if (!r.ok || j.ok === false) {
      const msg = j && j.error ? String(j.error) : "Camera not available";
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

  try {
    videoEl.pause();
  } catch {}

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
  const pills = [dom.livePill, dom.livePill2].filter(Boolean);

  pills.forEach((pill) => {
    pill.classList.remove("live", "off");
    pill.classList.add(isLive ? "live" : "off");
    pill.textContent = isLive ? "LIVE" : "OFF";
  });
}

export function closeLivePage(state, dom) {
  try {
    resetVideo(state, dom.liveVideo, true);
  } catch {}

  clearLiveUiTimeout(state);

  if (dom.liveStatus) dom.liveStatus.textContent = "準備中…";
  setPillLive(dom, false);
}

export async function openLivePage(API_BASE, cameraId, state, dom, ui, { LIVE_UI_LIMIT_MS, onTimeout }) {
  try {
    const blocked = await ui.guard();
    if (blocked) return;

    clearLiveUiTimeout(state);

    if (dom.liveStatus) dom.liveStatus.textContent = "セッション作成中…";
    if (dom.btnLiveCapture) dom.btnLiveCapture.disabled = true;

    const s = await apiJson(
      API_BASE,
      `/public/session?cameraId=${encodeURIComponent(cameraId)}`,
      { method: "POST" }
    );
    state.sessionId = s.sessionId;

    if (dom.liveStatus) dom.liveStatus.textContent = "ライブ開始中…";

    async function startStreamWithRetry() {
      const tries = 8;
      const waitMs = 1500;

      for (let i = 0; i < tries; i++) {
        try {
          const h = await apiJson(
            API_BASE,
            `/public/start-stream?cameraId=${encodeURIComponent(cameraId)}&sessionId=${encodeURIComponent(state.sessionId)}`
          );
          return h;
        } catch (e) {
          if (e?.status === 409 || e?.status === 423) throw e;

          const msg = String(e?.message || "").toLowerCase();
          const isNotReady =
            msg.includes("not ready") ||
            msg.includes("retry") ||
            e?.status === 503;

          if (!isNotReady || i === tries - 1) throw e;

          if (dom.liveStatus) {
            dom.liveStatus.textContent = `ライブ準備中… 再試行 (${i + 1}/${tries})`;
          }

          await new Promise((r) => setTimeout(r, waitMs));
        }
      }

      throw new Error("Live stream not ready. Please retry.");
    }

    const h = await startStreamWithRetry();
    alert("START STREAM JSON:\n" + JSON.stringify(h, null, 2));

    resetVideo(state, dom.liveVideo, true);

    const hlsUrl =
      typeof h?.hlsUrl === "string" && h.hlsUrl.trim()
        ? h.hlsUrl.trim()
        : (typeof h?.hlsPath === "string" && h.hlsPath.trim()
            ? `${API_BASE}${h.hlsPath}`
            : "");

    alert("Resolved HLS URL:\n" + hlsUrl);

    if (!hlsUrl) {
      throw new Error("HLS URL missing");
    }

    if (dom.liveVideo?.canPlayType?.("application/vnd.apple.mpegurl")) {
      dom.liveVideo.src = hlsUrl;
      try {
        await dom.liveVideo.play();
      } catch {}
    } else if (window.Hls && window.Hls.isSupported()) {
      state.liveHls = new window.Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        backBufferLength: 10,
        maxLiveSyncPlaybackRate: 1.5,
        startPosition: -1,
      });

      state.liveHls.loadSource(hlsUrl);
      state.liveHls.attachMedia(dom.liveVideo);

      state.liveHls.on(window.Hls.Events.MANIFEST_PARSED, async () => {
        try {
          await dom.liveVideo.play();
        } catch (e) {
          console.warn("liveVideo.play() failed:", e);
        }
      });

      state.liveHls.on(window.Hls.Events.ERROR, (evt, data) => {
        console.warn("HLS error:", data);
      });
    } else {
      dom.liveVideo.src = hlsUrl;
      try {
        await dom.liveVideo.play();
      } catch {}
    }

    setPillLive(dom, true);
    ui.applyLiveOverlay?.();

    startLiveUiTimeout(LIVE_UI_LIMIT_MS, state, onTimeout);

    if (dom.btnLiveCapture) dom.btnLiveCapture.disabled = false;
    if (dom.liveStatus) dom.liveStatus.textContent = "準備完了。「撮影」を押してください。";
  } catch (e) {
    clearLiveUiTimeout(state);

    if (e?.status === 409 || e?.status === 423) {
      ui.hideOffline?.();
      ui.showInUse?.("Camera is currently in use");
      if (dom.btnLiveCapture) dom.btnLiveCapture.disabled = false;
      return;
    }

    if (String(e?.message || "").toLowerCase().includes("offline")) {
      ui.hideInUse?.();
      ui.showOffline(e.message);
      return;
    }

    if (dom.liveStatus) dom.liveStatus.textContent = e?.message || "ライブ開始に失敗しました";
    if (dom.btnLiveCapture) dom.btnLiveCapture.disabled = false;
  }
}