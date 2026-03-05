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
      // read text for better error messages (HTML/plain)
      text = await r.text();
    }
  } catch {
    // ignore parse errors
  }

  // Normalize error message
  const serverMsg =
    (j && (j.error || j.message)) ||
    (text && text.slice(0, 300)) ||
    `Request failed (${r.status})`;

  if (!r.ok || j.ok === false) {
    const err = new Error(serverMsg);
    err.status = r.status;     // ✅ IMPORTANT
    err.payload = j;           // json payload if any
    err.text = text;           // raw text if any
    err.url = url;             // ✅ helps debugging
    throw err;
  }

  return j;
}