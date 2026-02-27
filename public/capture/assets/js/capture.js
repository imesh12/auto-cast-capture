import { apiJson } from "./api.js";
import { sleep, beep } from "./utils.js";

export async function doCapture(API_BASE, state, dom, ui, showPreviewFn) {
  if (!state.sessionId) throw new Error("sessionId がありません。もう一度開始してください。");

  state.cancelCaptureFlag = false;
  dom.btnLiveCapture.disabled = true;

  dom.processingBox.classList.remove("show");
  dom.countdownNum.style.display = "block";
  dom.btnModalCancel.style.display = "block";
  dom.btnModalHide.style.display = "none";
  dom.procTick.textContent = "0s";

  const est = state.captureType === "photo" ? 6 : (state.durationSec === 15 ? 16 : 10);
  dom.procHint.textContent = `目安: ~${est}s`;
  dom.processingText.textContent = state.captureType === "photo" ? "写真を処理中…" : "動画を処理中…";

  dom.captureTitle.textContent =
    state.captureType === "photo"
      ? "写真撮影中…"
      : `動画撮影中…（${state.durationSec}秒）`;

  ui.showModal(dom.captureModal);

  const countFrom = 5;
  for (let i = countFrom; i >= 1; i--) {
    if (state.cancelCaptureFlag) return;
    dom.countdownNum.textContent = String(i);
    beep(i === 1 ? 1100 : 880, 120);
    await sleep(1000);
  }
  if (state.cancelCaptureFlag) return;

  dom.countdownNum.style.display = "none";
  dom.processingBox.classList.add("show");

  let t = 0;
  const tick = setInterval(() => {
    t++;
    dom.procTick.textContent = `${t}s`;
  }, 1000);

  const r = await apiJson(API_BASE, `/public/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: state.sessionId,
      captureType: state.captureType,
      durationSec: state.captureType === "video" ? state.durationSec : 0,
      frameId: state.selected.frame?.id || null,
      logoId: state.selected.logo?.id || null,
    }),
  });

  clearInterval(tick);
  ui.hideModal(dom.captureModal);

  await showPreviewFn(r);
}
