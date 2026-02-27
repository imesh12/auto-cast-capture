// src/services/stripeService.js
import { loadStripe } from "@stripe/stripe-js";

const stripePublicKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;

//const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
let stripePromise;

function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(stripePublicKey);
  }
  return stripePromise;
}

/**
 * Calls Firebase Cloud Function to create Stripe Checkout Session
 * and redirects user to Stripe-hosted payment page.
 */
export async function startStripeCheckout({ cameraId, captureId, mode }) {
  // mode: "photo" | "video3sec"
  const res = await fetch("/createCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cameraId, captureId, mode }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create checkout session: ${text}`);
  }

  const { sessionId } = await res.json();
  const stripe = await getStripe();
  const { error } = await stripe.redirectToCheckout({ sessionId });

  if (error) {
    throw new Error(error.message);
  }
}
