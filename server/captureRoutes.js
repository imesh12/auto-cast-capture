/******************************************************
 * captureRoutes.js — Axis photo/video capture (UPDATED)
 * - Photo OR Video
 * - Video duration: 3s / 15s
 * - Upload to Firebase Storage (temp/)
 * - Return signed preview URL
 ******************************************************/
const express = require("express");
const router = express.Router();

const { admin, db: firestore } = require("./firebaseAdmin");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TMP = path.join(__dirname, "tmp");
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

/******************************************************
 * AUTH (same as your original)
 ******************************************************/
async function verifyUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const snap = await firestore.doc(`users/${decoded.uid}`).get();
    if (!snap.exists) return null;
    return { uid: decoded.uid, clientId: snap.data().clientId };
  } catch {
    return null;
  }
}

/******************************************************
 * SCALE
 ******************************************************/
const SCALE = {
  portrait: "1080:1920",
  landscape: "1920:1080",
  square: "1080:1080",
};

/******************************************************
 * Helpers
 ******************************************************/
function safeId(v) {
  return String(v || "").trim().replace(/[^\w-]/g, "");
}

function safeOrientation(v) {
  const o = String(v || "").toLowerCase();
  return SCALE[o] ? o : "landscape";
}

function asInt(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args, { windowsHide: true });

    ff.stderr.on("data", (d) => console.log("FFMPEG:", d.toString()));
    ff.on("error", reject);
    ff.on("exit", (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`FFmpeg failed with code ${code}`));
    });
  });
}

/******************************************************
 * POST /capture
 * body: { cameraId, captureType: "photo"|"video", durationSec, orientation }
 *
 * Returns:
 *  { ok:true, captureType, previewUrl, storagePath }
 ******************************************************/
router.post("/", async (req, res) => {
  let localPath = null;

  try {
    const auth = await verifyUser(req);
    if (!auth) return res.status(401).json({ ok: false, error: "auth failed" });

    const cameraId = safeId(req.body.cameraId || req.query.cameraId);
    if (!cameraId) {
      return res.status(400).json({ ok: false, error: "cameraId missing" });
    }

    const captureType = String(req.body.captureType || "video").toLowerCase();
    const orientation = safeOrientation(req.body.orientation || req.query.orientation);
    const durationSecRaw = asInt(req.body.durationSec, 3);

    // ✅ enforce rules
    const durationSec =
      captureType === "video" ? (durationSecRaw === 15 ? 15 : 3) : 0;

    // load camera from client scope (same as your old code)
    const snap = await firestore
      .doc(`clients/${auth.clientId}/cameras/${cameraId}`)
      .get();

    if (!snap.exists)
      return res.status(404).json({ ok: false, error: "camera not found" });

    const cam = snap.data();
    const rtspPort = cam.rtspPort || cam.port || 554;

    const rtspUrl = `rtsp://${encodeURIComponent(cam.username)}:${encodeURIComponent(
      cam.password
    )}@${cam.ip}:${rtspPort}/axis-media/media.amp`;

    const scale = SCALE[orientation];

    // output file
    const ts = Date.now();
    const ext = captureType === "photo" ? "jpg" : "mp4";
    const fileName = `${captureType}-${cameraId}-${ts}.${ext}`;
    localPath = path.join(TMP, fileName);

    console.log(`🎬 Capture: type=${captureType} duration=${durationSec} orientation=${orientation}`);
    console.log("📡 RTSP:", rtspUrl);

    // ===============================
    // ✅ Build FFmpeg args
    // ===============================
    // notes:
    // - For photo: grab 1 frame from stream
    // - For video: record durationSec seconds
    // - Always scale to requested aspect
    const ffArgs = [
      "-y",
      "-rtsp_transport", "tcp",
      "-i", rtspUrl,
    ];

    if (captureType === "photo") {
      // take 1 frame
      ffArgs.push(
        "-frames:v", "1",
        "-vf", `scale=${scale}`,
        "-q:v", "2",          // good jpg quality
        localPath
      );
    } else {
      // record 3s or 15s
      ffArgs.push(
        "-t", String(durationSec),
        "-vf", `scale=${scale}`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-an",
        localPath
      );
    }

    await runFFmpeg(ffArgs);

    if (!fs.existsSync(localPath)) {
      return res.status(500).json({ ok: false, error: "capture output missing" });
    }

    // ===============================
    // ✅ Upload to Firebase Storage
    // ===============================
    const bucket = admin.storage().bucket();
    const storagePath = `temp/${auth.clientId}/${cameraId}/${fileName}`;

    await bucket.upload(localPath, {
      destination: storagePath,
      contentType: captureType === "photo" ? "image/jpeg" : "video/mp4",
    });

    // signed preview
    const [previewUrl] = await bucket.file(storagePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    // cleanup local temp
    fs.unlink(localPath, () => {});
    localPath = null;

    return res.json({
      ok: true,
      captureType,
      durationSec,
      orientation,
      storagePath,
      previewUrl,
    });

  } catch (e) {
    console.error("🚨 /capture crash:", e);
    if (localPath) fs.unlink(localPath, () => {});
    return res.status(500).json({ ok: false, error: e.message || "server error" });
  }
});

module.exports = router;
