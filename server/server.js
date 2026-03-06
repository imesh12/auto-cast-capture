/********************************************
 * server/server.js — PRODUCTION AUDITED
 * Town Capture API
 ********************************************/
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");
const os = require("os");

/* ===========================================================
   1️⃣ ENV (MUST BE FIRST)
=========================================================== */
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
}

console.log("STRIPE_SECRET_KEY loaded:", !!process.env.STRIPE_SECRET_KEY);
console.log("STRIPE_WEBHOOK_SECRET loaded:", !!process.env.STRIPE_WEBHOOK_SECRET);

/* ===========================================================
   2️⃣ FIREBASE ADMIN
=========================================================== */
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});


const firestore = admin.firestore();

/* ===========================================================
   3️⃣ EXPRESS APP
=========================================================== */
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.set("trust proxy", true); // ✅ IMPORTANT FOR PROD

/* ===========================================================
   4️⃣ IMPORT ROUTES (ONCE)
=========================================================== */
const publicRoutes = require("./publicRoutes");
const stripeRoutes = require("./stripeRoutes");

// server/server.js (after imports)
const cameraLock = require("./cameraLock");

// server/frameRoutes.js 
const frameRoutes = require("./frameRoutes");

setInterval(() => cameraLock.cleanup(), 10_000);
const { mountAxisUiProxy } = require("./axisUiProxy");

// after express app created, before listen()
mountAxisUiProxy(app);

/* ===========================================================
   🧹 BACKGROUND CLEANUP — EXPIRED CAPTURES
   Purpose:
   - If payment fails / user has credit card issue, keep the capture for 1 hour
   - After 1 hour, automatically delete files to reduce storage cost

   Rules:
   - Unpaid ("captured", "payment_failed") => deleteAfter = capturedAt + 1 hour
   - Paid ("paid") => deleteAfter = paidAt + 1 hour (set by stripeRoutes markCapturePaid or freeMode)
   - Also cleans up ("timeout", "cancelled") if they have deleteAfter
   - Deletes BOTH: previewPath + originalPath
   - Backward compatible: deletes storagePath if old docs still exist
=========================================================== */
const { deleteCaptureFile } = require("./cleanup");

setInterval(async () => {
  try {
    const now = Date.now();

    // Firestore requires a composite index for:
    // where(deleteAfter <= now) + where(phase in [...])
    const snap = await firestore
      .collection("captureSessions")
      .where("deleteAfter", "<=", now)
      .where("phase", "in", ["captured", "payment_failed", "paid", "timeout", "cancelled"])
      .get();

    if (snap.empty) return;

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const id = doc.id;

      console.log("⏱ Auto-cleanup expired capture:", id, "phase:", data.phase);

      const previewPath = data.previewPath || null;
      const originalPath = data.originalPath || null;
      const storagePath = data.storagePath || null; // legacy

      // Delete in parallel (ignore delete errors)
      await Promise.allSettled([
        previewPath ? deleteCaptureFile(previewPath) : Promise.resolve(),
        originalPath ? deleteCaptureFile(originalPath) : Promise.resolve(),
        storagePath ? deleteCaptureFile(storagePath) : Promise.resolve(),
      ]);

      // Mark expired + remove sensitive / heavy fields
      await doc.ref.set(
        {
          phase: "expired",
          deletedAt: now,

          // optional status fields (keeps UI consistent)
          paid: false,
          paymentStatus: "expired",

          // remove URLs/tokens/paths so they can't be reused
          previewUrl: admin.firestore.FieldValue.delete(),
          downloadToken: admin.firestore.FieldValue.delete(),

          previewPath: admin.firestore.FieldValue.delete(),
          originalPath: admin.firestore.FieldValue.delete(),
          storagePath: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error("❌ Cleanup job error:", err.message);
  }
}, 2 * 60 * 1000); // every 2 minutes
/* ===========================================================
   5️⃣ ENV SETTINGS
=========================================================== */
const PORT = Number(process.env.PORT || 8080);

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list) {
      if (n.family === "IPv4" && !n.internal) return n.address;
    }
  }
  return "127.0.0.1";
}
const LOCAL_IP = getLocalIP();

/* ===========================================================
   6️⃣ CORS (DEV + PROD SAFE) — FIXED
=========================================================== */
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://imesh12.github.io",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // requests like curl / server-to-server have no origin
  if (!origin) return next();

  // allow LAN testing (any port)
  const isLan = /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin);

  if (allowedOrigins.has(origin) || isLan) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }

  // Always end preflight quickly
  if (req.method === "OPTIONS") return res.sendStatus(204);

  next();
});

/* ===========================================================
   7️⃣ LOGGING
=========================================================== */
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

/* ===========================================================
   STRIPE WEBHOOK (RAW BODY — MUST BE FIRST)
=========================================================== */
app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json", limit: "2mb" }),
  (req, res, next) => {
    // forward into stripeRoutes router which has POST "/webhook"
    req.url = "/webhook";
    stripeRoutes(req, res, next);
  }
);

/* ===========================================================
   NORMAL BODY PARSERS (AFTER WEBHOOK)
=========================================================== */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());
//app.use("/hls", express.static(path.join(__dirname, "hls")));


/* ===========================================================
   STRIPE API ROUTES (JSON)
=========================================================== */
app.use("/stripe", stripeRoutes);

// serve preview mp4 frame
app.use("/previews", express.static(path.join(__dirname, "public", "previews")));

// api
app.use("/frames", frameRoutes);

/* ===========================================================
   🔟 HLS STATIC FILES (Cloud Run safe: /tmp)
=========================================================== */

const HLS_DIR = process.env.HLS_DIR || "/tmp/hls";
fs.mkdirSync(HLS_DIR, { recursive: true });
console.log("✅ HLS_DIR:", HLS_DIR);

app.get("/debug/hls", (req, res) => {
  try {
    const files = fs.readdirSync(HLS_DIR);
    res.json({ HLS_DIR, count: files.length, files: files.slice(-200) });
  } catch (e) {
    res.status(500).json({ HLS_DIR, error: String(e) });
  }
});

// ✅ serve m3u8/ts files created by ffmpeg
app.use(
  "/hls",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Cache-Control", "no-store");
    next();
  },
  express.static(HLS_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".m3u8")) res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      if (filePath.endsWith(".ts")) res.setHeader("Content-Type", "video/mp2t");
    },
  })
);
/* ===========================================================
   1️⃣1️⃣ HEALTH CHECK
=========================================================== */
app.get("/", (req, res) => {
  res.json({ status: "API ok" });
});

/* ===========================================================
   1️⃣2️⃣ SMTP
=========================================================== */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify(err => {
  if (err) console.error("❌ SMTP error:", err.message);
  else console.log("✅ SMTP ready");
});

/* ===========================================================
   1️⃣3️⃣ ROUTES
=========================================================== */
app.use("/public", publicRoutes);


/* ===========================================================
   1️⃣4️⃣ STATIC PUBLIC FILES
=========================================================== */
app.use(express.static(path.join(__dirname, "../public")));

/* ===========================================================
   1️⃣5️⃣ START SERVER
=========================================================== */
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API running at http://${LOCAL_IP}:${PORT}`);
});

/* ===========================================================
   1️⃣6️⃣ GRACEFUL SHUTDOWN (FFMPEG SAFE)
=========================================================== */
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down...");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down...");
  server.close(() => process.exit(0));
});
