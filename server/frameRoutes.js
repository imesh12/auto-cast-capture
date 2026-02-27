const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const admin = require("firebase-admin");

const router = express.Router();
const db = admin.firestore();
const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);

const tmpDir = path.join(os.tmpdir(), "towncapture_previews");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");

/* ----------------------------
   POSITION → FFmpeg X/Y
---------------------------- */
function logoXY(position, margin = 20) {
  switch (position) {
    case "top-left":
      return `${margin}:${margin}`;
    case "top-center":
      return `(W-w)/2:${margin}`;
    case "top-right":
      return `W-w-${margin}:${margin}`;
    case "center":
      return `(W-w)/2:(H-h)/2`;
    case "bottom-left":
      return `${margin}:H-h-${margin}`;
    case "bottom-center":
      return `(W-w)/2:H-h-${margin}`;
    case "bottom-right":
      return `W-w-${margin}:H-h-${margin}`;
    default:
      return `W-w-${margin}:${margin}`;
  }
}

/* ----------------------------
   DOWNLOAD PNG from Storage → tmp
---------------------------- */
async function downloadPng(storagePath) {
  const local = path.join(tmpDir, `${uid()}_${path.basename(storagePath)}`);
  await bucket.file(storagePath).download({ destination: local });
  return local;
}

/* ----------------------------
   Capture short source video (2-3s) from RTSP
   ✅ You already have RTSP in camera doc or somewhere.
   If you already have a "3-sec capture" function, reuse it.
---------------------------- */
async function getCameraRtspUrl(clientId, cameraId) {
  // Adjust to your schema:
  // clients/{clientId}/cameras/{cameraId} has rtspUrl
  const snap = await db.doc(`clients/${clientId}/cameras/${cameraId}`).get();
  if (!snap.exists) throw new Error("Camera not found");
  const data = snap.data();
  if (!data.rtspUrl) throw new Error("Camera rtspUrl missing");
  return data.rtspUrl;
}

function runFFmpeg(args, label = "FFMPEG") {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });

    p.stderr.on("data", d => console.log(`[${label}]`, d.toString()));
    p.on("error", reject);
    p.on("close", code => {
      if (code === 0) resolve(true);
      else reject(new Error(`ffmpeg failed: code=${code}`));
    });
  });
}

async function captureShortMp4(rtspUrl, outPath, seconds = 3) {
  // Low-latency short capture
  const args = [
    "-y",
    "-rtsp_transport", "tcp",
    "-i", rtspUrl,
    "-t", String(seconds),
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-movflags", "+faststart",
    outPath,
  ];
  await runFFmpeg(args, "CAPTURE");
}

/* ==========================================================
   POST /frames/test
   body:
   {
     clientId,
     cameraId,
     frameIds: ["..."],   // optional (we use first frame if multiple)
     logoSelections: [{ logoId, position }],
   }
========================================================== */
router.post("/test", express.json(), async (req, res) => {
  try {
    const { clientId, cameraId, frameIds = [], logoSelections = [] } = req.body;
    if (!clientId || !cameraId) return res.status(400).json({ error: "clientId & cameraId required" });

    // 1) get RTSP
    const rtspUrl = await getCameraRtspUrl(clientId, cameraId);

    // 2) capture short mp4
    const baseId = uid();
    const inMp4 = path.join(tmpDir, `${baseId}_input.mp4`);
    const outMp4 = path.join(tmpDir, `${baseId}_preview.mp4`);
    await captureShortMp4(rtspUrl, inMp4, 3);

    // 3) load selected frame + logos docs
    // We assume frames stored in: clients/{clientId}/frames/{frameId}
    let framePathLocal = null;
    if (frameIds.length > 0) {
      const frameDoc = await db.doc(`clients/${clientId}/frames/${frameIds[0]}`).get();
      if (frameDoc.exists) {
        const { storagePath } = frameDoc.data();
        if (storagePath) framePathLocal = await downloadPng(storagePath);
      }
    }

    const logoLocals = [];
    for (const sel of logoSelections) {
      const logoDoc = await db.doc(`clients/${clientId}/frames/${sel.logoId}`).get();
      if (!logoDoc.exists) continue;
      const { storagePath, type } = logoDoc.data();
      if (type !== "logo" || !storagePath) continue;
      const local = await downloadPng(storagePath);
      logoLocals.push({ local, position: sel.position || "top-right" });
    }

    // 4) Build FFmpeg overlay filter graph
    // Inputs: [0]=video, [1]=frame(optional), [2..]=logos
    const ffArgs = ["-y", "-i", inMp4];

    if (framePathLocal) ffArgs.push("-i", framePathLocal);
    for (const L of logoLocals) ffArgs.push("-i", L.local);

    // filter_complex
    // Start from [0:v], overlay frame at 0:0 (assumes same size or larger w/ alpha)
    // Then overlay each logo with computed xy
    let filter = "";
    let last = "[0:v]";

    let inputIndex = 1;

    if (framePathLocal) {
      filter += `${last}[${inputIndex}:v]overlay=0:0:format=auto[v1];`;
      last = "[v1]";
      inputIndex++;
    }

    let step = 2;
    for (let i = 0; i < logoLocals.length; i++) {
      const xy = logoXY(logoLocals[i].position);
      filter += `${last}[${inputIndex + i}:v]overlay=${xy}:format=auto[v${step}];`;
      last = `[v${step}]`;
      step++;
    }

    // Remove trailing ;
    filter = filter.replace(/;$/, "");

    if (filter) {
      ffArgs.push(
        "-filter_complex", filter,
        "-map", last,
        "-an",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-movflags", "+faststart",
        outMp4
      );
    } else {
      // no overlays selected → just return captured clip
      fs.copyFileSync(inMp4, outMp4);
    }

    if (filter) await runFFmpeg(ffArgs, "OVERLAY");

    // 5) Serve via static previews folder (copy to server/public/previews)
    const previewsDir = path.join(__dirname, "public", "previews");
    if (!fs.existsSync(previewsDir)) fs.mkdirSync(previewsDir, { recursive: true });

    const publicName = `${baseId}.mp4`;
    const publicPath = path.join(previewsDir, publicName);
    fs.copyFileSync(outMp4, publicPath);

    return res.json({ ok: true, previewUrl: `/previews/${publicName}` });
  } catch (e) {
    console.error("frames/test error:", e);
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
