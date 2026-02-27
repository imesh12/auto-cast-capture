// server/axisUiProxy.js
const { createProxyMiddleware } = require("http-proxy-middleware");
const { getCameraConfig } = require("./firebaseAdmin");

function basicAuthHeader(username, password) {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

const proxyCache = new Map();
const CACHE_TTL_MS = 2 * 60 * 1000;

function getReferer(req) {
  return String(req.headers.referer || req.headers.referrer || "");
}

function extractCameraIdFromReferer(req) {
  const ref = getReferer(req);
  const m = ref.match(/\/axis-ui\/([^/]+)\//);
  return m ? m[1] : null;
}

async function getOrCreateProxy(cameraId) {
  const now = Date.now();
  const cached = proxyCache.get(cameraId);
  if (cached && cached.expiresAt > now) return cached.proxy;

  const { camera } = await getCameraConfig(cameraId);
  if (!camera?.ip) throw new Error("Camera IP missing");
  if (!camera.username || !camera.password) throw new Error("Camera credentials missing");

  // ✅ your camera uses 445 (based on your working URL)
  const port = Number(camera.port || 0) || 445;

  const target = `https://${camera.ip}:${port}`;
  console.log("AXIS PROXY create:", { cameraId, target });

  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    secure: false,
    cookieDomainRewrite: "",
    onProxyReq: (proxyReq) => {
      proxyReq.setHeader("Authorization", basicAuthHeader(camera.username, camera.password));
      proxyReq.setHeader("Connection", "keep-alive");
    },
    onError: (err, _req2, res2) => {
      console.error("Axis UI proxy error:", err?.message || err);
      if (!res2.headersSent) res2.status(502).send("Axis proxy failed");
    },
    logLevel: "warn",
  });

  proxyCache.set(cameraId, { proxy, expiresAt: now + CACHE_TTL_MS });
  return proxy;
}

function mountAxisUiProxy(app) {
  // A) Main entry: /axis-ui/:cameraId/*
  app.use("/axis-ui/:cameraId", async (req, res, next) => {
    try {
      const cameraId = req.params.cameraId;
      const proxy = await getOrCreateProxy(cameraId);

      // rewrite URL to Axis root
      req.url = req.originalUrl.replace(new RegExp(`^/axis-ui/${cameraId}`), "") || "/";
      return proxy(req, res, next);
    } catch (e) {
      console.error("axis-ui error:", e?.message || e);
      return res.status(500).send("Axis UI proxy setup failed");
    }
  });

  // B) Root-path fallback, but ONLY when referer is Axis UI
  const axisRootPaths = ["/camera", "/axis-cgi", "/vapix", "/javascript", "/css", "/img", "/fonts", "/local"];

  app.use(axisRootPaths, async (req, res, next) => {
    const ref = getReferer(req);

    // ✅ CRITICAL: do NOT hijack normal app/static requests
    if (!ref.includes("/axis-ui/")) {
      return next();
    }

    try {
      const cameraId = extractCameraIdFromReferer(req);
      if (!cameraId) return res.status(400).send("Axis asset request missing cameraId");

      const proxy = await getOrCreateProxy(cameraId);
      return proxy(req, res, next);
    } catch (e) {
      console.error("axis root fallback error:", e?.message || e);
      return res.status(502).send("Axis proxy failed");
    }
  });
}

module.exports = { mountAxisUiProxy };
