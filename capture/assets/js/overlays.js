import { apiJson } from "./api.js";
import { applyMiniOverlayPreview, applyLiveOverlayPreview } from "./ui.js";

export async function loadOverlays(API_BASE, cameraId, state) {
  state.overlays = await apiJson(API_BASE, `/public/overlays?cameraId=${encodeURIComponent(cameraId)}`);
}

export function renderStrips(dom, state) {
  dom.framesEl.innerHTML = "";
  dom.logosEl.innerHTML = "";

  state.overlays.forEach((o) => {
    const card = document.createElement("div");
    card.className = "item";
    card.innerHTML = `
      <div class="thumb"><img src="${o.previewUrl}" alt="${o.fileName}" loading="lazy"/></div>
      <div class="name">${o.fileName}</div>
      <div class="price">
        <span>${o.isPaid ? "¥" + o.price : "FREE"}</span>
        <span class="tag ${o.isPaid ? "paid" : "free"}">${o.isPaid ? "PAID" : "FREE"}</span>
      </div>
    `;

    card.onclick = () => selectOverlay(dom, state, o, card);

    if (o.type === "frame") dom.framesEl.appendChild(card);
    if (o.type === "logo") dom.logosEl.appendChild(card);
  });

  syncSelectedUI(dom, state);
}

export function syncSelectedUI(dom, state) {
  [...dom.framesEl.children].forEach((c) => c.classList.remove("selected"));
  [...dom.logosEl.children].forEach((c) => c.classList.remove("selected"));

  if (state.selected.frame) {
    [...dom.framesEl.children].forEach((c) => {
      const name = c.querySelector(".name")?.textContent;
      if (name === state.selected.frame.fileName) c.classList.add("selected");
    });
  }
  if (state.selected.logo) {
    [...dom.logosEl.children].forEach((c) => {
      const name = c.querySelector(".name")?.textContent;
      if (name === state.selected.logo.fileName) c.classList.add("selected");
    });
  }
}

export function selectOverlay(dom, state, item, card) {
  const type = item.type;
  state.selected[type] = (state.selected[type]?.id === item.id) ? null : item;

  const list = (type === "frame" ? dom.framesEl.children : dom.logosEl.children);
  [...list].forEach((c) => c.classList.remove("selected"));
  if (state.selected[type]) card.classList.add("selected");

  applyMiniOverlayPreview(dom, state.selected);
  applyLiveOverlayPreview(dom, state.selected);
}

// ============================
// Live Prep v2 UI (rail + modal)
// ============================

function badgeHtml(o){
  if (!o.isPaid || Number(o.price || 0) <= 0) return `<span class="ovBadgeV2 free">free</span>`;
  return `<span class="ovBadgeV2">¥${o.price}</span>`;
}

function itemHtml(o, selected){
  return `
    <div class="ovItemV2 ${selected ? "selected" : ""}" data-id="${o.id}">
      ${badgeHtml(o)}
      <div class="ovThumbV2">
        <img src="${o.previewUrl}" alt="${o.fileName}" loading="lazy"/>
      </div>
    </div>
  `;
}

function updateOverlayName(dom, state){
  const f = state.selected.frame?.fileName;
  const l = state.selected.logo?.fileName;
  const name = (!f && !l) ? "none" : [f, l].filter(Boolean).join(" + ");

  if (dom.liveOverlayName) dom.liveOverlayName.textContent = name;
  if (dom.liveOverlayPill) dom.liveOverlayPill.innerHTML = `Overlay: <b>${name}</b>`;
}

export function renderLivePrepV2(dom, state, { filter = "all", limit = 4 } = {}) {
  if (!dom.overlayRailV2) return;

  const list = state.overlays.filter(o => (filter === "all" ? true : o.type === filter));
  const show = list.slice(0, limit);

  dom.overlayRailV2.innerHTML = show.map(o => {
    const selected =
      (o.type === "frame" && state.selected.frame?.id === o.id) ||
      (o.type === "logo" && state.selected.logo?.id === o.id);
    return itemHtml(o, selected);
  }).join("");

  dom.overlayRailV2.querySelectorAll(".ovItemV2").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.id;
      const item = state.overlays.find(x => x.id === id);
      if (!item) return;

      // ✅ reuse existing selection logic
      selectOverlay(dom, state, item, el);

      updateOverlayName(dom, state);
      renderLivePrepV2(dom, state, { filter, limit }); // refresh selected UI
    };
  });

  updateOverlayName(dom, state);
}

export function renderOverlayModalGrid(dom, state, filter = "all") {
  if (!dom.overlayGridV2) return;

  const list = state.overlays.filter(o => (filter === "all" ? true : o.type === filter));

  dom.overlayGridV2.innerHTML = list.map(o => {
    const selected =
      (o.type === "frame" && state.selected.frame?.id === o.id) ||
      (o.type === "logo" && state.selected.logo?.id === o.id);
    return itemHtml(o, selected);
  }).join("");

  dom.overlayGridV2.querySelectorAll(".ovItemV2").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.id;
      const item = state.overlays.find(x => x.id === id);
      if (!item) return;

      selectOverlay(dom, state, item, el);

      updateOverlayName(dom, state);
      closeOverlayModal(dom);
      renderLivePrepV2(dom, state, { filter: "all", limit: 4 });
    };
  });

  updateOverlayName(dom, state);
}

export function openOverlayModal(dom){
  dom.overlayModalV2?.classList.remove("hidden");
  dom.overlayModalV2?.setAttribute("aria-hidden", "false");
}
export function closeOverlayModal(dom){
  dom.overlayModalV2?.classList.add("hidden");
  dom.overlayModalV2?.setAttribute("aria-hidden", "true");
}

