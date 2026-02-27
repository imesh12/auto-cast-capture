export async function apiJson(API_BASE, path, options = {}) {
  const r = await fetch(API_BASE + path, options);
  const ct = r.headers.get("content-type") || "";
  const j = ct.includes("application/json") ? await r.json() : {};

  if (!r.ok || j.ok === false) {
    const err = new Error(j.error || `Request failed (${r.status})`);
    err.status = r.status;   // ✅ IMPORTANT
    err.payload = j;         // optional (debug)
    throw err;
  }
  return j;
}


// used for "guard" so you can read error cleanly
export async function fetchJsonOrEmpty(url, options = {}) {
  const r = await fetch(url, options);
  const ct = r.headers.get("content-type") || "";
  const j = ct.includes("application/json") ? await r.json() : {};
  return { r, j };
}
