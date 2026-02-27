// assets/js/main.js
import { getApiBase, getCameraId, LIVE_UI_LIMIT_MS } from "./config.js";
import { state } from "./state.js";
import { dom } from "./dom.js";

import {
  showApp,
  setOverlaySelectionVisible,
  setOverlayVisibility,
  showModal,
  hideModal,
  showOfflineOverlay,
  hideOfflineOverlay,
  showInUseOverlay,      // ✅ add
  hideInUseOverlay,      // ✅ add
  showVideoEl,
  showPhotoEl,
  setPreparationMode,
  setPreviewMode,
  applyMiniOverlayPreview,
  applyLiveOverlayPreview,
  setModePill,
  showConfirmCancel,
  hideConfirmCancel,
} from "./ui.js";

import {
  loadOverlays,
  renderStrips,
  syncSelectedUI,
  renderLivePrepV2,
  renderOverlayModalGrid,
  openOverlayModal,
  closeOverlayModal,
} from "./overlays.js";

import {
  guardCameraOrBlock,
  resetVideo,
  stopServerLive,
  clearLiveUiTimeout,
  closeLivePage,
  openLivePage,
} from "./live.js";

import { doCapture } from "./capture.js";
import { startPayment } from "./download.js";

const API_BASE = getApiBase();
const cameraId = getCameraId();

/* ---------- small UI adapter ---------- */
const ui = {
  showModal: (el) => showModal(dom, el),
  hideModal: (el) => hideModal(dom, el),
  showOffline: (msg) => showOfflineOverlay(dom, msg),
  hideOffline: () => hideOfflineOverlay(dom),


// ✅ NEW (in use overlay)
  showInUse: (msg) => showInUseOverlay(dom, msg),
  hideInUse: () => hideInUseOverlay(dom),

  showConfirmCancel: () => showConfirmCancel(dom),
 hideConfirmCancel: () => hideConfirmCancel(dom),


  applyMiniOverlay: () => applyMiniOverlayPreview(dom, state.selected),
  applyLiveOverlay: () => applyLiveOverlayPreview(dom, state.selected),
  guard: () => guardCameraOrBlock(API_BASE, cameraId, dom, ui),
};

/* ================== PAGE SWITCHERS ================== */
function showHomePage() {
  dom.startHero.style.display = "flex";
  if (dom.modePage) dom.modePage.style.display = "none";
  if (dom.appContainer) dom.appContainer.style.display = "none";
  if (dom.livePage) dom.livePage.style.display = "none";
}

function showModePage() {
  dom.startHero.style.display = "none";
  if (dom.appContainer) dom.appContainer.style.display = "none";
  if (dom.livePage) dom.livePage.style.display = "none";
  if (dom.modePage) dom.modePage.style.display = "flex";
}

function showAppPage() {
  if (dom.modePage) dom.modePage.style.display = "none";
  if (dom.livePage) dom.livePage.style.display = "none";
  showApp(dom);
}

function showLivePage() {
  dom.startHero.style.display = "none";
  if (dom.modePage) dom.modePage.style.display = "none";
  if (dom.appContainer) dom.appContainer.style.display = "none";
  if (dom.livePage) dom.livePage.style.display = "block";
}

/* ================= INIT UI TEXT ================= */
dom.heroCameraText.textContent = `Camera: ${cameraId || "—"}`;
dom.heroNote.textContent = cameraId
  ? "「スタート」を押して開始してください。"
  : "URLに cameraId が必要です（例：?cameraId=xxxx）";
dom.badge.textContent = `Camera: ${cameraId || "—"}`;

/* ================= offline buttons ================= */
dom.offlineRetryBtn.onclick = () => location.reload();
dom.offlineCloseBtn.onclick = () => {
  ui.hideOffline();

  clearLiveUiTimeout(state);
  closeLivePage(state, dom);

  showHomePage(); // ✅ return to your HOME section
};


/* ================= in-use buttons ================= */
dom.inUseBackBtn?.addEventListener("click", () => {
  ui.hideInUse();

  // close live safely (even if not open)
  clearLiveUiTimeout(state);
  closeLivePage(state, dom);

  // go back to main window
  showHomePage();
});

dom.inUseRetryBtn?.addEventListener("click", async () => {
  ui.hideInUse();
  const blocked = await ui.guard();
  if (blocked) return;
});


/* ================= base helpers ================= */
function showMiniBlank() {
  resetVideo(state, dom.video, false);
  showVideoEl(dom);
}

async function showPreview(r) {
  setPreviewMode(dom);
  applyMiniOverlayPreview(dom, state.selected);

  const type = r.captureType || state.captureType;
  resetVideo(state, dom.video, false);

  if (type === "photo") {
    showPhotoEl(dom, r.previewUrl, (v) => resetVideo(state, v, false));
  } else {
    showVideoEl(dom);
    dom.video.src = r.previewUrl;
    dom.video.muted = false;
    dom.video.controls = false;
    try {
      await dom.video.play();
    } catch {}
  }

  dom.statusEl.textContent = "プレビュー準備完了。ダウンロードへ進んでください。";
}

function setOverlaySelectionVisibleSafe(visible) {
  setOverlaySelectionVisible(dom, visible);
}

function setPreparationModeFull() {
  // ✅ exit preview style
  dom.appContainer?.classList.remove("is-preview");
  if (dom.previewHeader) dom.previewHeader.style.display = "none";

  setPreparationMode(dom);
  dom.pageTitle.textContent = "撮影準備";
  dom.pageHint.textContent = "フレーム / ロゴを選んで「開始」へ";
  dom.cardTitle.textContent = "準備プレビュー";
  dom.prepControls.style.display = "flex";
  dom.previewControls.style.display = "none";

  dom.blurTarget.classList.add("hide-overlay");
  setOverlayVisibility(dom, false);

  setOverlaySelectionVisibleSafe(true);

  dom.statusEl.textContent = cameraId
    ? "開始ボタンを押してください。"
    : "cameraId がありません。URLを確認してください。";
}


function setPreviewModeFull() {
  // ✅ enter preview style (attachment)
  dom.appContainer?.classList.add("is-preview");
  if (dom.previewHeader) dom.previewHeader.style.display = "block";

  // ✅ update preview pills
  const frameText = state.selected?.frame ? "有" : "無";
  if (dom.previewFramePill) dom.previewFramePill.textContent = `フレーム: ${frameText}`;

  const modeText =
    state.captureType === "photo" ? "写真" : `動画（${state.durationSec}秒）`;
  if (dom.previewModePill) dom.previewModePill.textContent = `選択モード: ${modeText}`;

  setPreviewMode(dom);
  dom.blurTarget.classList.remove("hide-overlay");
  setOverlayVisibility(dom, true);
  setOverlaySelectionVisibleSafe(false);
}


/* ================= Live Overlay Picker v2 ================= */
function setActiveTab(which) {
  [dom.tabAll, dom.tabFrames, dom.tabLogos].forEach((b) =>
    b?.classList.remove("active")
  );
  if (which === "all") dom.tabAll?.classList.add("active");
  if (which === "frame") dom.tabFrames?.classList.add("active");
  if (which === "logo") dom.tabLogos?.classList.add("active");
}

function initLiveOverlayPickerV2() {
  // Some pages might not include the v2 DOM (avoid crash)
  if (!dom.overlayRailV2 || !dom.btnSeeAllOverlays || !dom.overlayModalV2) return;

  // initial rail
  renderLivePrepV2(dom, state, { filter: "all", limit: 4 });

  // open modal
  dom.btnSeeAllOverlays.onclick = () => {
    setActiveTab("all");
    renderOverlayModalGrid(dom, state, "all");
    openOverlayModal(dom);
  };

  // close modal
  dom.btnCloseOverlayModal?.addEventListener("click", () => closeOverlayModal(dom));
  dom.overlayModalBackdrop?.addEventListener("click", () => closeOverlayModal(dom));

  // tabs
  dom.tabAll?.addEventListener("click", () => {
    setActiveTab("all");
    renderOverlayModalGrid(dom, state, "all");
  });
  dom.tabFrames?.addEventListener("click", () => {
    setActiveTab("frame");
    renderOverlayModalGrid(dom, state, "frame");
  });
  dom.tabLogos?.addEventListener("click", () => {
    setActiveTab("logo");
    renderOverlayModalGrid(dom, state, "logo");
  });
}

/* ================= First Load ================= */
showHomePage();
setPreparationModeFull();
showMiniBlank();
applyMiniOverlayPreview(dom, state.selected);
applyLiveOverlayPreview(dom, state.selected);
setModePill(dom, state.captureType, state.durationSec);

if (!cameraId) {
  dom.btnUseService.disabled = true;
  dom.btnUseService.style.opacity = 0.6;
}
setOverlayVisibility(dom, false);

/* ================= START FLOW =================
   HOME "スタート" -> preload overlays -> MODE PAGE
*/
dom.btnUseService.onclick = async () => {
  if (!cameraId) {
    alert("cameraId がありません。URLに ?cameraId=xxxx を付けてください。");
    return;
  }

  const blocked = await ui.guard();
  if (blocked) return;
  ui.hideOffline();

  try {
    // preload overlays
    await loadOverlays(API_BASE, cameraId, state);

    // open mode selection
    showModePage();
  } catch (e) {
    if (String(e.message).toLowerCase().includes("offline")) {
      ui.showOffline(e.message);
      return;
    }
    alert(e.message || "Failed to load overlays");
  }
};

/* ================= overlay clear ================= */
dom.clearFrameBtn.onclick = () => {
  state.selected.frame = null;
  syncSelectedUI(dom, state);
  applyMiniOverlayPreview(dom, state.selected);
  applyLiveOverlayPreview(dom, state.selected);
};

dom.clearLogoBtn.onclick = () => {
  state.selected.logo = null;
  syncSelectedUI(dom, state);
  applyMiniOverlayPreview(dom, state.selected);
  applyLiveOverlayPreview(dom, state.selected);
};

/* ================= MODE PAGE =================
   pick mode -> open APP page + prep UI + render overlays + open live
*/
async function startChosenModeAndOpenLive() {
  // prep UI (app page)
  showAppPage();
  setPreparationModeFull();
  setModePill(dom, state.captureType, state.durationSec);

  // render overlays on app page
  renderStrips(dom, state);
  showMiniBlank();
  applyMiniOverlayPreview(dom, state.selected);
  applyLiveOverlayPreview(dom, state.selected);

  // live page
  showLivePage();

  // init v2 overlay picker (rail + modal) AFTER live page is visible
  initLiveOverlayPickerV2();

  // optional badge/mode text (depends on your live page HTML)
  if (dom.liveBadge) dom.liveBadge.textContent = `Camera: ${cameraId || "—"}`;

  // if you use the new v2 header mode text
  if (dom.modeText2) {
    dom.modeText2.textContent =
      state.captureType === "photo" ? "Photo" : `Video ${state.durationSec}s`;
  }

  // if you still keep old pill
  if (dom.modePill2) {
    dom.modePill2.textContent =
      state.captureType === "photo" ? "写真" : `動画（${state.durationSec}秒）`;
  }

  await openLive();
}

dom.btnStartPhoto.onclick = async () => {
  state.captureType = "photo";
  state.durationSec = 0;
  await startChosenModeAndOpenLive();
};

dom.btnDur3.onclick = async () => {
  state.captureType = "video";
  state.durationSec = 3;
  await startChosenModeAndOpenLive();
};

dom.btnDur15.onclick = async () => {
  state.captureType = "video";
  state.durationSec = 15;
  await startChosenModeAndOpenLive();
};

// close mode page -> back to home
dom.btnModeClose?.addEventListener("click", () => {
  showHomePage();
});

/* ================= LIVE ================= */
async function openLive() {
  await openLivePage(API_BASE, cameraId, state, dom, ui, {
    LIVE_UI_LIMIT_MS,
    onTimeout: async () => {
      alert(
        "ライブの制限時間（4分）を超えました。\nもう一度撮影する場合は、最初の画面から開始してください。"
      );
      await stopServerLive(API_BASE, cameraId, state.sessionId, "ui_timeout");

      closeLivePage(state, dom);

      // back to prep page
      showAppPage();
      setPreparationModeFull();
      showMiniBlank();
      applyMiniOverlayPreview(dom, state.selected);
      dom.statusEl.textContent =
        "タイムアウトしました。もう一度「開始」からやり直してください。";
    },
  });
}

dom.btnLiveClose.onclick = async (e) => {
  // ✅ prevent any default navigation/submit behavior
  try { e?.preventDefault?.(); } catch {}
  try { e?.stopPropagation?.(); } catch {}

  // ✅ stop timer + server stream
  clearLiveUiTimeout(state);

  try {
    await stopServerLive(API_BASE, cameraId, state.sessionId, "btn_close");
  } catch (err) {
    // best effort: even if stop fails, still navigate UI
    console.warn("stopServerLive failed:", err?.message || err);
  }

  // ✅ close live UI
  closeLivePage(state, dom);

  // ✅ go back to MODE selection page (not App prep)
  showModePage();

  // (optional) update UI text on mode page
  if (dom.heroCameraText) dom.heroCameraText.textContent = `Camera: ${cameraId || "—"}`;

  // if you want to show currently selected mode somewhere
  // (optional: only if these exist in your HTML)
  if (dom.modeText2) {
    dom.modeText2.textContent =
      state.captureType === "photo" ? "Photo" : `Video ${state.durationSec}s`;
  }
};


// best effort on tab close
window.addEventListener("beforeunload", () => {
  try {
    if (cameraId && state.sessionId) {
      navigator.sendBeacon(
        `${API_BASE}/public/stop-stream`,
        new Blob(
          [
            JSON.stringify({
              cameraId,
              sessionId: state.sessionId,
              reason: "beforeunload",
            }),
          ],
          { type: "application/json" }
        )
      );
    }
  } catch {}
});

/* ================= CAPTURE ================= */
dom.btnLiveCapture.onclick = async () => {
  try {
    dom.btnLiveCapture.disabled = true;

    await doCapture(API_BASE, state, dom, ui, async (r) => {
      closeLivePage(state, dom);

      showAppPage();
      setPreviewModeFull();
      await showPreview(r);
    });
  } catch (e) {
    ui.hideModal(dom.captureModal);
    dom.liveStatus.textContent = e.message;
  } finally {
    dom.btnLiveCapture.disabled = false;
  }
};

dom.btnModalCancel.onclick = () => {
  state.cancelCaptureFlag = true;
  ui.hideModal(dom.captureModal);
  dom.statusEl.textContent = "キャンセルしました。";
  dom.btnLiveCapture.disabled = false;
  state.cancelCaptureFlag = false;
};
dom.btnModalHide.onclick = () => ui.hideModal(dom.captureModal);

/* ================= DOWNLOAD (PAYMENT) ================= */
dom.btnDownload.onclick = async () => {
  try {
    await startPayment(API_BASE, state);
  } catch (e) {
    dom.statusEl.textContent = e.message;
  }
};

// ===== Confirm Cancel Buttons =====
dom.confirmCancelNo?.addEventListener("click", () => {
  ui.hideConfirmCancel();
});

dom.confirmCancelYes?.addEventListener("click", async () => {
  ui.hideConfirmCancel();

  // stop live safely if exists
  clearLiveUiTimeout(state);

  try {
    await stopServerLive(API_BASE, cameraId, state.sessionId, "user_cancel");
  } catch {}

  closeLivePage(state, dom);

  // ✅ reset preview UI (so next time it's clean)
  setPreparationModeFull();
  showMiniBlank();
  applyMiniOverlayPreview(dom, state.selected);

  // go HOME
  showHomePage();
});



/* ================= BACK / CANCEL (Preview) ================= */
dom.btnBackToPrep?.addEventListener(
  "click",
  (e) => {
    // ✅ hard stop (blocks form submit + parent click handlers)
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // ✅ show confirm popup
    ui.showConfirmCancel();

    return false;
  },
  true
);



