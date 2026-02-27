// server/stripe/stripeWebhook.js
const express = require("express");
const admin = require("../firebaseAdmin");
const { getStripe } = require("./stripeClient");
const {
  toTs,
  daysRemainingFromSec,
  createSignedDownloadUrl,
  markEventProcessed,
} = require("./stripeHelpers");
const { sendMail } = require("../mailer");

const router = express.Router();

function jst(ms) {
  return new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

// ====== B2C helpers ======
async function markCapturePaid({ checkoutSessionObj, eventType }) {
  const db = admin.firestore();

  const sessionId = checkoutSessionObj?.metadata?.sessionId;
  if (!sessionId) return;

  const ref = db.collection("captureSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data() || {};
  if (data.phase === "paid") {
    console.log("ℹ️ Already paid:", sessionId);
    return;
  }

  // optional expiry guard
  if (data.paidExpiresAt && Date.now() > data.paidExpiresAt) {
    console.warn("⚠️ Payment arrived after expiry:", sessionId);
    return;
  }

  const expiresAt = Date.now() + 60 * 60 * 1000;
  const captureType = String(data.captureType || "video");
  const isPhoto = captureType === "photo";

  let downloadUrl = null;
  if (data.storagePath) {
    downloadUrl = await createSignedDownloadUrl({ storagePath: data.storagePath, sessionId, isPhoto });
  }

  const email = data.endUserEmail || checkoutSessionObj?.customer_details?.email || null;

  await ref.set(
    {
      phase: "paid",
      paid: true,
      paymentStatus: "active",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      paidExpiresAt: expiresAt,
      downloadUrl,

      stripeCheckoutId: checkoutSessionObj.id,
      stripePaymentIntent: checkoutSessionObj.payment_intent || null,

      paidEventType: eventType,
      paidMethod: checkoutSessionObj.payment_method_types?.[0] || null,
    },
    { merge: true }
  );

  // Optional email (safe)
  if (email && downloadUrl) {
    try {
      const subject = isPhoto ? "📸 Your Town Capture photo is ready" : "🎥 Your Town Capture video is ready";
      await sendMail(
        email,
        subject,
        `
          <h2>Your ${isPhoto ? "photo" : "video"} is ready</h2>
          <p><b>Download link:</b></p>
          <a href="${downloadUrl}">${downloadUrl}</a>
          <p>⏰ Available until: ${jst(expiresAt)}</p>
        `
      );
    } catch (e) {
      console.error("⚠️ Email send failed:", e.message);
    }
  }

  console.log("✅ Capture marked paid:", sessionId, "via", eventType);
}

async function markCaptureFailedByCheckoutSession(checkoutSessionObj, eventType) {
  const db = admin.firestore();

  const sessionId = checkoutSessionObj?.metadata?.sessionId;
  if (!sessionId) return;

  const ref = db.collection("captureSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data() || {};
  if (data.phase === "paid") return;

  const expiresAt = Date.now() + 60 * 60 * 1000;

  await ref.set(
    {
      phase: eventType === "checkout.session.expired" ? "expired" : "payment_failed",
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

async function markCaptureFailedByPaymentIntent(piObj) {
  const db = admin.firestore();

  const sessionId = piObj?.metadata?.sessionId;
  if (!sessionId) return;

  const ref = db.collection("captureSessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data() || {};
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

// ====== B2B helpers ======
async function upsertSubscriptionMapping({ subscriptionId, clientId, cameraId }) {
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

async function getMapping(subscriptionId) {
  const db = admin.firestore();
  const snap = await db.collection("stripeSubs").doc(subscriptionId).get();
  return snap.exists ? (snap.data() || null) : null;
}

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

/**
 * POST /stripe/webhook
 * IMPORTANT: must be mounted with express.raw({ type: "application/json" })
 */
router.post("/", async (req, res) => {
  const stripe = getStripe();

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

  // ✅ Idempotency by event.id
  try {
    const firstTime = await markEventProcessed(event.id);
    if (!firstTime) {
      console.log("ℹ️ Duplicate event ignored:", event.id, event.type);
      return res.json({ received: true, duplicate: true });
    }
  } catch (e) {
    console.error("❌ Failed event idempotency store:", e);
    // fail hard so Stripe retries, better than double-processing without guard
    return res.status(500).send("Idempotency failure");
  }

  const type = event.type;
  const obj = event.data.object;

  console.log("📩 Stripe Event:", type);

  try {
    const db = admin.firestore();

    // =====================================================
    // B2C — Checkout (Card + PayPay async)
    // =====================================================
    const isCheckoutPayment = obj?.object === "checkout.session" && obj?.mode === "payment";

    if (isCheckoutPayment) {
      if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
        await markCapturePaid({ checkoutSessionObj: obj, eventType: type });
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

    // =====================================================
    // B2B — Subscription activation (checkout session complete)
    // =====================================================
    if (type === "checkout.session.completed" && obj?.mode === "subscription") {
      const { cameraId, clientId } = obj.metadata || {};
      const subscriptionId = obj.subscription;

      if (!cameraId || !clientId || !subscriptionId) {
        console.error("❌ Missing metadata for subscription activation", { cameraId, clientId, subscriptionId });
        return res.json({ received: true });
      }

      const camRef = db.collection("clients").doc(clientId).collection("cameras").doc(cameraId);

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      // write mapping (O(1) future webhooks)
      await upsertSubscriptionMapping({ subscriptionId, clientId, cameraId });

      // activate camera if not active
      const camSnap = await camRef.get();
      const cam = camSnap.exists ? (camSnap.data() || {}) : {};

      if (cam.paymentStatus !== "active") {
        await camRef.set(
          {
            cameraId,
            paymentStatus: "active",
            status: "Active",
            subscriptionId,
            customerId: subscription.customer || null,
            cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
            cancelEffectiveDate: subscription.cancel_at_period_end ? toTs(subscription.current_period_end) : null,
            nextBillingDate: toTs(subscription.current_period_end),
            daysRemaining: daysRemainingFromSec(subscription.current_period_end),
            activatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        console.log("✅ B2B subscription activated:", subscriptionId);
      }

      // Reliable invoice sync (avoids missing subscription on invoice events)
      await syncInvoicesForSubscription({ stripe, camRef, subscriptionId });

      return res.json({ received: true });
    }

    // =====================================================
    // B2B — invoice paid (monthly)
    // =====================================================
    if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
      const subId = obj.subscription;
      if (!subId) return res.json({ received: true });

      const mapping = await getMapping(subId);
      if (!mapping?.clientId || !mapping?.cameraId) {
        console.warn("⚠️ invoice event missing mapping; subId:", subId);
        return res.json({ received: true });
      }

      const { clientId, cameraId } = mapping;
      const camRef = db.collection("clients").doc(clientId).collection("cameras").doc(cameraId);

      const sub = await stripe.subscriptions.retrieve(subId);
      const periodEnd =
        obj.lines?.data?.[0]?.period?.end ?? obj.period_end ?? sub.current_period_end;

      // update camera
      await camRef.set(
        {
          paymentStatus: "active",
          status: sub.cancel_at_period_end ? "Canceling" : "Active",
          subscriptionId: sub.id,
          customerId: obj.customer || sub.customer || null,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          cancelEffectiveDate: sub.cancel_at_period_end ? toTs(sub.current_period_end) : null,
          nextBillingDate: toTs(periodEnd),
          daysRemaining: daysRemainingFromSec(periodEnd),
          lastInvoiceId: obj.id,
          lastPaidAt: toTs(obj.status_transitions?.paid_at),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // store invoice
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
          periodEnd: toTs(periodEnd),
          createdAt: toTs(obj.created),
          paidAt: toTs(obj.status_transitions?.paid_at),
        },
        { merge: true }
      );

      console.log("✅ Monthly invoice stored:", obj.id, "camera:", cameraId);
      return res.json({ received: true });
    }

    // =====================================================
    // B2B — subscription updated (cancel_at_period_end toggled)
    // =====================================================
    if (type === "customer.subscription.updated") {
      const sub = obj;
      const mapping = await getMapping(sub.id);
      if (!mapping?.clientId || !mapping?.cameraId) {
        console.warn("⚠️ subscription.updated missing mapping:", sub.id);
        return res.json({ received: true });
      }

      const camRef = db.collection("clients").doc(mapping.clientId).collection("cameras").doc(mapping.cameraId);

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

    // =====================================================
    // B2B — subscription deleted (fully ended)
    // =====================================================
    if (type === "customer.subscription.deleted") {
      const subId = obj.id;

      const mapping = await getMapping(subId);
      if (!mapping?.clientId || !mapping?.cameraId) {
        console.warn("⚠️ subscription.deleted missing mapping:", subId);
        return res.json({ received: true });
      }

      const camRef = db.collection("clients").doc(mapping.clientId).collection("cameras").doc(mapping.cameraId);

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

      // remove mapping
      await db.collection("stripeSubs").doc(subId).delete().catch(() => {});

      console.log("🚫 Subscription fully ended:", subId);
      return res.json({ received: true });
    }

    // unhandled events: acknowledge
    return res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    return res.status(500).send("Webhook failed");
  }
});

module.exports = router;
