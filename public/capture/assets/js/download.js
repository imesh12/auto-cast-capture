// download.js
import { apiJson } from "./api.js";

/**
 * Start payment for a captured session.
 * Backend decides:
 * - FREE mode -> returns { free:true, url: ".../success?sessionId=..." }
 * - Paid mode -> returns { url: "https://checkout.stripe.com/..." }
 */
export async function startPayment(API_BASE, state) {
  if (!state?.sessionId) throw new Error("Missing sessionId");

  // Optional: email capture if you have UI input (recommended)
  // Example: state.email = document.getElementById("emailInput").value
  const email =
    state?.email && String(state.email).trim()
      ? String(state.email).trim()
      : null;

  const payload = {
    sessionId: state.sessionId,
    ...(email ? { email } : {}),
  };

  const p = await apiJson(API_BASE, `/public/create-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!p?.url) throw new Error("Payment session failed");

  // redirect to Stripe checkout OR success page (free mode)
  window.location.href = p.url;
}
