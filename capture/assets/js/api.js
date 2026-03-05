// public/capture/assets/js/api.js

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
    if (ct.includes("application/json")) {
      j = await r.json();
    } else {
      text = await r.text();
    }
  } catch {
    // ignore parse errors
  }

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

/**
 * ✅ Needed by live.js
 * Returns BOTH:
 *  - r: Response
 *  - j: parsed json (or { ok:false, error:text } for non-json, or {} if empty)
 */
export async function fetchJsonOrEmpty(url, options = {}) {
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
    if (ct.includes("application/json")) {
      j = await r.json();
    } else {
      text = await r.text();
      // if server returned text/html, keep something usable
      j = text ? { ok: false, error: text.slice(0, 300) } : {};
    }
  } catch {
    // body could be empty (204), keep {}
    j = {};
  }

  return { r, j };
}