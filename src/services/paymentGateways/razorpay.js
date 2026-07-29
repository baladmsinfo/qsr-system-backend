// Real Razorpay integration - official Node SDK (`razorpay` package), not a
// raw axios reimplementation of their signing scheme. `axios` is this
// backend's only existing HTTP client, but it has no built-in HMAC/webhook-
// verification helpers, so hand-rolling Razorpay's signature scheme would be
// reinventing what the SDK already gets right.
const Razorpay = require("razorpay");
const crypto = require("crypto");

function client(config) {
  return new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });
}

// amountRupees: the order's real total (Order.totalAmount) - Razorpay's API
// takes amount in the smallest currency unit (paise for INR), not rupees.
async function createOrder({ config, amountRupees, currency = "INR", receipt }) {
  const rzp = client(config);
  return rzp.orders.create({
    amount: Math.round(amountRupees * 100),
    currency,
    receipt,
  });
}

// Confirms a client-side Razorpay Checkout success is genuine - this is what
// stands between "the browser says payment succeeded" and actually trusting
// it. Uses the SDK's own HMAC helper (order_id|payment_id signed with the
// merchant's key_secret) rather than a hand-rolled comparison.
//
// payload: { gatewayOrderId, gatewayPaymentId, signature } - the generic
// names every adapter's verifyPaymentSignature is called with (see
// routes/publicPayments.js); returns the same { valid, gatewayPaymentId }
// shape as every other adapter so the route never branches on provider.
async function verifyPaymentSignature({ config, payload }) {
  const { gatewayOrderId, gatewayPaymentId, signature } = payload || {};
  const body = `${gatewayOrderId}|${gatewayPaymentId}`;
  const expected = crypto.createHmac("sha256", config.keySecret).update(body).digest("hex");
  return expected === signature ? { valid: true, gatewayPaymentId } : { valid: false };
}

// Server-to-server confirmation via Razorpay's webhook (belt-and-suspenders
// alongside verifyPaymentSignature, matching Razorpay's own recommended
// integration pattern of trusting the webhook over the client redirect
// alone) - verifies against the PER-MERCHANT webhookSecret configured in
// Payment Gateway Settings, not a platform-wide secret.
function verifyWebhookSignature({ config, rawBody, signature }) {
  if (!config.webhookSecret) return false;
  const expected = crypto.createHmac("sha256", config.webhookSecret).update(rawBody).digest("hex");
  return expected === signature;
}

module.exports = { createOrder, verifyPaymentSignature, verifyWebhookSignature };
