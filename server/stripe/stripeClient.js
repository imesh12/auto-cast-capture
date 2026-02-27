// server/stripe/stripeClient.js
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
  return require("stripe")(key, {
    apiVersion: "2024-06-20", // OK to omit, but pinning is good for production stability
  });
}

module.exports = { getStripe };
