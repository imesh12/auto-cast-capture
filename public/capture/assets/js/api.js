// public/capture/assets/js/api.js

export async function fetchJsonOrEmpty(url, options = {}) {
  let r;
  try {
    r = await fetch(url, options);
  } catch (netErr) {
    return {
      r: { ok: false, status: 0, statusText: "fetch failed" },
      j: { ok: false, error: "Network error (fetch failed)" },
    };
  }

  const ct = (r.headers && r.headers.get && r.headers.get("content-type")) || "";
  let j = null;
  let text = "";

  try {
    if (ct.includes("application/json")) j = await r.json();
    else text = await r.text();
  } catch {
    // ignore parse error
  }

  if (!j && text) j = { ok: false, error: text.slice(0, 300) };
  if (!j) j = {};

  return { r, j };
}

export async function apiJson(API_BASE, path, options = {}) {
  const url = API_BASE + path;

  let r;
  try {
    r = await fetch(url, options);
  } catch (netErr) {
    const err = new Error("Network error (fetch failed)");
    err.status = 0;
    err.url = url;
    err.cause = netErr;
    throw err;
  }

  const ct = r.headers.get("content-type") || "";
  let j = {};
  let text = "";

  try {
    if (ct.includes("application/json")) j = await r.json();
    else text = await r.text();
  } catch {}

  const serverMsg =
    (j && (j.error || j.message)) ||
    (text && text.slice(0, 300)) ||
    `Request failed (${r.status})`;

  if (!r.ok || j.ok === false) {
    const err = new Error(serverMsg);
    err.status = r.status;
    err.payload = j;
    err.text = text;
    err.url = url;
    throw err;
  }

  return j;
}