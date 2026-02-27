
 /* stripeWebhook.js — COPY/PASTE (PayPay + Card SAFE)
 * - B2C capture payment (card + paypay async)
 * - B2B subscription billing (invoice.paid)
 * - Subscription canceled
 * - Idempotent / safe updates
 *
 * IMPORTANT:
 * - server.js MUST mount this with express.raw() BEFORE express.json()
 *   Example:
 *   app.post("/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookRouter);
 ******************************************************/

const express = require("express");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { sendMail } = require("../mailer");

const router = express.Router();
const db = admin.firestore();

/* ======================================================
   HELPERS
====================================================== */

function jst(ms) {
  return new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
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

async function createDownloadUrl(storagePath, sessionId, isPhoto) {
  const bucket = admin.storage().bucket();

  const filename = isPhoto
    ? `TownCapture_${sessionId}.jpg`
    : `TownCapture_${sessionId}.mp4`;

  const [url] = await bucket.file(storagePath).getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000, // 1h
    responseDisposition: `attachment; filename="${filename}"`,
  });

  return url;
}

async function markCapturePaid({ checkoutSessionObj, eventType }) {
  const sessionId = checkoutSessionObj?.metadata?.sessionId;
  if (!sessionId) return;

  const ref = db.collection("captureSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data();

  // ✅ idempotent
  if (data.phase === "paid") {
    console.log("ℹ️ Already paid:", sessionId);
    return;
  }

  // Optional: if you have an expiry guard (keep it if you use it)
  if (data.paidExpiresAt && Date.now() > data.paidExpiresAt) {
    console.warn("⚠️ Payment arrived after expiry:", sessionId);
    return;
  }

  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

  const captureType = String(data.captureType || "video");
  const isPhoto = captureType === "photo";

  let downloadUrl = null;
  if (data.storagePath) {
    downloadUrl = await createDownloadUrl(data.storagePath, sessionId, isPhoto);
  }

  const email =
    data.endUserEmail ||
    checkoutSessionObj?.customer_details?.email ||
    null;

  await ref.set(
    {
      phase: "paid",
      paid: true,
      paymentStatus: "active",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      paidExpiresAt: expiresAt,
      downloadUrl,

      // Stripe refs
      stripeCheckoutId: checkoutSessionObj.id,
      stripePaymentIntent: checkoutSessionObj.payment_intent,

      // Debug
      paidEventType: eventType,
      paidMethod: checkoutSessionObj.payment_method_types?.[0] || null,
    },
    { merge: true }
  );

  // Email user (optional)
  if (email && downloadUrl) {
    try {
      const subject = isPhoto
        ? "📸 Your Town Capture photo is ready"
        : "🎥 Your Town Capture video is ready";

      await sendMail(
        email,
        subject,
        `
          <h2>Your ${isPhoto ? "photo" : "video"} is ready</h2>
          <p><b>Download link:</b></p>
          <a href="${downloadUrl}">${downloadUrl}</a>
          <p>⏰ Available until: ${jst(expiresAt)}</p>
          <p>This link will expire automatically.</p>
        `
      );
    } catch (e) {
      console.error("⚠️ Email send failed:", e.message);
    }
  }

  console.log("✅ Capture marked paid:", sessionId, "via", eventType);
}

async function markCaptureFailedByCheckoutSession(checkoutSessionObj, eventType) {
  const sessionId = checkoutSessionObj?.metadata?.sessionId;
  if (!sessionId) return;

  const ref = db.collection("captureSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data();

  // Ignore if already paid
  if (data.phase === "paid") return;

  const expiresAt = Date.now() + 60 * 60 * 1000;

  await ref.set(
    {
      phase: "payment_failed",
      paidExpiresAt: expiresAt,
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
      failedEventType: eventType,
      stripeCheckoutId: checkoutSessionObj.id,
      stripePaymentIntent: checkoutSessionObj.payment_intent,
    },
    { merge: true }
  );

  // Optional: email retry link if you keep checkoutUrl in session doc
  if (data.endUserEmail && data.checkoutUrl) {
    try {
      await sendMail(
        data.endUserEmail,
        "❌ Payment failed – capture reserved",
        `
          <h2>Payment failed</h2>
          <p>Your capture is reserved for 1 hour.</p>
          <p><b>Retry payment:</b></p>
          <a href="${data.checkoutUrl}">${data.checkoutUrl}</a>
          <p>⏰ Expires at: ${jst(expiresAt)}</p>
        `
      );
    } catch (e) {
      console.error("⚠️ Email send failed (failed notice):", e.message);
    }
  }

  console.log("⚠️ Capture marked failed:", sessionId, "via", eventType);
}

async function markCaptureFailedByPaymentIntent(piObj) {
  const sessionId = piObj?.metadata?.sessionId;
  if (!sessionId) return;

  const ref = db.collection("captureSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data();

  // Ignore if already paid
  if (data.phase === "paid") return;

  const expiresAt = Date.now() + 60 * 60 * 1000;

  await ref.set(
    {
      phase: "payment_failed",
      paidExpiresAt: expiresAt,
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
      stripePaymentIntent: piObj.id,
      lastPaymentError: piObj.last_payment_error?.message || null,
    },
    { merge: true }
  );

  console.log("⚠️ payment_intent.payment_failed:", sessionId);
}

/* ======================================================
   WEBHOOK (RAW BODY REQUIRED)
====================================================== */

router.post("/", async (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Stripe signature error:", err.message);
    return res.status(400).send("Webhook Error");
  }

  const type = event.type;
  const obj = event.data.object;

  console.log("📩 Stripe Event:", type);

  try {
    /* =====================================================
       B2C — Checkout (Card + PayPay)
       - PayPay may be async:
         - checkout.session.async_payment_succeeded
         - checkout.session.async_payment_failed
    ===================================================== */

    const isCheckoutPayment =
      obj?.object === "checkout.session" &&
      obj?.mode === "payment";

    // SUCCESS (card + async methods)
    if (
      isCheckoutPayment &&
      (type === "checkout.session.completed" ||
        type === "checkout.session.async_payment_succeeded")
    ) {
      await markCapturePaid({ checkoutSessionObj: obj, eventType: type });
      return res.json({ received: true });
    }

    // ASYNC FAILED (PayPay etc.)
    if (isCheckoutPayment && type === "checkout.session.async_payment_failed") {
      await markCaptureFailedByCheckoutSession(obj, type);
      return res.json({ received: true });
    }

    /* =====================================================
       PAYMENT FAILED (fallback)
       - Some flows emit payment_intent.payment_failed
    ===================================================== */
    if (type === "payment_intent.payment_failed") {
      await markCaptureFailedByPaymentIntent(obj);
      return res.json({ received: true });
    }

    /* =====================================================
       B2B SUBSCRIPTION (MONTHLY)
       - update camera nextBillingDate
       - save invoice into Firestore
    ===================================================== */
    if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
      const subId = obj.subscription;
      if (!subId) return res.json({ received: true });

      // Retrieve subscription to get metadata
      const sub = await stripe.subscriptions.retrieve(subId);
      const { cameraId, clientId } = sub.metadata || {};
      if (!cameraId || !clientId) return res.json({ received: true });

      const periodEnd =
        obj.lines?.data?.[0]?.period?.end ??
        obj.period_end ??
        sub.current_period_end;

      const camRef = db
        .collection("clients")
        .doc(clientId)
        .collection("cameras")
        .doc(cameraId);

      // 1) Update camera status / next billing
      await camRef.set(
        {
          paymentStatus: "active",
          status: "Active",
          subscriptionId: sub.id,
          customerId: obj.customer,
          nextBillingDate: toTs(periodEnd),
          daysRemaining: daysRemainingFromSec(periodEnd),
          lastInvoiceId: obj.id,
          lastPaidAt: toTs(obj.status_transitions?.paid_at),
        },
        { merge: true }
      );

      // 2) Save THIS invoice into Firestore
      const invId = obj.id;

      await camRef
        .collection("invoices")
        .doc(invId)
        .set(
          {
            invoiceId: invId,
            subscriptionId: sub.id,
            customerId: obj.customer || null,
            amountPaid: obj.amount_paid ?? null,
            amountDue: obj.amount_due ?? null,
            currency: obj.currency || null,
            status: obj.status || null,
            hostedInvoiceUrl: obj.hosted_invoice_url || null,
            invoicePdf: obj.invoice_pdf || null,
            periodEnd: toTs(periodEnd),
            createdAt: toTs(obj.created),
            paidAt: toTs(obj.status_transitions?.paid_at),
          },
          { merge: true }
        );

      console.log("✅ Monthly invoice stored:", invId, "camera:", cameraId);
      return res.json({ received: true });
    }


/* =====================================================
   SUBSCRIPTION UPDATED
   - cancel_at_period_end toggled
   - user still ACTIVE until period end
===================================================== */
if (type === "customer.subscription.updated") {
  const sub = obj; // subscription object
  const subId = sub.id;

  const snap = await db
    .collectionGroup("cameras")
    .where("subscriptionId", "==", subId)
    .get();

  for (const d of snap.docs) {
    const cancelAtPeriodEnd = !!sub.cancel_at_period_end;

    await d.ref.set(
      {
        cancelAtPeriodEnd,
        // keep active until it ends
        paymentStatus: "active",
        status: cancelAtPeriodEnd ? "Canceling" : "Active",
        nextBillingDate: toTs(sub.current_period_end),
        daysRemaining: daysRemainingFromSec(sub.current_period_end),
        cancelEffectiveDate: cancelAtPeriodEnd ? toTs(sub.current_period_end) : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return res.json({ received: true });
}

    /* =====================================================
       SUBSCRIPTION CANCELLED
    ===================================================== */
    if (type === "customer.subscription.deleted") {
      const snap = await db
        .collectionGroup("cameras")
        .where("subscriptionId", "==", obj.id)
        .get();

      for (const doc of snap.docs) {
        await doc.ref.set(
          {
            paymentStatus: "inactive",
            subscriptionId: null,
            nextBillingDate: null,
            daysRemaining: null,
          },
          { merge: true }
        );
      }

      console.log("🚫 Subscription cancelled:", obj.id);
      return res.json({ received: true });
    }

    // Not handled: acknowledge
    return res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    return res.status(500).send("Webhook failed");
  }
});

module.exports = router;

