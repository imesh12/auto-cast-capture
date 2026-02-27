// server/liveStream.js
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const admin = require("firebase-admin");
const os = require("os");
const https = require("https");

const liveProcesses = new Map();

/* =========================================================
   HELPERS
========================================================= */
function ensureHlsDir() {
  const dir = path.join(__dirname, "hls");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

function cleanupHlsFiles(prefix) {
  const hlsDir = ensureHlsDir();
  try {
    const files = fs.readdirSync(hlsDir);
    for (const f of files) {
      if (f.startsWith(prefix)) {
        safeUnlink(path.join(hlsDir, f));
      }
    }
  } catch {}
}

function safeId(id) {
  return String(id || "").trim().replace(/[^\w-]/g, "");
}

async function downloadToFile(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", reject);
  });
}

function logoXY(position, pad = 30, logoW = 260, logoH = 260) {
  switch (position) {
    case "top-left": return `${pad}:${pad}`;
    case "top-center": return `(W-${logoW})/2:${pad}`;
    case "top-right": return `W-${logoW}-${pad}:${pad}`;
    case "bottom-left": return `${pad}:H-${logoH}-${pad}`;
    case "bottom-center": return `(W-${logoW})/2:H-${logoH}-${pad}`;
    case "bottom-right": return `W-${logoW}-${pad}:H-${logoH}-${pad}`;
    default: return `(W-${logoW})/2:(H-${logoH})/2`;
  }
}


/* =========================================================
   STOP LIVE STREAM (hard + reliable)
========================================================= */
function stopLiveStream(key) {
  const proc = liveProcesses.get(key);
  if (!proc) return false;

  console.log("🛑 Stopping live stream:", key);

  // Tell FFmpeg to quit gracefully
  try {
    proc.stdin?.write("q\n");
  } catch {}

  try {
    proc.kill("SIGTERM");
  } catch {}

  // HARD KILL fallback
  setTimeout(() => {
    if (!proc.killed) {
      console.warn("⚠️ Force killing FFmpeg:", key);
      try {
        proc.kill("SIGKILL");
      } catch {}
    }
  }, 1000);

  proc.once("exit", () => {
    console.log("✅ FFmpeg fully stopped:", key);
    liveProcesses.delete(key);
  });

  return true;
}


/* =========================================================
   START LIVE STREAM (OVERLAY-AWARE, FORCE SAFE)
========================================================= */
async function startLiveStream(clientId, cameraId, rtspUrl, opts = {}) {
  const { force = false } = opts;
  const key = `${clientId}_${cameraId}`;

  const hlsDir = ensureHlsDir();

  if (force && liveProcesses.has(key)) {
    await stopLiveStream(key);
    await new Promise(r => setTimeout(r, 300));
  }

  const streamId = `${key}_${Date.now()}`;
  const playlist = `${streamId}.m3u8`;
  const outputPath = path.join(hlsDir, playlist);

  // cleanup old HLS
  cleanupHlsFiles(`${key}_`);

  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  /* ===============================
     LOAD SELECTED OVERLAYS
  ================================ */
  let frameData = null;
  let logoData = null;
  let logoPosition = "top-left";

  try {
    const snap = await db
      .collection("captureSessions")
      .where("cameraId", "==", cameraId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (!snap.empty) {
      const overlay = snap.docs[0].data().selectedOverlay;

      if (overlay?.frameId) {
        const frameDoc = await db
          .collection("clients")
          .doc(clientId)
          .collection("frames")
          .doc(safeId(overlay.frameId))
          .get();

        if (frameDoc.exists && frameDoc.data().type === "frame") {
          frameData = frameDoc.data();
        }
      }

      if (overlay?.logoId) {
        const logoDoc = await db
          .collection("clients")
          .doc(clientId)
          .collection("frames")
          .doc(safeId(overlay.logoId))
          .get();

        if (logoDoc.exists && logoDoc.data().type === "logo") {
          logoData = logoDoc.data();
          logoPosition = overlay.logoPosition || "top-left";
        }
      }
    }
  } catch (e) {
    console.warn("⚠️ Live overlay load failed:", e.message);
  }

  /* ===============================
     DOWNLOAD OVERLAYS (TEMP)
  ================================ */
  const tmpDir = path.join(os.tmpdir(), "towncapture_live_overlays");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const localFramePng = frameData
    ? path.join(tmpDir, `frame_${cameraId}.png`)
    : null;

  const localLogoPng = logoData
    ? path.join(tmpDir, `logo_${cameraId}.png`)
    : null;

  if (frameData?.storagePath) {
    const [url] = await bucket.file(frameData.storagePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 60 * 1000,
    });
    await downloadToFile(url, localFramePng);
  }

  if (logoData?.storagePath) {
    const [url] = await bucket.file(logoData.storagePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 60 * 1000,
    });
    await downloadToFile(url, localLogoPng);
  }

  /* ===============================
     BUILD FFMPEG ARGS
  ================================ */
  const ffArgs = [
    "-rtsp_transport", "tcp",
    "-fflags", "nobuffer",
    "-flags", "low_delay",
    "-i", rtspUrl,
  ];

  if (frameData) ffArgs.push("-i", localFramePng);
  if (logoData)  ffArgs.push("-i", localLogoPng);

  let filterComplex = null;

  if (frameData && logoData) {
    const xy = logoXY(logoPosition);
    filterComplex =
      `[1:v][0:v]scale2ref=w=iw:h=ih[frame][base];` +
      `[base][frame]overlay=0:0[tmp];` +
      `[2:v]scale=260:-1[logo];` +
      `[tmp][logo]overlay=${xy}[out]`;
  }
  else if (frameData) {
    filterComplex =
      `[1:v][0:v]scale2ref=w=iw:h=ih[frame][base];` +
      `[base][frame]overlay=0:0[out]`;
  }
  else if (logoData) {
    const xy = logoXY(logoPosition);
    filterComplex =
      `[1:v]scale=260:-1[logo];` +
      `[0:v][logo]overlay=${xy}[out]`;
  }

  if (filterComplex) {
    ffArgs.push(
      "-filter_complex", filterComplex,
      "-map", "[out]"
    );
  }

  ffArgs.push(
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-pix_fmt", "yuv420p",
    "-g", "30",
    "-sc_threshold", "0",
    "-f", "hls",
    "-hls_time", "1",
    "-hls_list_size", "4",
    "-hls_flags", "delete_segments+omit_endlist",
    "-hls_segment_filename",
    path.join(hlsDir, `${streamId}_%03d.ts`),
    outputPath
  );

  /* ===============================
     SPAWN FFMPEG
  ================================ */
  const ffmpeg = spawn("ffmpeg", ffArgs);

  ffmpeg.stderr.on("data", d => {
    console.log(`FFMPEG[${key}] ${d.toString()}`);
  });

  ffmpeg.on("error", e => {
    console.error("FFMPEG spawn error:", e);
  });

  ffmpeg.on("exit", code => {
    liveProcesses.delete(key);
    if (localFramePng) fs.unlink(localFramePng, () => {});
    if (localLogoPng) fs.unlink(localLogoPng, () => {});
    console.log("🛑 Live stream exited:", key, "code:", code);
  });

  liveProcesses.set(key, ffmpeg);

  console.log("▶️ Live stream started:", key, "playlist:", playlist);
  return { playlist };
}

module.exports = {
  startLiveStream,
  stopLiveStream,
};
