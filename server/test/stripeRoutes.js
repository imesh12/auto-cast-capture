/******************************************************
 * stripeRoutes.js — PRODUCTION (FINAL, CLEAN)
 * - B2B: subscription checkout + activation (Checkout event)
 * - B2B: invoice history sync (Stripe API, reliable)
 * - B2C: one-time capture payment (Checkout event)
 * - Subscription canceled
 ******************************************************/

const express = require("express");
const admin = require("firebase-admin");

const router = express.Router();

console.log("✅ stripeRoutes.js loaded");

/* ===================================================
   SAFE STRIPE LOADER
   (Do NOT create stripe at top level)
=================================================== */
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
  return require("stripe")(key);
}

/* ===================================================
   HELPERS
=================================================== */
function toTs(sec) {
  if (sec === null || sec === undefined) return null;

  // Stripe gives seconds as number (sometimes string)
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

/* ===================================================
   CREATE CHECKOUT SESSION (B2B SUBSCRIPTION)
   POST /stripe/create-checkout-session
=================================================== */
router.post("/create-checkout-session", async (req, res) => {
  try {
    const stripe = getStripe();

    const { cameraId, priceId, clientId } = req.body;

    if (!cameraId || !priceId || !clientId) {
      return res.status(400).json({
        error: "cameraId, priceId, clientId are required",
      });
    }

    const camRef = admin
      .firestore()
      .collection("clients")
      .doc(clientId)
      .collection("cameras")
      .doc(cameraId);

    const camSnap = await camRef.get();
    if (!camSnap.exists) return res.status(404).json({ error: "Camera not found" });

    const cam = camSnap.data() || {};
    if (cam.paymentStatus === "active") {
      return res.status(400).json({ error: "Camera already active" });
    }

    const successUrl = `${process.env.FRONTEND_BASE_URL}/${clientId}/dashboard?success=1`;
    const cancelUrl = `${process.env.FRONTEND_BASE_URL}/${clientId}/dashboard?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,

      // ✅ metadata for webhook
      metadata: { cameraId, clientId },
      subscription_data: {
        metadata: { cameraId, clientId },
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("❌ create-checkout-session error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ===================================================
   STRIPE WEBHOOK
   POST /stripe/webhook
   IMPORTANT:
   - server.js MUST mount this with express.raw({type:"application/json"})
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

  const db = admin.firestore();
  const type = event.type;
  const obj = event.data.object;

  console.log("📩 STRIPE EVENT:", type);

  try {
    /* ===================================================
       A) CHECKOUT COMPLETED
       - B2C one-time capture payment
       - B2B subscription activation + invoice sync (✅ reliable)
    =================================================== */
    if (type === "checkout.session.completed") {
      /* ---------------------------
         A1) B2C (one-time payment)
      ---------------------------- */
      if (obj.mode === "payment") {
        const { sessionId } = obj.metadata || {};
        if (!sessionId) {
          console.warn("⚠️ checkout.payment missing metadata.sessionId");
          return res.json({ received: true });
        }

        const ref = db.collection("captureSessions").doc(sessionId);
        const snap = await ref.get();
        if (!snap.exists) {
          console.warn("⚠️ captureSessions not found:", sessionId);
          return res.json({ received: true });
        }

        await ref.set(
          {
            paid: true,
            phase: "paid",
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            stripeCheckoutId: obj.id,
            stripePaymentIntent: obj.payment_intent || null,
          },
          { merge: true }
        );

        console.log("✅ B2C Capture payment confirmed:", sessionId);
        return res.json({ received: true });
      }

      /* ---------------------------
         A2) B2B (subscription)
         ✅ Activate + Sync invoices via Stripe API
      ---------------------------- */
      if (obj.mode === "subscription") {
        const { cameraId, clientId } = obj.metadata || {};
        const subscriptionId = obj.subscription;

        console.log("🧪 checkout subscription payload:", {
          cameraId,
          clientId,
          subscriptionId,
        });

        if (!cameraId || !clientId || !subscriptionId) {
          console.error("❌ Missing checkout metadata for B2B activation", {
            cameraId,
            clientId,
            subscriptionId,
          });
          return res.json({ received: true });
        }

        const camRef = db
          .collection("clients")
          .doc(clientId)
          .collection("cameras")
          .doc(cameraId);

        // Fetch subscription (customer + period end)
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        // ✅ Idempotency guard (don’t double-write on replay)
        const camSnap = await camRef.get();
        const camData = camSnap.exists ? camSnap.data() : null;

        if (camData?.paymentStatus !== "active") {
          await camRef.set(
            {
              cameraId, // 🔥 ADD THIS LINE
              paymentStatus: "active",
              status: "Active",
              subscriptionId,
              customerId: subscription.customer || null,
              nextBillingDate: toTs(subscription.current_period_end),
              daysRemaining: daysRemainingFromSec(subscription.current_period_end),
              activatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          console.log("✅ B2B subscription ACTIVATED (checkout):", subscriptionId);
        } else {
          console.log("ℹ️ Camera already active, skipping activation");
        }

        /* ================================
           ✅ INVOICE SYNC (RELIABLE)
           Stripe Checkout invoice events may not include invoice.subscription.
           So we fetch invoices from Stripe API using subscriptionId.
        ================================= */
        const invoices = await stripe.invoices.list({
          subscription: subscriptionId,
          limit: 10,
        });

        for (const inv of invoices.data) {
          const periodEnd =
            inv.lines?.data?.[0]?.period?.end ?? inv.period_end ?? null;

          await camRef
            .collection("invoices")
            .doc(inv.id)
            .set(
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

        console.log(`📄 ${invoices.data.length} invoice(s) synced to Firestore`);
        return res.json({ received: true });
      }

      return res.json({ received: true });
    }

    /* ===================================================
       B) INVOICE EVENTS (B2B)
       Stripe Checkout often sends invoice.subscription = null.
       We already synced invoices in checkout.session.completed.
       So here we just log & ignore safely.
    =================================================== */
    if (
      type === "invoice.created" ||
      type === "invoice.finalized" ||
      type === "invoice.paid" ||
      type === "invoice.payment_succeeded" ||
      type === "invoice_payment.paid"
    ) {
      console.log("ℹ️ Invoice event received (handled via checkout invoice sync):", obj.id);
      return res.json({ received: true });
    }

    /* ===================================================
       C) SUBSCRIPTION CANCELED
    =================================================== */
    if (type === "customer.subscription.deleted") {
  const snap = await db
    .collectionGroup("cameras")
    .where("subscriptionId", "==", obj.id)
    .get();

  for (const doc of snap.docs) {
    await doc.ref.set(
      {
        paymentStatus: "inactive",
        status: "Inactive",
        subscriptionId: null,
        customerId: null,
        nextBillingDate: null,
        daysRemaining: null,
        cancelAtPeriodEnd: false,
        canceledAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  console.log("🚫 Subscription fully ended:", obj.id);
  return res.json({ received: true });
}


    // ignore all other events
    return res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
});

/* ===================================================
   GET INVOICE PDF URL (B2B)
   POST /stripe/invoice-pdf-url
   Body: { cameraId, invoiceId }
=================================================== */
router.post("/invoice-pdf-url", async (req, res) => {
  try {
    const stripe = getStripe();
    const { cameraId, invoiceId, clientId } = req.body || {};

    if (!cameraId || !invoiceId || !clientId) {
      return res.status(400).json({ error: "cameraId, invoiceId, clientId are required" });
    }

    // Tenant-safe: ensure invoice belongs to this camera under this client
    const camRef = admin.firestore()
      .collection("clients").doc(clientId)
      .collection("cameras").doc(cameraId);

    const invRef = camRef.collection("invoices").doc(invoiceId);
    const invSnap = await invRef.get();

    if (!invSnap.exists) {
      return res.status(404).json({ error: "Invoice not found in Firestore" });
    }

    const invData = invSnap.data() || {};

    // Prefer stored stripe URLs if present
    if (invData.invoicePdf) {
      return res.json({ url: invData.invoicePdf });
    }
    if (invData.hostedInvoiceUrl) {
      return res.json({ url: invData.hostedInvoiceUrl });
    }

    // Otherwise fetch from Stripe
    const invoice = await stripe.invoices.retrieve(invoiceId);
    const url = invoice.invoice_pdf || invoice.hosted_invoice_url;

    if (!url) return res.status(404).json({ error: "Stripe invoice has no PDF URL" });

    // Cache back to Firestore for next time
    await invRef.set(
      { invoicePdf: invoice.invoice_pdf || null, hostedInvoiceUrl: invoice.hosted_invoice_url || null },
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
   POST /stripe/cancel-subscription
   Body: { cameraId, clientId, atPeriodEnd?: true|false }
=================================================== */
router.post("/cancel-subscription", async (req, res) => {
  try {
    const stripe = getStripe();
    const db = admin.firestore();

    const { cameraId, clientId, atPeriodEnd = true } = req.body || {};
    if (!cameraId || !clientId) {
      return res.status(400).json({ ok: false, error: "cameraId and clientId are required" });
    }

    const camRef = db
      .collection("clients")
      .doc(clientId)
      .collection("cameras")
      .doc(cameraId);

    const camSnap = await camRef.get();
    if (!camSnap.exists) {
      return res.status(404).json({ ok: false, error: "Camera not found" });
    }

    const cam = camSnap.data() || {};
    const subscriptionId = cam.subscriptionId;
    if (!subscriptionId) {
      return res.status(400).json({ ok: false, error: "No subscriptionId on this camera" });
    }

    // Get latest subscription to know current_period_end
    const sub = await stripe.subscriptions.retrieve(subscriptionId);

    if (atPeriodEnd) {
      // ✅ cancel at end of billing period (RECOMMENDED)
      const updated = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      // ✅ IMPORTANT: keep paymentStatus active until period end
      await camRef.set(
        {
          cancelAtPeriodEnd: true,
          status: "Canceling", // 解約予定
          // when subscription will actually stop
          cancelEffectiveDate: toTs(updated.current_period_end),
          // keep nextBillingDate visible (same as period end)
          nextBillingDate: toTs(updated.current_period_end),
          daysRemaining: daysRemainingFromSec(updated.current_period_end),
          cancelRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.json({
        ok: true,
        atPeriodEnd: true,
        subscriptionId,
        cancelEffectiveDate: updated.current_period_end,
      });
    }

    // ⚠️ immediate cancel
    const canceled = await stripe.subscriptions.cancel(subscriptionId);

    // Immediate stop => NOW inactive
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

    return res.json({ ok: true, atPeriodEnd: false, subscriptionId });
  } catch (err) {
    console.error("❌ cancel-subscription error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Cancel failed" });
  }
});



module.exports = router;
