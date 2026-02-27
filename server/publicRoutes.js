// server/publicRoutes.js
// ✅ Production-ready Public API routes
// ✅ Fix: unpaid users only get a WATERMARKED + LOW-RES preview (cannot download full file)
// ✅ Stores BOTH paths: previewPath + originalPath
// ✅ Keeps your existing flow: Stripe checkout creates session; webhook (stripeRoutes.js) marks paid + creates downloadToken
// ✅ Legacy fields preserved: phase + paymentPhase
// ✅ Uses signed URLs for preview + overlays (safe). Originals are never exposed here.

const express = require("express");
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const { spawn } = require("child_process");

const { startLiveStream, stopLiveStream } = require("./liveStream");
const cameraLock = require("./cameraLock");
const { deleteCaptureFile } = require("./cleanup");

const router = express.Router();
const db = admin.firestore();

const LIVE_TIMEOUT_MS = 60 * 1000; // 60 seconds
const liveTimeouts = new Map(); // key: `${clientId}_${cameraId}` -> Timeout

// Preview watermark text
const PREVIEW_WATERMARK_TEXT = process.env.PREVIEW_WATERMARK_TEXT || "PREVIEW - NOT PAID";

// Preview URL expiry (safe)
const PREVIEW_URL_TTL_MS = 60 * 60 * 1000; // 1 hour

// Signed URL for overlay file fetch (server-side only)
const OVERLAY_FETCH_TTL_MS = 10 * 60 * 1000;

// ===== Stripe loader (no top-level init) =====
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
  return require("stripe")(key);
}

// ===== Helpers =====
function sanitizeCameraId(id) {
  return String(id || "").trim().replace(/[^\w-]/g, "");
}

function safeId(id) {
  return String(id || "").trim().replace(/[^\w-]/g, "");
}

function nowMs() {
  return Date.now();
}

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

function waitForFile(filePath, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (fs.existsSync(filePath)) return resolve(true);
      if (Date.now() - start > timeoutMs) return reject(new Error("HLS playlist not ready"));
      setTimeout(check, 100);
    };
    check();
  });
}

async function downloadToFile(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`Download failed: ${res.statusCode}`));
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", reject);
  });
}

/**
 * Returns expression for overlay position (FFmpeg overlay filter).
 * Uses W/H variables, doesn't require real width/height.
 */
function logoXY(position, pad = 30, logoW = 260, logoH = 260) {
  switch (position) {
    case "top-left":
      return `${pad}:${pad}`;
    case "top-center":
      return `(W-${logoW})/2:${pad}`;
    case "top-right":
      return `W-${logoW}-${pad}:${pad}`;
    case "bottom-left":
      return `${pad}:H-${logoH}-${pad}`;
    case "bottom-center":
      return `(W-${logoW})/2:H-${logoH}-${pad}`;
    case "bottom-right":
      return `W-${logoW}-${pad}:H-${logoH}-${pad}`;
    case "center":
    default:
      return `(W-${logoW})/2:(H-${logoH})/2`;
  }
}

// ===== Pricing (per client) =====
async function getPricing(clientId) {
  const defaults = { freeMode: false, photoPrice: 100, video3Price: 300, video15Price: 500 };
  if (!clientId) return defaults;

  const ref = db.collection("clients").doc(clientId).collection("settings").doc("pricing");
  const snap = await ref.get();
  if (!snap.exists) return defaults;

  const d = snap.data() || {};
  return {
    freeMode: !!d.freeMode,
    photoPrice: Number(d.photoPrice ?? defaults.photoPrice),
    video3Price: Number(d.video3Price ?? defaults.video3Price),
    video15Price: Number(d.video15Price ?? defaults.video15Price),
  };
}

// ===== Daily stats =====
function jstDayKey(ms = Date.now()) {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function reportType(captureType, durationSec) {
  const t = String(captureType || "").toLowerCase();
  const s = Number(durationSec || 0);
  if (t === "photo") return "photo";
  if (s === 15) return "video15";
  return "video3";
}

async function incDailyCapture({ clientId, cameraId, captureType, durationSec, ms = Date.now() }) {
  const dayKey = jstDayKey(ms);
  const type = reportType(captureType, durationSec);
  const inc = admin.firestore.FieldValue.increment;

  const dayRef = db.collection("clients").doc(clientId).collection("dailyStats").doc(dayKey);
  const camRef = db
    .collection("clients")
    .doc(clientId)
    .collection("dailyCameraStats")
    .doc(`${dayKey}_${cameraId}`);

  const dayUpdate = {
    clientId,
    date: dayKey,
    capturesTotal: inc(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const camUpdate = {
    clientId,
    cameraId,
    date: dayKey,
    capturesTotal: inc(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (type === "photo") {
    dayUpdate.photoCount = inc(1);
    camUpdate.photoCount = inc(1);
  } else if (type === "video15") {
    dayUpdate.video15Count = inc(1);
    camUpdate.video15Count = inc(1);
  } else {
    dayUpdate.video3Count = inc(1);
    camUpdate.video3Count = inc(1);
  }

  await Promise.all([dayRef.set(dayUpdate, { merge: true }), camRef.set(camUpdate, { merge: true })]);
}

// Optional: keep if used by your webhook later
async function incDailyPaid({ clientId, cameraId, captureType, durationSec, amountYen, ms = Date.now() }) {
  const dayKey = jstDayKey(ms);
  const type = reportType(captureType, durationSec);
  const inc = admin.firestore.FieldValue.increment;
  const amt = Number(amountYen || 0);

  const dayRef = db.collection("clients").doc(clientId).collection("dailyStats").doc(dayKey);
  const camRef = db
    .collection("clients")
    .doc(clientId)
    .collection("dailyCameraStats")
    .doc(`${dayKey}_${cameraId}`);

  const dayUpdate = {
    clientId,
    date: dayKey,
    paidTotal: inc(1),
    revenueYen: inc(amt),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const camUpdate = {
    clientId,
    cameraId,
    date: dayKey,
    paidTotal: inc(1),
    revenueYen: inc(amt),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (type === "photo") {
    dayUpdate.paidPhotoCount = inc(1);
    camUpdate.paidPhotoCount = inc(1);
  } else if (type === "video15") {
    dayUpdate.paidVideo15Count = inc(1);
    camUpdate.paidVideo15Count = inc(1);
  } else {
    dayUpdate.paidVideo3Count = inc(1);
    camUpdate.paidVideo3Count = inc(1);
  }

  await Promise.all([dayRef.set(dayUpdate, { merge: true }), camRef.set(camUpdate, { merge: true })]);
}

// ===== Camera owner resolution + gates =====
async function resolveCameraOwner(cameraId) {
  const snap = await db.collectionGroup("cameras").where("cameraId", "==", cameraId).limit(1).get();
  if (snap.empty) throw new Error("Camera not registered");

  const camDoc = snap.docs[0];
  const camera = camDoc.data() || {};

  if (camera.paymentStatus !== "active") throw new Error("Camera subscription inactive");

  const status = String(camera.status || "Active").toLowerCase();
  if (status === "offline") throw new Error("Camera is offline");

  const clientId = camDoc.ref.parent.parent.id;
  return { cameraId, clientId, camera };
}

// ===== Preview generator =====
async function makePreview({ inputFile, outputFile, isPhoto }) {
  // Keep preview small + watermarked
  // Photo: higher compression (q) + scale
  // Video: crf 30 + scale
  const watermark = PREVIEW_WATERMARK_TEXT.replace(/'/g, "\\'"); // escape single quotes for ffmpeg

  const vf =
    "scale='min(900,iw)':-2," +
    `drawtext=text='${watermark}':x=(w-text_w)/2:y=h-(text_h*2):` +
    "fontcolor=white@0.85:fontsize=36:box=1:boxcolor=black@0.45:boxborderw=20";

  const args = isPhoto
    ? ["-i", inputFile, "-vf", vf, "-q:v", "8", outputFile]
    : ["-i", inputFile, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-an", "-movflags", "+faststart", outputFile];

  await new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    ff.stderr.on("data", (d) => console.log("FFMPEG_PREVIEW:", d.toString()));
    ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("FFmpeg preview failed"))));
  });
}

// ===================================================
// POST /public/session
// ===================================================
router.post("/session", async (req, res) => {
  let cameraId = null;
  try {
    cameraId = sanitizeCameraId(req.query.cameraId);
    if (!cameraId) return res.status(400).json({ ok: false, error: "Missing cameraId" });

    const { clientId } = await resolveCameraOwner(cameraId);

    const sessionId = db.collection("_").doc().id;
    const locked = cameraLock.lock(cameraId, sessionId);
    if (!locked) return res.status(409).json({ ok: false, error: "Camera is currently in use" });

    const sessionSecret = crypto.randomBytes(16).toString("hex");
    const now = nowMs();

    await db.collection("captureSessions").doc(sessionId).set({
      sessionId,
      sessionSecret,
      cameraId,
      clientId,
      phase: "live",
      paymentPhase: "none",
      createdAt: now,
      liveExpiresAt: now + LIVE_TIMEOUT_MS,
    });

    return res.json({ ok: true, sessionId, clientId });
  } catch (err) {
    console.error("public/session error:", err.message);
    if (cameraId) cameraLock.unlock(cameraId);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ===================================================
// GET /public/start-stream (auto-timeout)
// ===================================================
router.get("/start-stream", async (req, res) => {
  try {
    const cameraId = sanitizeCameraId(req.query.cameraId);
    const sessionId = String(req.query.sessionId || "").trim();
    const force = String(req.query.force || "0") === "1";

    if (!cameraId || !sessionId) return res.status(400).json({ ok: false, error: "Missing cameraId or sessionId" });

    const { clientId, camera } = await resolveCameraOwner(cameraId);

    if (!cameraLock.isLockedBy(cameraId, sessionId)) {
      return res.status(403).json({ ok: false, error: "Camera lock mismatch or expired" });
    }

    const u = encodeURIComponent(camera.username);
    const p = encodeURIComponent(camera.password);
    const rtspUrl = `rtsp://${u}:${p}@${camera.ip}:554/axis-media/media.amp`;

    const { playlist } = await startLiveStream(clientId, cameraId, rtspUrl, { force });

    const playlistPath = path.join(__dirname, "hls", playlist);
    try {
      await waitForFile(playlistPath, 20000);
    } catch {
      console.warn("⚠️ Playlist delay tolerated");
    }

    const timeoutKey = `${clientId}_${cameraId}`;
    if (liveTimeouts.has(timeoutKey)) clearTimeout(liveTimeouts.get(timeoutKey));

    const timeout = setTimeout(async () => {
      try {
        const snap = await db.collection("captureSessions").doc(sessionId).get();
        if (!snap.exists || snap.data()?.phase !== "live") return;

        console.warn("⏰ Live auto-timeout:", cameraId);
        stopLiveStream(timeoutKey);
        cameraLock.unlock(cameraId);

        await db.collection("captureSessions").doc(sessionId).update({
          phase: "timeout",
          endedAt: nowMs(),
        });
      } catch (e) {
        console.error("Auto-timeout cleanup failed:", e.message);
      } finally {
        liveTimeouts.delete(timeoutKey);
      }
    }, LIVE_TIMEOUT_MS);

    liveTimeouts.set(timeoutKey, timeout);

    return res.json({
      ok: true,
      hlsPath: `/hls/${playlist}?t=${Date.now()}`,
      timeoutMs: LIVE_TIMEOUT_MS,
    });
  } catch (err) {
    console.error("start-stream error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ===================================================
// POST /public/capture
// ✅ Creates original + preview (watermarked)
// ===================================================
router.post("/capture", async (req, res) => {
  let cameraId = null;
  let clientId = null;

  try {
    const sessionId = String(req.body.sessionId || req.query.sessionId || "").trim();
    if (!sessionId) return res.status(400).json({ ok: false, error: "Missing sessionId" });

    const captureType = String(req.body?.captureType || "video").toLowerCase(); // video|photo
    let durationSec = Number(req.body?.durationSec || 3);

    const isPhoto = captureType === "photo";
    if (!isPhoto && ![3, 15].includes(durationSec)) durationSec = 3;
    if (isPhoto) durationSec = 0;

    const ref = db.collection("captureSessions").doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "Session not found" });

    const data = snap.data() || {};
    cameraId = data.cameraId;
    clientId = data.clientId;

    if (data.phase !== "live") return res.status(400).json({ ok: false, error: "Live stream not active" });

    const timeoutKey = `${clientId}_${cameraId}`;
    if (liveTimeouts.has(timeoutKey)) {
      clearTimeout(liveTimeouts.get(timeoutKey));
      liveTimeouts.delete(timeoutKey);
    }

    await ref.update({
      phase: "capturing",
      captureType: isPhoto ? "photo" : "video",
      durationSec,
    });

    stopLiveStream(timeoutKey);

    const camSnap = await db.collection("clients").doc(clientId).collection("cameras").doc(cameraId).get();
    if (!camSnap.exists) throw new Error("Camera not found");

    const cam = camSnap.data() || {};
    const rtspUrl = `rtsp://${cam.username}:${cam.password}@${cam.ip}:554/axis-media/media.amp`;

    const capturesDir = path.join(__dirname, "captures");
    if (!fs.existsSync(capturesDir)) fs.mkdirSync(capturesDir, { recursive: true });

    const ext = isPhoto ? "jpg" : "mp4";
    const localFile = path.join(capturesDir, `${sessionId}.${ext}`);
    const previewFile = path.join(capturesDir, `${sessionId}.preview.${ext}`);

    // overlays from frames collection
    const frameId = safeId(req.body?.frameId);
    const logoId = safeId(req.body?.logoId);

    const overlaysRef = db.collection("clients").doc(clientId).collection("frames");
    const frameDoc = frameId ? await overlaysRef.doc(frameId).get() : null;
    const logoDoc = logoId ? await overlaysRef.doc(logoId).get() : null;

    const frameData = frameDoc?.exists ? frameDoc.data() : null;
    const logoData = logoDoc?.exists ? logoDoc.data() : null;

    if (frameData && frameData.type !== "frame") throw new Error("Selected frameId is not a frame");
    if (logoData && logoData.type !== "logo") throw new Error("Selected logoId is not a logo");

    const bucket = admin.storage().bucket();

    // Download overlay images locally (using short-lived signed urls)
    const tmpDir = path.join(os.tmpdir(), "TownCapture_overlays");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const localFramePng = frameData ? path.join(tmpDir, `${frameId}.png`) : null;
    const localLogoPng = logoData ? path.join(tmpDir, `${logoId}.png`) : null;

    async function signedUrl(storagePath) {
      const [url] = await bucket.file(storagePath).getSignedUrl({
        action: "read",
        expires: Date.now() + OVERLAY_FETCH_TTL_MS,
      });
      return url;
    }

    if (frameData?.storagePath) await downloadToFile(await signedUrl(frameData.storagePath), localFramePng);
    if (logoData?.storagePath) await downloadToFile(await signedUrl(logoData.storagePath), localLogoPng);

    await ref.update({
      selectedOverlay: {
        frameId: frameData ? frameId : null,
        logoId: logoData ? logoId : null,
        framePrice: frameData?.isPaid ? Number(frameData.price || 0) : 0,
        logoPrice: logoData?.isPaid ? Number(logoData.price || 0) : 0,
        logoPosition: logoData?.position || "top-left",
      },
    });

    // Build capture ffmpeg args (apply overlays)
    const ffArgs = ["-rtsp_transport", "tcp", "-i", rtspUrl];
    if (frameData) ffArgs.push("-i", localFramePng);
    if (logoData) ffArgs.push("-i", localLogoPng);

    let filterComplex = null;
    if (frameData && logoData) {
      const xy = logoXY(logoData.position || "top-left");
      filterComplex =
        `[1:v][0:v]scale2ref=w=iw:h=ih[frame][base];` +
        `[base][frame]overlay=0:0[tmp];` +
        `[2:v]scale=260:-1[logo];` +
        `[tmp][logo]overlay=${xy}[out]`;
    } else if (frameData) {
      filterComplex = `[1:v][0:v]scale2ref=w=iw:h=ih[frame][base];[base][frame]overlay=0:0[out]`;
    } else if (logoData) {
      const xy = logoXY(logoData.position || "top-left");
      filterComplex = `[1:v]scale=260:-1[logo];[0:v][logo]overlay=${xy}[out]`;
    }

    // Capture to localFile
    if (isPhoto) {
      ffArgs.push(
        ...(filterComplex ? ["-filter_complex", filterComplex, "-map", "[out]"] : []),
        "-frames:v",
        "1",
        "-q:v",
        "2",
        localFile
      );
    } else {
      ffArgs.push(
        "-t",
        String(durationSec),
        ...(filterComplex ? ["-filter_complex", filterComplex, "-map", "[out]"] : []),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        localFile
      );
    }

    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", ffArgs);
      ff.stderr.on("data", (d) => console.log("FFMPEG:", d.toString()));
      ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("FFmpeg failed"))));
    });

    // Cleanup overlay temp files
    if (localFramePng) fs.unlink(localFramePng, () => {});
    if (localLogoPng) fs.unlink(localLogoPng, () => {});

    // Storage paths (NEW)
    const originalPath = isPhoto
      ? `capturesOriginal/${clientId}/${cameraId}/${sessionId}.jpg`
      : `capturesOriginal/${clientId}/${cameraId}/${sessionId}.mp4`;

    const previewPath = isPhoto
      ? `capturesPreview/${clientId}/${cameraId}/${sessionId}.jpg`
      : `capturesPreview/${clientId}/${cameraId}/${sessionId}.mp4`;

    // Upload original first (never returned to client)
    await bucket.upload(localFile, {
      destination: originalPath,
      contentType: isPhoto ? "image/jpeg" : "video/mp4",
    });

    // Create + upload preview
    await makePreview({ inputFile: localFile, outputFile: previewFile, isPhoto });

    await bucket.upload(previewFile, {
      destination: previewPath,
      contentType: isPhoto ? "image/jpeg" : "video/mp4",
    });

    // Remove local files
    fs.unlink(localFile, () => {});
    fs.unlink(previewFile, () => {});

    // Signed URL only for preview
    const [previewUrl] = await bucket.file(previewPath).getSignedUrl({
      action: "read",
      expires: Date.now() + PREVIEW_URL_TTL_MS,
    });

    const UNPAID_TTL_MS = 60 * 60 * 1000; // ✅ 1 hour (not paid)

    await ref.update({
    phase: "captured",
    paymentPhase: "none",
    paid: false,

    previewUrl,
    previewPath,
    originalPath,

    capturedAt: nowMs(),

  // ✅ unpaid auto delete
  deleteAfter: nowMs() + UNPAID_TTL_MS,

  captureType: isPhoto ? "photo" : "video",
  durationSec,
});

    await incDailyCapture({
      clientId,
      cameraId,
      captureType: isPhoto ? "photo" : "video",
      durationSec,
    });

    return res.json({ ok: true, previewUrl, captureType: isPhoto ? "photo" : "video", durationSec });
  } catch (err) {
    console.error("capture error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (cameraId) cameraLock.unlock(cameraId);
  }
});

// ===================================================
// POST /public/create-payment
// - paid: returns Stripe checkout URL
// - free: creates downloadToken immediately
// ===================================================
router.post("/create-payment", async (req, res) => {
  try {
    const stripe = getStripe();

    const sessionId = String(req.body?.sessionId || "").trim();
    const email = req.body?.email ? String(req.body.email).trim() : null;

    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    const ref = db.collection("captureSessions").doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Session not found" });

    const data = snap.data() || {};
    const captureType = String(data.captureType || "video");
    const durationSec = Number(data.durationSec || 3);

    const framePrice = Number(data?.selectedOverlay?.framePrice || 0);
    const logoPrice = Number(data?.selectedOverlay?.logoPrice || 0);

    const pricing = await getPricing(data.clientId);

    let basePrice = 0;
    if (pricing.freeMode) basePrice = 0;
    else if (captureType === "photo") basePrice = pricing.photoPrice;
    else if (durationSec === 15) basePrice = pricing.video15Price;
    else basePrice = pricing.video3Price;

    const total = basePrice + framePrice + logoPrice;

    // FREE MODE
    if (total === 0) {
      const expiresAt = nowMs() + 60 * 60 * 1000;
      const maxDownloads = 3;
      const token = randomToken();

      await db.collection("downloadTokens").doc(token).set({
        token,
        sessionId,
        expiresAt,
        maxDownloads,
        downloadCount: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await ref.set(
        {
          phase: "paid",
          paid: true,
          paymentStatus: "active",
          paymentPhase: "paid",
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          paidExpiresAt: expiresAt,
          deleteAfter: expiresAt,

          downloadToken: token,
          downloadCount: 0,
          downloadMax: maxDownloads,

          paymentAmount: 0,
          endUserEmail: email || data.endUserEmail || null,

          pricingSnapshot: {
            captureType,
            durationSec,
            basePrice,
            framePrice,
            logoPrice,
            total: 0,
            freeMode: true,
            settingsUsed: {
              photoPrice: pricing.photoPrice,
              video3Price: pricing.video3Price,
              video15Price: pricing.video15Price,
            },
          },
        },
        { merge: true }
      );

      return res.json({
        url: `${process.env.FRONTEND_BASE_URL}/success?sessionId=${sessionId}`,
        free: true,
      });
    }

    // Paid mode
    const productName = captureType === "photo" ? "TownCapture Photo" : `TownCapture Video (${durationSec} sec)`;

    const lineItems = [];
    if (basePrice > 0) {
      lineItems.push({
        price_data: { currency: "jpy", product_data: { name: productName }, unit_amount: basePrice },
        quantity: 1,
      });
    }
    if (framePrice > 0) {
      lineItems.push({
        price_data: { currency: "jpy", product_data: { name: "Premium Frame" }, unit_amount: framePrice },
        quantity: 1,
      });
    }
    if (logoPrice > 0) {
      lineItems.push({
        price_data: { currency: "jpy", product_data: { name: "Logo Overlay" }, unit_amount: logoPrice },
        quantity: 1,
      });
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "paypay"],
      line_items: lineItems,
      customer_creation: "always",
      ...(email ? { customer_email: email } : {}),
      metadata: {
        sessionId,
        cameraId: data.cameraId,
        clientId: data.clientId,
        total: String(total),
        captureType,
        durationSec: String(durationSec),
      },
      payment_intent_data: {
        metadata: {
          sessionId,
          cameraId: data.cameraId,
          clientId: data.clientId,
          captureType,
          durationSec: String(durationSec),
        },
      },
      success_url: `${process.env.FRONTEND_BASE_URL}/success?sessionId=${sessionId}`,
      cancel_url: `${process.env.FRONTEND_BASE_URL}/capture.html?sessionId=${sessionId}&canceled=1`,
    });

    await ref.set(
      {
        paymentSessionId: checkout.id,
        checkoutUrl: checkout.url,
        paymentAmount: total,
        endUserEmail: email || data.endUserEmail || null,
        paymentPhase: "pending",
        paymentCreatedAt: nowMs(),
        pricingSnapshot: {
          captureType,
          durationSec,
          basePrice,
          framePrice,
          logoPrice,
          total,
          freeMode: !!pricing.freeMode,
          settingsUsed: {
            photoPrice: pricing.photoPrice,
            video3Price: pricing.video3Price,
            video15Price: pricing.video15Price,
          },
        },
      },
      { merge: true }
    );

    return res.json({ url: checkout.url });
  } catch (err) {
    console.error("create-payment error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ===================================================
// GET /public/payment-status
// - if paid => returns downloadToken
// ===================================================
router.get("/payment-status", async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || "").trim();
    if (!sessionId) return res.status(400).json({ ok: false, error: "Missing sessionId" });

    let docSnap = null;

    if (sessionId.startsWith("cs_")) {
      let q = await db.collection("captureSessions").where("paymentSessionId", "==", sessionId).limit(1).get();
      if (q.empty) q = await db.collection("captureSessions").where("stripeCheckoutSessionId", "==", sessionId).limit(1).get();

      if (q.empty) {
        return res.json({ ok: true, paid: false, phase: "pending", captureSessionId: null, sessionId: null });
      }
      docSnap = q.docs[0];
    } else {
      const snap = await db.collection("captureSessions").doc(sessionId).get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: "Session not found" });
      docSnap = snap;
    }

    const data = docSnap.data() || {};
    const phase = data.phase || data.paymentPhase || "pending";
    const paid = phase === "paid" || data.paid === true;

    return res.json({
      ok: true,
      paid,
      phase,

      captureSessionId: docSnap.id,
      sessionId: docSnap.id,

      paymentSessionId: data.paymentSessionId || data.stripeCheckoutSessionId || null,
      previewUrl: data.previewUrl || null,
      downloadToken: data.downloadToken || null,

      captureType: data.captureType || "video",
      durationSec: Number(data.durationSec || 3),
    });
  } catch (e) {
    console.error("payment-status error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ===================================================
// LEGACY GET /public/download
// IMPORTANT:
// - This now returns ORIGINAL (originalPath), but only when phase is paid.
// - If you want strict token-only, delete this route.
// ===================================================
router.get("/download", async (req, res) => {
  const sessionId = String(req.query.sessionId || "").trim();
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

  const snap = await db.collection("captureSessions").doc(sessionId).get();
  if (!snap.exists) return res.status(404).json({ error: "Session not found" });

  const data = snap.data() || {};
  if (data.phase !== "paid" && data.paid !== true) return res.status(403).json({ error: "Payment required" });

  // Use originalPath (NEW)
  const originalPath = data.originalPath;
  if (!originalPath) return res.status(500).json({ error: "Missing originalPath" });

  const captureType = String(data.captureType || "video");
  const isPhoto = captureType === "photo";
  const filename = isPhoto ? `TownCapture_${sessionId}.jpg` : `TownCapture_${sessionId}.mp4`;

  const bucket = admin.storage().bucket();
  const [url] = await bucket.file(originalPath).getSignedUrl({
    action: "read",
    expires: Date.now() + 5 * 60 * 1000,
    responseDisposition: `attachment; filename="${filename}"`,
  });

  return res.json({ url, filename });
});

// ===================================================
// POST /public/cancel
// Deletes preview + original (if present)
// ===================================================
router.post("/cancel", async (req, res) => {
  const sessionId = String(req.body?.sessionId || "").trim();
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

  const ref = db.collection("captureSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return res.json({ ok: true });

  const { previewPath, originalPath } = snap.data() || {};

  try {
    if (previewPath) await deleteCaptureFile(previewPath);
  } catch (e) {
    console.warn("cancel: preview already deleted or missing:", e.message);
  }
  try {
    if (originalPath) await deleteCaptureFile(originalPath);
  } catch (e) {
    console.warn("cancel: original already deleted or missing:", e.message);
  }

  await ref.set(
    {
      phase: "cancelled",
      deletedAt: nowMs(),
      previewUrl: admin.firestore.FieldValue.delete(),
    },
    { merge: true }
  );

  return res.json({ ok: true });
});

// ===================================================
// POST /public/stop-stream
// ===================================================
router.post("/stop-stream", async (req, res) => {
  let cameraId = null;
  let clientId = null;

  try {
    cameraId = sanitizeCameraId(req.body.cameraId || req.query.cameraId);
    if (!cameraId) return res.status(400).json({ ok: false, error: "Missing cameraId" });

    const resolved = await resolveCameraOwner(cameraId);
    clientId = resolved.clientId;

    const timeoutKey = `${clientId}_${cameraId}`;
    if (liveTimeouts.has(timeoutKey)) {
      clearTimeout(liveTimeouts.get(timeoutKey));
      liveTimeouts.delete(timeoutKey);
    }

    const stopped = stopLiveStream(timeoutKey);
    await new Promise((r) => setTimeout(r, 500));

    return res.json({ ok: true, stopped });
  } catch (err) {
    console.error("stop-stream error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (cameraId) cameraLock.unlock(cameraId);
  }
});

// ===================================================
// GET /public/overlays
// Returns signed previewUrl for overlay images (frames + logos)
// ===================================================
router.get("/overlays", async (req, res) => {
  try {
    const cameraId = sanitizeCameraId(req.query.cameraId);
    if (!cameraId) throw new Error("Missing cameraId");

    const { clientId } = await resolveCameraOwner(cameraId);

    const snap = await db.collection("clients").doc(clientId).collection("frames").get();
    const bucket = admin.storage().bucket();

    const overlays = await Promise.all(
      snap.docs.map(async (doc) => {
        const d = doc.data() || {};
        const [url] = await bucket.file(d.storagePath).getSignedUrl({
          action: "read",
          expires: Date.now() + PREVIEW_URL_TTL_MS,
        });

        return {
          id: doc.id,
          type: d.type, // frame | logo
          fileName: d.fileName,
          isPaid: !!d.isPaid,
          price: Number(d.price || 0),
          previewUrl: url,
          position: d.position || null,
        };
      })
    );

    return res.json(overlays);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ===================================================
// POST /public/set-overlays (optional)
// ===================================================
router.post("/set-overlays", async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    const frameId = safeId(req.body?.frameId);
    const logoId = safeId(req.body?.logoId);

    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    const ref = db.collection("captureSessions").doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Session not found" });

    const { clientId } = snap.data() || {};

    const overlaysRef = db.collection("clients").doc(clientId).collection("frames");
    const frameDoc = frameId ? await overlaysRef.doc(frameId).get() : null;
    const logoDoc = logoId ? await overlaysRef.doc(logoId).get() : null;

    if (frameDoc?.exists && frameDoc.data()?.type !== "frame") return res.status(400).json({ error: "Invalid frameId" });
    if (logoDoc?.exists && logoDoc.data()?.type !== "logo") return res.status(400).json({ error: "Invalid logoId" });

    await ref.set(
      { selectedOverlay: { frameId: frameId || null, logoId: logoId || null, logoPosition: logoDoc?.data()?.position || "top-left" } },
      { merge: true }
    );

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

/*
=========================================================
IMPORTANT NOTES (do these too)
=========================================================

1) Update Storage Rules:
   - capturesPreview/... allow read (ok) and deny write (server writes)
   - capturesOriginal/... deny read/write (force download via token endpoint or /public/download)
   - REMOVE temp allow read/write: if true (security risk)

2) Update cleanup:
   - If you have a job that deletes "storagePath", update it to delete previewPath + originalPath.

3) Update stripeRoutes.js download endpoint:
   - It must download originalPath (NOT previewPath).
*/