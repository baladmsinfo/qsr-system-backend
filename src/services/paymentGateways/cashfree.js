// Real Cashfree Payment Gateway integration (Orders API, version 2023-08-01).
// Unlike Razorpay, Cashfree's client-side Checkout doesn't hand back a
// signed order/payment/signature triple to verify locally - the documented
// way to confirm a payment is to ask Cashfree's own API for the order's
// current status, so `verifyPaymentSignature` here is async and calls their
// API rather than doing local HMAC math (there is nothing to do HMAC math
// on for this gateway's client flow).
const axios = require("axios");
const crypto = require("crypto");

function baseUrl(config) {
  return config.mode === "live" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
}

function headers(config) {
  return {
    "x-client-id": config.keyId,
    "x-client-secret": config.keySecret,
    "x-api-version": "2023-08-01",
    "Content-Type": "application/json",
  };
}

// amountRupees: Order.totalAmount - Cashfree's Orders API takes amount in
// rupees directly (unlike Razorpay's paise), so no *100 conversion here.
async function createOrder({ config, amountRupees, currency = "INR", receipt, customer = {} }) {
  const res = await axios.post(
    `${baseUrl(config)}/orders`,
    {
      order_id: receipt,
      order_amount: amountRupees,
      order_currency: currency,
      customer_details: {
        customer_id: customer.id || receipt,
        customer_phone: customer.phone || "9999999999",
        customer_name: customer.name || "Guest",
        customer_email: customer.email || undefined,
      },
    },
    { headers: headers(config) }
  );
  // Normalized to the same { id, amount, currency, extra } shape the
  // checkout-flow routes expect from every adapter - `extra.paymentSessionId`
  // is what Cashfree's JS SDK needs to open its Checkout widget.
  return {
    id: res.data.order_id,
    amount: res.data.order_amount,
    currency: res.data.order_currency,
    extra: { paymentSessionId: res.data.payment_session_id },
  };
}

// payload: { gatewayOrderId } - the Cashfree order id returned by
// createOrder/echoed back by the frontend after its Checkout widget closes.
// Confirms payment by asking Cashfree directly rather than trusting the
// browser's redirect outcome, same trust boundary as Razorpay's signature
// check, just via an API call instead of local HMAC verification.
async function verifyPaymentSignature({ config, payload }) {
  const gatewayOrderId = payload?.gatewayOrderId;
  if (!gatewayOrderId) return { valid: false };
  try {
    const res = await axios.get(`${baseUrl(config)}/orders/${gatewayOrderId}`, { headers: headers(config) });
    if (res.data.order_status !== "PAID") return { valid: false };
    const payments = await axios.get(`${baseUrl(config)}/orders/${gatewayOrderId}/payments`, { headers: headers(config) });
    const successfulPayment = (payments.data || []).find((p) => p.payment_status === "SUCCESS");
    if (!successfulPayment) return { valid: false };
    return { valid: true, gatewayPaymentId: String(successfulPayment.cf_payment_id) };
  } catch (err) {
    return { valid: false };
  }
}

// Cashfree signs webhooks with `x-webhook-signature` + `x-webhook-timestamp`
// headers: signature = base64(HMAC_SHA256(timestamp + rawBody, clientSecret)).
// Uses the per-merchant webhookSecret when configured (Cashfree lets a
// merchant set a distinct webhook secret in their dashboard), falling back
// to the client secret since Cashfree's own docs allow signing with either.
function verifyWebhookSignature({ config, rawBody, signature, timestamp }) {
  const secret = config.webhookSecret || config.keySecret;
  if (!secret || !timestamp) return false;
  const expected = crypto.createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
  return expected === signature;
}

module.exports = { createOrder, verifyPaymentSignature, verifyWebhookSignature };
