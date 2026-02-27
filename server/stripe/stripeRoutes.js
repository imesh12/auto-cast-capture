// server/stripe/stripeRoutes.js
const express = require("express");
const admin = require("../firebaseAdmin");
const { getStripe } = require("./stripeClient");
const { toTs, daysRemainingFromSec } = require("./stripeHelpers");

const router = express.Router();

/**
 * SECURITY NOTE (IMPORTANT)
 * In production, DO NOT trust clientId from body.
 * Derive it from auth middleware. For now we accept body for compatibility.
 */

// ---------------------------------------------
// POST /stripe/create-checkout-session (B2B)
// body: { cameraId, priceId, clientId }
// ---------------------------------------------
router.post("/create-checkout-session", async (req, res) => {
  try {
    const stripe = getStripe();
    const db = admin.firestore();

    const { cameraId, priceId, clientId } = req.body || {};
    if (!cameraId || !priceId || !clientId) {
      return res.status(400).json({ error: "cameraId, priceId, clientId are required" });
    }

    const camRef = db.collection("clients").doc(clientId).collection("cameras").doc(cameraId);
    const camSnap = await camRef.get();
    if (!camSnap.exists) return res.status(404).json({ error: "Camera not found" });

    const cam = camSnap.data() || {};
    if (cam.paymentStatus === "active") {
      return res.status(400).json({ error: "Camera already active" });
    }

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

// ---------------------------------------------
// POST /stripe/create-capture-checkout (B2C)
// body: { sessionId, amountJpy, clientId? }  (adjust to your flow)
// You may already have this elsewhere — include only if you need here.
// ---------------------------------------------
// (Optional) You can remove this if you already create B2C checkout in another file.

// ---------------------------------------------
// POST /stripe/invoice-pdf-url (B2B)
// body: { clientId, cameraId, invoiceId }
// ---------------------------------------------
router.post("/invoice-pdf-url", async (req, res) => {
  try {
    const stripe = getStripe();
    const db = admin.firestore();

    const { clientId, cameraId, invoiceId } = req.body || {};
    if (!clientId || !cameraId || !invoiceId) {
      return res.status(400).json({ error: "clientId, cameraId, invoiceId are required" });
    }

    const camRef = db.collection("clients").doc(clientId).collection("cameras").doc(cameraId);
    const invRef = camRef.collection("invoices").doc(invoiceId);

    const invSnap = await invRef.get();
    if (!invSnap.exists) return res.status(404).json({ error: "Invoice not found" });

    const inv = invSnap.data() || {};
    if (inv.invoicePdf) return res.json({ url: inv.invoicePdf });
    if (inv.hostedInvoiceUrl) return res.json({ url: inv.hostedInvoiceUrl });

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

// ---------------------------------------------
// POST /stripe/cancel-subscription (B2B)
// body: { clientId, cameraId, atPeriodEnd?: true|false }
// ---------------------------------------------
router.post("/cancel-subscription", async (req, res) => {
  try {
    const stripe = getStripe();
    const db = admin.firestore();

    const { clientId, cameraId, atPeriodEnd = true } = req.body || {};
    if (!clientId || !cameraId) {
      return res.status(400).json({ ok: false, error: "clientId and cameraId are required" });
    }

    const camRef = db.collection("clients").doc(clientId).collection("cameras").doc(cameraId);
    const camSnap = await camRef.get();
    if (!camSnap.exists) return res.status(404).json({ ok: false, error: "Camera not found" });

    const cam = camSnap.data() || {};
    const subscriptionId = cam.subscriptionId;
    if (!subscriptionId) return res.status(400).json({ ok: false, error: "No subscriptionId on camera" });

    if (atPeriodEnd) {
      const updated = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      await camRef.set(
        {
          cancelAtPeriodEnd: true,
          paymentStatus: "active", // still active until end
          status: "Canceling",
          cancelEffectiveDate: toTs(updated.current_period_end),
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

    // Also remove mapping (best effort)
    await db.collection("stripeSubs").doc(subscriptionId).delete().catch(() => {});

    return res.json({ ok: true, atPeriodEnd: false, subscriptionId });
  } catch (err) {
    console.error("❌ cancel-subscription error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Cancel failed" });
  }
});

module.exports = router;
