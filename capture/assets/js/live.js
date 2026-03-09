// live.js (PAGE VERSION - NO MODAL)
import { apiJson, fetchJsonOrEmpty } from "./api.js";

// alert("LIVE.JS LOADED 2026-03-09");

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
    if (h) {
      try {
        h.stopLoad?.();
      } catch {}
      try {
        h.detachMedia?.();
      } catch {}
      try {
        h.destroy();
      } catch {}
    }
  } catch (e) {
    console.warn("resetVideo destroy failed:", e);
  }

  if (isLive) state.liveHls = null;
  else state.hls = null;

  try {
    videoEl.pause();
  } catch {}

  try {
    videoEl.removeAttribute("src");
    videoEl.src = "";
    videoEl.load();
  } catch {}
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

    resetVideo(state, dom.liveVideo, true);

    const hlsUrl =
      typeof h?.hlsUrl === "string" && h.hlsUrl.trim()
        ? h.hlsUrl.trim()
        : typeof h?.hlsPath === "string" && h.hlsPath.trim()
          ? `${API_BASE}${h.hlsPath}`
          : "";

    if (!hlsUrl) {
      throw new Error("HLS URL missing");
    }

    const playbackUrl = `${hlsUrl}${hlsUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
    console.log("Resolved HLS URL:", playbackUrl);

    const canUseNativeHls = !!dom.liveVideo?.canPlayType?.("application/vnd.apple.mpegurl");
    const canUseHlsJs = !!(window.Hls && window.Hls.isSupported && window.Hls.isSupported());

    console.log("Native HLS support:", canUseNativeHls);
    console.log("window.Hls exists:", !!window.Hls);
    console.log("Hls.js supported:", canUseHlsJs);

    if (canUseNativeHls) {
      dom.liveVideo.src = playbackUrl;
      try {
        await dom.liveVideo.play();
      } catch (e) {
        console.warn("native HLS play failed:", e);
      }
    } else if (canUseHlsJs) {
      state.liveHls = new window.Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        backBufferLength: 10,
        maxLiveSyncPlaybackRate: 1.5,
        startPosition: -1,
      });

      state.liveHls.loadSource(playbackUrl);
      state.liveHls.attachMedia(dom.liveVideo);

      state.liveHls.on(window.Hls.Events.MANIFEST_PARSED, async () => {
        try {
          await dom.liveVideo.play();
        } catch (e) {
          console.warn("liveVideo.play() failed:", e);
        }
      });

      state.liveHls.on(window.Hls.Events.LEVEL_LOADED, (_, data) => {
        console.log("HLS level loaded:", data);
      });

      state.liveHls.on(window.Hls.Events.ERROR, (evt, data) => {
        console.warn("HLS error:", data);

        if (data?.fatal) {
          switch (data.type) {
            case window.Hls.ErrorTypes.NETWORK_ERROR:
              console.warn("Fatal HLS network error, trying startLoad()");
              try {
                state.liveHls.startLoad();
              } catch (e) {
                console.warn("startLoad failed:", e);
              }
              break;

            case window.Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("Fatal HLS media error, trying recoverMediaError()");
              try {
                state.liveHls.recoverMediaError();
              } catch (e) {
                console.warn("recoverMediaError failed:", e);
              }
              break;

            default:
              console.warn("Fatal HLS unrecoverable error, destroying instance");
              try {
                state.liveHls.destroy();
              } catch {}
              state.liveHls = null;
              if (dom.liveStatus) {
                dom.liveStatus.textContent = "ライブ再生エラーが発生しました。再試行してください。";
              }
              break;
          }
        }
      });
    } else {
      throw new Error("HLS.js is not loaded. Please include hls.min.js in index.html.");
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

    console.warn("openLivePage failed:", e);
    if (dom.liveStatus) dom.liveStatus.textContent = e?.message || "ライブ開始に失敗しました";
    if (dom.btnLiveCapture) dom.btnLiveCapture.disabled = false;
  }
}