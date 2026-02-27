import { logoPosClass } from "./utils.js";

export function showApp(dom) {
  dom.startHero.style.display = "none";
  dom.appContainer.style.display = "block";
}

export function setOverlaySelectionVisible(dom, visible) {
  dom.frameSection.style.display = visible ? "block" : "none";
  dom.logoSection.style.display = visible ? "block" : "none";
}

export function setOverlayVisibility(dom, showIt) {
  if (dom.previewOverlay) dom.previewOverlay.style.display = showIt ? "block" : "none";
  if (dom.liveOverlay) dom.liveOverlay.style.display = "block";
 // live overlay always visible
}


export function showModal(dom, el) {
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");
  dom.blurTarget.classList.add("blurred");
}

export function hideModal(dom, el) {
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
  dom.blurTarget.classList.remove("blurred");
}

export function showOfflineOverlay(dom, message) {
  dom.offlineTitle.textContent = "カメラがオフラインです";
  dom.offlineMsg.textContent =
    message || "現在このカメラは利用できません。しばらくしてから再度お試しください。";
  dom.offlineOverlay.style.display = "flex";
  dom.offlineOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("tc-blocked");
}

export function hideOfflineOverlay(dom) {
  dom.offlineOverlay.style.display = "none";
  dom.offlineOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tc-blocked");
}

export function showInUseOverlay(dom, message) {
  if (!dom.inUseOverlay) return;

  if (dom.inUseHint) dom.inUseHint.textContent = message || "";

  dom.inUseOverlay.style.display = "flex";
  dom.inUseOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("tc-blocked");
}

export function hideInUseOverlay(dom) {
  if (!dom.inUseOverlay) return;

  dom.inUseOverlay.style.display = "none";
  dom.inUseOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tc-blocked");

  if (dom.inUseHint) dom.inUseHint.textContent = "";
}



export function showVideoEl(dom) {
  dom.photoPreview.style.display = "none";
  dom.video.style.display = "block";
}

export function showPhotoEl(dom, url, resetVideoFn) {
  resetVideoFn(dom.video);
  dom.video.style.display = "none";
  dom.photoPreview.style.display = "block";
  dom.photoPreview.src = url;
}

export function setPreparationMode(dom) {
  dom.pageTitle.textContent = "撮影準備";
  dom.pageHint.textContent = "フレーム / ロゴを選んで「開始」へ";
  dom.cardTitle.textContent = "準備プレビュー";
  dom.prepControls.style.display = "flex";
  dom.previewControls.style.display = "none";

  dom.blurTarget.classList.add("hide-overlay");
  dom.statusEl.textContent = "開始ボタンを押してください。";
}

export function setPreviewMode(dom) {
  dom.pageTitle.textContent = "撮影プレビュー";
  dom.pageHint.textContent = "内容を確認して、ダウンロードへ進んでください。";
  dom.cardTitle.textContent = "撮影プレビュー";
  dom.prepControls.style.display = "none";
  dom.previewControls.style.display = "flex";

  dom.blurTarget.classList.remove("hide-overlay");
}

export function applyMiniOverlayPreview(dom, selected) {
  if (selected.frame?.previewUrl) {
    dom.framePreview.src = selected.frame.previewUrl;
    requestAnimationFrame(() => dom.framePreview.classList.add("show"));
  } else {
    dom.framePreview.classList.remove("show");
    dom.framePreview.removeAttribute("src");
  }

  if (selected.logo?.previewUrl) {
    dom.logoPreview.src = selected.logo.previewUrl;
    dom.logoPreview.className =
      "preview-logo show " + logoPosClass(selected.logo.position || "top-left");
  } else {
    dom.logoPreview.classList.remove("show");
    dom.logoPreview.removeAttribute("src");
  }

  const f = selected.frame ? "Frame" : "";
  const l = selected.logo ? "Logo" : "";
  const t = (f && l) ? "Frame + Logo" : (f || l || "None");

  // ✅ update ALL pills safely
  dom.overlayPill && (dom.overlayPill.textContent = `Overlay: ${t}`);
  dom.overlayPill2 && (dom.overlayPill2.textContent = `Overlay: ${t}`);
  dom.liveOverlayPill && (dom.liveOverlayPill.textContent = `Overlay: ${t}`);
}


export function applyLiveOverlayPreview(dom, selected) {
  /* ========= FRAME ========= */
  if (selected.frame?.previewUrl) {
    dom.liveFrame.src = selected.frame.previewUrl;

    // keep CSS class
    dom.liveFrame.classList.add("show");
  } else {
    dom.liveFrame.classList.remove("show");
    dom.liveFrame.removeAttribute("src");
  }

  /* ========= LOGO ========= */
  if (selected.logo?.previewUrl) {
    dom.liveLogo.src = selected.logo.previewUrl;

    // IMPORTANT: keep preview-logo class
    dom.liveLogo.className =
      "preview-logo show " +
      (selected.logo.position
        ? `pos-${selected.logo.position}`
        : "pos-top-left");
  } else {
    dom.liveLogo.classList.remove("show");
    dom.liveLogo.removeAttribute("src");
  }
}

export function setModePill(dom, captureType, durationSec) {
  const priceText =
    captureType === "photo" ? "¥100" : (durationSec === 15 ? "¥500" : "¥300");
  dom.modePill.textContent =
    captureType === "photo"
      ? `写真 (${priceText})`
      : `動画 ${durationSec}秒 (${priceText})`;

}


export function showConfirmCancel(dom) {
  if (!dom.confirmCancelOverlay) return;

  dom.confirmCancelOverlay.style.display = "flex";
  dom.confirmCancelOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("tc-noscroll");
}

export function hideConfirmCancel(dom) {
  if (!dom.confirmCancelOverlay) return;

  dom.confirmCancelOverlay.style.display = "none";
  dom.confirmCancelOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tc-noscroll");
}
