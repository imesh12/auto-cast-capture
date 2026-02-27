/******************************************************
 * stripeRoutes.js — FINAL PRODUCTION (SINGLE SOURCE)
 *
 * ✅ ONE webhook only (POST /webhook)
 * ✅ Safe Stripe loader (no top-level Stripe init)
 * ✅ Webhook idempotency: Firestore stripeEvents/{eventId}
 * ✅ Subscription mapping: stripeSubs/{subscriptionId}
 * ✅ B2B: subscription checkout + activation (Checkout completed)
 * ✅ B2B: invoice paid -> store invoice + update nextBillingDate
 * ✅ B2B: cancel at period end + immediate cancel
 * ✅ B2C: capture checkout payments (card + PayPay async)
 * ✅ B2C: controlled email download token (1 hour / max 3)
 * ✅ B2C: anti-prefetch safe download (cookie nonce required for POST /go)
 *
 * ✅ IMPORTANT SECURITY FIX:
 * - Uses captureSessions.originalPath (NEW) instead of storagePath
 * - previewPath/previewUrl are public preview only; originals never exposed until paid
 *
 * SERVER REQUIREMENTS:
 * - server.js must mount:
 *     app.post("/stripe/webhook", express.raw(...), (req,res,next)=>{ req.url="/webhook"; stripeRoutes(req,res,next) })
 *     app.use(express.json(...)) AFTER webhook
 *     app.use(cookieParser()) BEFORE app.use("/stripe", stripeRoutes)
 ******************************************************/

const express = require("express");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { sendMail } = require("./mailer"); // optional but supported

const router = express.Router();
console.log("✅ stripeRoutes.js loaded (FINAL SINGLE SOURCE)");

/* ===================================================
   SAFE STRIPE LOADER
=================================================== */
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
  return require("stripe")(key);
}

/* ===================================================
   HELPERS
=================================================== */
function nowMs() {
  return Date.now();
}

function randomToken() {
  return crypto.randomBytes(24).toString("hex"); // 48 chars
}

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function toTs(sec) {
  if (sec === null || sec === undefined) return null;
  const n = typeof sec === "string" ? Number(sec) : sec;
  if (!Number.isFinite(n) || n <= 0) return null;
  return admin.firestore.Timestamp.fromMillis(n * 1000);
}

function daysRemainingFromSec(sec) {
  if (sec === null || sec === undefined) return null;
  const n = typeof sec === "string" ? Number(sec) : sec;
  if (!Number.isFinite(n) || n <= 0) return null;
  const diff = n * 1000 - Date.now();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function jst(ms) {
  return new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function getPublicServerBaseUrl(req) {
  const env = process.env.PUBLIC_SERVER_BASE_URL;
  if (env) return env.replace(/\/+$/, "");

  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

// short signed URL generated PER download click
async function createSignedDownloadUrlShort(storagePath, sessionId, isPhoto) {
  const bucket = admin.storage().bucket();
  const filename = isPhoto ? `TownCapture_${sessionId}.jpg` : `TownCapture_${sessionId}.mp4`;

  const [url] = await bucket.file(storagePath).getSignedUrl({
    action: "read",
    expires: Date.now() + 5 * 60 * 1000, // 5 minutes
    responseDisposition: `attachment; filename="${filename}"`,
  });

  return url;
}

function send404(res) {
  return sendExpired(res, "invalid");
}

function sendExpired(res, reason = "expired") {
  const title =
    reason === "max"
      ? "ダウンロード上限に達しました"
      : reason === "expired"
      ? "リンクの有効期限が切れました"
      : "リンクが無効です";

  const msg =
    reason === "max"
      ? "このリンクは最大回数（3回）に達しました。"
      : reason === "expired"
      ? "このリンクは1時間の有効期限が切れました。"
      : "このリンクは無効です。";

  return res.status(404).send(`<!doctype html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a}
  .wrap{min-height:100vh;display:grid;place-items:center;padding:24px}
  .card{max-width:560px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;box-shadow:0 18px 50px rgba(15,23,42,.10)}
  h1{margin:0 0 6px;font-size:18px}
  p{margin:0;color:#64748b;line-height:1.6}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${title}</h1>
      <p>${msg}<br/>必要であれば、もう一度撮影・決済してください。</p>
    </div>
  </div>
</body>
</html>`);
}

/* ===================================================
   COOKIE NONCE (ANTI PREFETCH / SAFE POST)
=================================================== */
const DL_COOKIE_NAME = "tc_dl";

function buildDlNonce(token) {
  const rnd = randomToken();
  const sig = sha256(`${token}:${rnd}`);
  return `${rnd}.${sig}`;
}

function verifyDlNonce(token, nonceValue) {
  if (!nonceValue || typeof nonceValue !== "string") return false;
  const parts = nonceValue.split(".");
  if (parts.length !== 2) return false;
  const [rnd, sig] = parts;
  if (!rnd || !sig) return false;
  const expected = sha256(`${token}:${rnd}`);
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function setDlCookie(res, token) {
  const value = buildDlNonce(token);
  res.cookie(DL_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 1000,
    path: "/stripe/dl",
  });
}

function clearDlCookie(res) {
  res.clearCookie(DL_COOKIE_NAME, { path: "/stripe/dl" });
}

/* ===================================================
   WEBHOOK IDEMPOTENCY
=================================================== */
async function claimEventOnce(eventId) {
  const db = admin.firestore();
  const ref = db.collection("stripeEvents").doc(eventId);

  try {
    await ref.create({
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  } catch (e) {
    if (String(e?.code) === "6" || /already exists/i.test(String(e?.message))) {
      return false;
    }
    throw e;
  }
}

/* ===================================================
   SUBSCRIPTION MAPPING
   stripeSubs/{subscriptionId} => { clientId, cameraId }
=================================================== */
async function setSubMap(subscriptionId, clientId, cameraId) {
  const db = admin.firestore();
  await db.collection("stripeSubs").doc(subscriptionId).set(
    {
      subscriptionId,
      clientId,
      cameraId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function getSubMap(subscriptionId) {
  const db = admin.firestore();
  const snap = await db.collection("stripeSubs").doc(subscriptionId).get();
  return snap.exists ? snap.data() || null : null;
}

async function deleteSubMap(subscriptionId) {
  const db = admin.firestore();
  await db.collection("stripeSubs").doc(subscriptionId).delete().catch(() => {});
}

/* ===================================================
   B2C — MARK PAID (CONTROLLED DOWNLOAD TOKEN)
=================================================== */
async function markCapturePaid({ checkoutSessionObj, eventType, reqForEmailLink }) {
  const db = admin.firestore();
  const sessionId = checkoutSessionObj?.metadata?.sessionId;
  if (!sessionId) return;

  const ref = db.collection("captureSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data() || {};

  // idempotent
  if (data.phase === "paid") {
    console.log("ℹ️ Already paid:", sessionId);
    return;
  }

  // optional expiry guard
  if (data.paidExpiresAt && Date.now() > data.paidExpiresAt) {
    console.warn("⚠️ Payment arrived after expiry:", sessionId);
    return;
  }

  const expiresAt = nowMs() + 60 * 60 * 1000;
  const maxDownloads = 3;

  const captureType = String(data.captureType || "video");
  const isPhoto = captureType === "photo";

  // create download token (store useful metadata too)
  const token = randomToken();
  await db.collection("downloadTokens").doc(token).set({
    token,
    sessionId,
    clientId: data.clientId || checkoutSessionObj?.metadata?.clientId || null,
    cameraId: data.cameraId || checkoutSessionObj?.metadata?.cameraId || null,
    expiresAt,
    maxDownloads,
    downloadCount: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const email = data.endUserEmail || checkoutSessionObj?.customer_details?.email || null;

  await ref.set(
    {
      phase: "paid",
      paid: true,

      // legacy sync
      paymentPhase: "paid",

      paymentStatus: "active",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      paidExpiresAt: expiresAt,

      // ✅ extend file life to 1 hour from payment time
      deleteAfter: expiresAt,

      downloadToken: token,
      downloadCount: 0,
      downloadMax: maxDownloads,

      stripeCheckoutId: checkoutSessionObj.id,
      stripePaymentIntent: checkoutSessionObj.payment_intent || null,
      paidEventType: eventType,
      paidMethod: checkoutSessionObj.payment_method_types?.[0] || null,
    },
    { merge: true }
  );

  // Email download landing
  if (email) {
    try {
      const subject = isPhoto ? "📸 Your Town Capture photo is ready" : "🎥 Your Town Capture video is ready";

      const base = process.env.PUBLIC_SERVER_BASE_URL
        ? process.env.PUBLIC_SERVER_BASE_URL.replace(/\/+$/, "")
        : reqForEmailLink
        ? getPublicServerBaseUrl(reqForEmailLink)
        : null;

      if (!base) console.warn("⚠️ PUBLIC_SERVER_BASE_URL missing. Email link may be wrong.");

      const downloadPageUrl = `${base}/stripe/dl/${token}`;

      await sendMail(
        email,
        subject,
        `
          <h2>Your ${isPhoto ? "photo" : "video"} is ready</h2>
          <p>✅ Download available for <b>1 hour</b> / max <b>3 times</b>.</p>
          <p><a href="${downloadPageUrl}">Download here</a></p>
          <p>⏰ Available until: ${jst(expiresAt)}</p>
        `
      );
    } catch (e) {
      console.error("⚠️ Email send failed:", e.message);
    }
  }

  console.log("✅ Capture marked paid:", sessionId, "via", eventType);
}

/* ===================================================
   B2C — MARK FAILED / EXPIRED (CHECKOUT SESSION)
=================================================== */
async function markCaptureFailedByCheckoutSession(checkoutSessionObj, eventType) {
  const db = admin.firestore();
  const sessionId = checkoutSessionObj?.metadata?.sessionId;
  if (!sessionId) return;

  const ref = db.collection("captureSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data() || {};
  if (data.phase === "paid") return;

  const expiresAt = nowMs() + 60 * 60 * 1000;
  const isExpired = eventType === "checkout.session.expired";

  await ref.set(
    {
      phase: isExpired ? "expired" : "payment_failed",
      paymentPhase: isExpired ? "expired" : "failed",
      paidExpiresAt: expiresAt,
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
      failedEventType: eventType,
      stripeCheckoutId: checkoutSessionObj.id,
      stripePaymentIntent: checkoutSessionObj.payment_intent || null,
    },
    { merge: true }
  );

  console.log("⚠️ Capture marked failed/expired:", sessionId, "via", eventType);
}

/* ===================================================
   B2C — MARK FAILED (PAYMENT INTENT)
=================================================== */
async function markCaptureFailedByPaymentIntent(piObj) {
  const db = admin.firestore();
  const sessionId = piObj?.metadata?.sessionId;
  if (!sessionId) return;

  const ref = db.collection("captureSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data() || {};
  if (data.phase === "paid") return;

  const expiresAt = nowMs() + 60 * 60 * 1000;

  await ref.set(
    {
      phase: "payment_failed",
      paymentPhase: "failed",
      paidExpiresAt: expiresAt,
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
      stripePaymentIntent: piObj.id,
      lastPaymentError: piObj.last_payment_error?.message || null,
    },
    { merge: true }
  );

  console.log("⚠️ payment_intent.payment_failed:", sessionId);
}

/* ===================================================
   B2B — invoice sync (reliable)
=================================================== */
async function syncInvoicesForSubscription({ stripe, camRef, subscriptionId }) {
  const invoices = await stripe.invoices.list({ subscription: subscriptionId, limit: 10 });

  for (const inv of invoices.data) {
    const periodEnd = inv.lines?.data?.[0]?.period?.end ?? inv.period_end ?? null;

    await camRef.collection("invoices").doc(inv.id).set(
      {
        invoiceId: inv.id,
        subscriptionId,
        customerId: inv.customer || null,
        amountPaid: inv.amount_paid ?? null,
        amountDue: inv.amount_due ?? null,
        currency: inv.currency || null,
        status: inv.status || null,
        hostedInvoiceUrl: inv.hosted_invoice_url || null,
        invoicePdf: inv.invoice_pdf || null,
        periodEnd: toTs(periodEnd),
        createdAt: toTs(inv.created),
        paidAt: toTs(inv.status_transitions?.paid_at),
      },
      { merge: true }
    );
  }

  console.log(`📄 ${invoices.data.length} invoice(s) synced for sub ${subscriptionId}`);
}

/* ===================================================
   CREATE CHECKOUT SESSION (B2B SUBSCRIPTION)
=================================================== */
router.post("/create-checkout-session", async (req, res) => {
  try {
    const stripe = getStripe();
    const { cameraId, priceId, clientId } = req.body;

    if (!cameraId || !priceId || !clientId) {
      return res.status(400).json({ error: "cameraId, priceId, clientId are required" });
    }

    const camRef = admin.firestore().collection("clients").doc(clientId).collection("cameras").doc(cameraId);
    const camSnap = await camRef.get();
    if (!camSnap.exists) return res.status(404).json({ error: "Camera not found" });

    const cam = camSnap.data() || {};
    if (cam.paymentStatus === "active") return res.status(400).json({ error: "Camera already active" });

    const base = process.env.FRONTEND_BASE_URL;
    if (!base) return res.status(500).json({ error: "FRONTEND_BASE_URL missing" });

    const successUrl = `${base}/${clientId}/dashboard?success=1`;
    const cancelUrl = `${base}/${clientId}/dashboard?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { cameraId, clientId },
      subscription_data: { metadata: { cameraId, clientId } },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("❌ create-checkout-session error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ===================================================
   CONTROLLED DOWNLOAD (EMAIL LINK)
   GET /stripe/dl/:token      -> landing page (no count)
   POST /stripe/dl/:token/go  -> requires cookie nonce + consumes count + redirect
=================================================== */
router.get("/dl/:token", async (req, res) => {
  const { token } = req.params;
  if (!token) return send404(res);

  const db = admin.firestore();
  const tokenRef = db.collection("downloadTokens").doc(token);
  const snap = await tokenRef.get();
  if (!snap.exists) return send404(res);

  const t = snap.data() || {};
  const expired = !t.expiresAt || nowMs() > t.expiresAt;
  const usedUp = (t.downloadCount || 0) >= (t.maxDownloads || 3);

  if (expired) return sendExpired(res, "expired");
  if (usedUp) return sendExpired(res, "max");

  const left = (t.maxDownloads || 3) - (t.downloadCount || 0);
  const until = t.expiresAt ? jst(t.expiresAt) : "—";

  setDlCookie(res, token);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>保存</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a}
  .wrap{min-height:100vh;display:grid;place-items:center;padding:18px}
  .card{max-width:520px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,.12)}
  .head{padding:16px 16px 10px;text-align:center;font-weight:900}
  .meta{padding:12px 16px;color:#64748b;font-size:13px;line-height:1.6;border-top:1px solid #e2e8f0}
  .btn{display:block;width:calc(100% - 32px);margin:14px auto 16px;background:#00c853;color:#fff;text-align:center;
    text-decoration:none;font-weight:900;border-radius:14px;padding:14px 12px;box-shadow:0 16px 40px rgba(0,200,83,.25); border:none; cursor:pointer}
  .warn{padding:0 16px 16px;text-align:center;color:#ef4444;font-weight:900;font-size:12px}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="head">保存</div>
      <form method="POST" action="/stripe/dl/${token}/go">
        <button class="btn" type="submit">ダウンロード</button>
      </form>
      <div class="meta">
        有効期限：${until}<br/>
        残り回数：${left} 回
      </div>
      <div class="warn">※ 有効期限は1時間で、最大3回まで可能です。</div>
    </div>
  </div>
</body>
</html>`);
});

router.get("/dl/:token/go", (req, res) => {
  return res.status(405).send("Method Not Allowed");
});

router.post("/dl/:token/go", async (req, res) => {
  const { token } = req.params;
  if (!token) return send404(res);

  // require cookie nonce
  const cookieVal = req.cookies?.[DL_COOKIE_NAME];
  const okNonce = verifyDlNonce(token, cookieVal);
  if (!okNonce) return sendExpired(res, "invalid");

  const db = admin.firestore();
  const tokenRef = db.collection("downloadTokens").doc(token);

  try {
    const result = await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(tokenRef);
      if (!tSnap.exists) return { ok: false, reason: "invalid" };

      const t = tSnap.data() || {};
      const expiresAt = t.expiresAt || 0;
      const max = t.maxDownloads || 3;
      const count = t.downloadCount || 0;

      if (!expiresAt || nowMs() > expiresAt) return { ok: false, reason: "expired" };
      if (count >= max) return { ok: false, reason: "max" };
      if (!t.sessionId) return { ok: false, reason: "invalid" };

      const sRef = db.collection("captureSessions").doc(t.sessionId);
      const sSnap = await tx.get(sRef);
      if (!sSnap.exists) return { ok: false, reason: "invalid" };

      const s = sSnap.data() || {};
      if (s.phase !== "paid" && s.paid !== true) return { ok: false, reason: "invalid" };

      // ✅ SECURITY: Must use originalPath (NEW). Do NOT allow previewPath.
      if (!s.originalPath) return { ok: false, reason: "invalid" };

      // consume 1 download
      tx.update(tokenRef, {
        downloadCount: count + 1,
        lastDownloadedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        sessionId: t.sessionId,
        storagePath: s.originalPath, // <<<< changed
        captureType: String(s.captureType || "video"),
      };
    });

    if (!result.ok) return sendExpired(res, result.reason || "invalid");

    clearDlCookie(res);

    const isPhoto = result.captureType === "photo";
    const url = await createSignedDownloadUrlShort(result.storagePath, result.sessionId, isPhoto);

    return res.redirect(302, url);
  } catch (e) {
    console.error("❌ /dl/:token/go error:", e);
    return send404(res);
  }
});

/* ===================================================
   STRIPE WEBHOOK (SINGLE)
=================================================== */
router.post("/webhook", async (req, res) => {
  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature error:", err.message);
    return res.status(400).send("Webhook signature error");
  }

  // Idempotency
  try {
    const first = await claimEventOnce(event.id);
    if (!first) {
      console.log("ℹ️ Duplicate event ignored:", event.id, event.type);
      return res.json({ received: true, duplicate: true });
    }
  } catch (e) {
    console.error("❌ Idempotency failure:", e);
    return res.status(500).send("Idempotency failure");
  }

  const db = admin.firestore();
  const type = event.type;
  const obj = event.data.object;

  console.log("📩 STRIPE EVENT:", type);

  try {
    /* ================= B2C checkout payment ================= */
    const isCheckoutPayment = obj?.object === "checkout.session" && obj?.mode === "payment";

    if (isCheckoutPayment) {
      if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
        await markCapturePaid({
          checkoutSessionObj: obj,
          eventType: type,
          reqForEmailLink: req,
        });
        return res.json({ received: true });
      }

      if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") {
        await markCaptureFailedByCheckoutSession(obj, type);
        return res.json({ received: true });
      }
    }

    if (type === "payment_intent.payment_failed") {
      await markCaptureFailedByPaymentIntent(obj);
      return res.json({ received: true });
    }

    /* ================= B2B activation ================= */
    if (type === "checkout.session.completed" && obj?.mode === "subscription") {
      const { cameraId, clientId } = obj.metadata || {};
      const subscriptionId = obj.subscription;

      if (!cameraId || !clientId || !subscriptionId) {
        console.error("❌ Missing checkout metadata for B2B activation", { cameraId, clientId, subscriptionId });
        return res.json({ received: true });
      }

      const camRef = db.collection("clients").doc(clientId).collection("cameras").doc(cameraId);
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      await setSubMap(subscriptionId, clientId, cameraId);

      const camSnap = await camRef.get();
      const cam = camSnap.exists ? camSnap.data() || {} : {};

      const needsBillingFix =
        !cam.nextBillingDate || cam.daysRemaining === null || cam.daysRemaining === undefined;

      if (cam.paymentStatus !== "active" || needsBillingFix) {
        await camRef.set(
          {
            cameraId,
            paymentStatus: "active",
            status: sub.cancel_at_period_end ? "Canceling" : "Active",
            subscriptionId,
            customerId: sub.customer || null,
            cancelAtPeriodEnd: !!sub.cancel_at_period_end,
            cancelEffectiveDate: sub.cancel_at_period_end ? toTs(sub.current_period_end) : null,

            nextBillingDate: toTs(sub.current_period_end),
            daysRemaining: daysRemainingFromSec(sub.current_period_end),

            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(cam.paymentStatus !== "active"
              ? { activatedAt: admin.firestore.FieldValue.serverTimestamp() }
              : {}),
          },
          { merge: true }
        );

        console.log("✅ B2B subscription ACTIVE + billing fields ensured:", subscriptionId);
      } else {
        console.log("ℹ️ Already active and billing ok, skipping activation");
      }

      await syncInvoicesForSubscription({ stripe, camRef, subscriptionId });
      return res.json({ received: true });
    }

    /* ================= B2B invoice paid ================= */
    if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
      const subId = obj.subscription;
      if (!subId) return res.json({ received: true });

      const map = await getSubMap(subId);
      if (!map?.clientId || !map?.cameraId) {
        console.warn("⚠️ invoice event: missing stripeSubs mapping for", subId);
        return res.json({ received: true });
      }

      const { clientId, cameraId } = map;

      const camRef = db.collection("clients").doc(clientId).collection("cameras").doc(cameraId);
      const sub = await stripe.subscriptions.retrieve(subId);

      const periodEndSec =
        obj.lines?.data?.[0]?.period?.end ?? obj.period_end ?? sub.current_period_end ?? null;

      const nextBillingDate = toTs(periodEndSec);
      const daysRemaining = daysRemainingFromSec(periodEndSec);

      await camRef.set(
        {
          paymentStatus: "active",
          status: sub.cancel_at_period_end ? "Canceling" : "Active",
          subscriptionId: sub.id,
          customerId: obj.customer || sub.customer || null,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          cancelEffectiveDate: sub.cancel_at_period_end ? toTs(sub.current_period_end) : null,

          ...(nextBillingDate ? { nextBillingDate } : {}),
          ...(daysRemaining !== null ? { daysRemaining } : {}),

          lastInvoiceId: obj.id,
          lastPaidAt: toTs(obj.status_transitions?.paid_at),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const invPeriodEnd = obj.lines?.data?.[0]?.period?.end ?? obj.period_end ?? null;

      await camRef.collection("invoices").doc(obj.id).set(
        {
          invoiceId: obj.id,
          subscriptionId: sub.id,
          customerId: obj.customer || null,
          amountPaid: obj.amount_paid ?? null,
          amountDue: obj.amount_due ?? null,
          currency: obj.currency || null,
          status: obj.status || null,
          hostedInvoiceUrl: obj.hosted_invoice_url || null,
          invoicePdf: obj.invoice_pdf || null,
          periodEnd: toTs(invPeriodEnd),
          createdAt: toTs(obj.created),
          paidAt: toTs(obj.status_transitions?.paid_at),
        },
        { merge: true }
      );

      console.log("✅ Monthly invoice stored:", obj.id, "camera:", cameraId);
      return res.json({ received: true });
    }

    /* ================= B2B subscription updated ================= */
    if (type === "customer.subscription.updated") {
      const sub = obj;
      const map = await getSubMap(sub.id);
      if (!map?.clientId || !map?.cameraId) {
        console.warn("⚠️ subscription.updated missing mapping for", sub.id);
        return res.json({ received: true });
      }

      const camRef = db.collection("clients").doc(map.clientId).collection("cameras").doc(map.cameraId);

      const cancelAtPeriodEnd = !!sub.cancel_at_period_end;

      await camRef.set(
        {
          cancelAtPeriodEnd,
          paymentStatus: "active",
          status: cancelAtPeriodEnd ? "Canceling" : "Active",
          nextBillingDate: toTs(sub.current_period_end),
          daysRemaining: daysRemainingFromSec(sub.current_period_end),
          cancelEffectiveDate: cancelAtPeriodEnd ? toTs(sub.current_period_end) : null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.json({ received: true });
    }

    /* ================= B2B subscription deleted ================= */
    if (type === "customer.subscription.deleted") {
      const subId = obj.id;

      const map = await getSubMap(subId);
      if (!map?.clientId || !map?.cameraId) {
        console.warn("⚠️ subscription.deleted missing mapping for", subId);
        return res.json({ received: true });
      }

      const camRef = db.collection("clients").doc(map.clientId).collection("cameras").doc(map.cameraId);

      await camRef.set(
        {
          paymentStatus: "inactive",
          status: "Inactive",
          subscriptionId: null,
          customerId: null,
          nextBillingDate: null,
          daysRemaining: null,
          cancelAtPeriodEnd: false,
          cancelEffectiveDate: null,
          canceledAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await deleteSubMap(subId);

      console.log("🚫 Subscription fully ended:", subId);
      return res.json({ received: true });
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
});

/* ===================================================
   GET INVOICE PDF URL (B2B)
=================================================== */
router.post("/invoice-pdf-url", async (req, res) => {
  try {
    const stripe = getStripe();
    const { cameraId, invoiceId, clientId } = req.body || {};

    if (!cameraId || !invoiceId || !clientId) {
      return res.status(400).json({ error: "cameraId, invoiceId, clientId are required" });
    }

    const camRef = admin.firestore().collection("clients").doc(clientId).collection("cameras").doc(cameraId);

    const invRef = camRef.collection("invoices").doc(invoiceId);
    const invSnap = await invRef.get();

    if (!invSnap.exists) return res.status(404).json({ error: "Invoice not found in Firestore" });

    const invData = invSnap.data() || {};
    if (invData.invoicePdf) return res.json({ url: invData.invoicePdf });
    if (invData.hostedInvoiceUrl) return res.json({ url: invData.hostedInvoiceUrl });

    const invoice = await stripe.invoices.retrieve(invoiceId);
    const url = invoice.invoice_pdf || invoice.hosted_invoice_url;
    if (!url) return res.status(404).json({ error: "Stripe invoice has no PDF URL" });

    await invRef.set(
      {
        invoicePdf: invoice.invoice_pdf || null,
        hostedInvoiceUrl: invoice.hosted_invoice_url || null,
      },
      { merge: true }
    );

    return res.json({ url });
  } catch (err) {
    console.error("❌ invoice-pdf-url error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ===================================================
   CANCEL SUBSCRIPTION (B2B)
=================================================== */
router.post("/cancel-subscription", async (req, res) => {
  try {
    const stripe = getStripe();
    const db = admin.firestore();

    const { cameraId, clientId, atPeriodEnd = true } = req.body || {};
    if (!cameraId || !clientId) return res.status(400).json({ ok: false, error: "cameraId and clientId are required" });

    const camRef = db.collection("clients").doc(clientId).collection("cameras").doc(cameraId);
    const camSnap = await camRef.get();
    if (!camSnap.exists) return res.status(404).json({ ok: false, error: "Camera not found" });

    const cam = camSnap.data() || {};
    const subscriptionId = cam.subscriptionId;
    if (!subscriptionId) return res.status(400).json({ ok: false, error: "No subscriptionId on this camera" });

    if (atPeriodEnd) {
      const updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });

      await camRef.set(
        {
          cancelAtPeriodEnd: true,
          paymentStatus: "active",
          status: "Canceling",
          cancelEffectiveDate: toTs(updated.current_period_end),
          nextBillingDate: toTs(updated.current_period_end),
          daysRemaining: daysRemainingFromSec(updated.current_period_end),
          cancelRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.json({ ok: true, atPeriodEnd: true, subscriptionId, cancelEffectiveDate: updated.current_period_end });
    }

    // immediate cancel
    const canceled = await stripe.subscriptions.cancel(subscriptionId);

    await camRef.set(
      {
        paymentStatus: "inactive",
        status: "Inactive",
        cancelAtPeriodEnd: false,
        cancelEffectiveDate: toTs(canceled.ended_at || canceled.canceled_at),
        nextBillingDate: null,
        daysRemaining: null,
        canceledAt: admin.firestore.FieldValue.serverTimestamp(),
        subscriptionId: null,
        customerId: null,
      },
      { merge: true }
    );

    await deleteSubMap(subscriptionId);

    return res.json({ ok: true, atPeriodEnd: false, subscriptionId });
  } catch (err) {
    console.error("❌ cancel-subscription error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Cancel failed" });
  }
});

module.exports = router;