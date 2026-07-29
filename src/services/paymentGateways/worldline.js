// Worldline (India) integration.
//
// IMPORTANT, disclosed rather than glossed over: unlike Razorpay/Cashfree,
// Worldline India has no single public REST API that every merchant
// integrates against the same way - the exact payment-page URL, request
// field order and response field layout are handed to each merchant in
// their own integration kit at onboarding (they vary by acquiring-bank
// tie-up). What's implemented below is the long-standing, widely documented
// Worldline/TechProcess pattern: a pipe-delimited request string, AES
// encrypted with the merchant's own encryption key, POSTed as a form to
// Worldline's hosted payment page; Worldline redirects/posts back an
// encrypted response in the same shape, which is decrypted with the same
// key. Treat `PAYMENT_PAGE_URL` and the request/response field order below
// as the structural placeholder they are - confirm both against this
// merchant's actual Worldline welcome-kit/integration guide before going
// live with real transactions.
const crypto = require("crypto");

const PAYMENT_PAGE_URL = "https://www.paynimo.com/api/paynimoV2.req"; // confirm against merchant's actual kit

// Worldline's classic scheme derives a 16-byte AES-128 key by MD5-hashing
// the merchant's plaintext encryption key, with a fixed zero IV - documented
// across their integration guides for this product line.
function aesKey(encryptionKey) {
  return crypto.createHash("md5").update(encryptionKey).digest();
}

function encrypt(plainText, encryptionKey) {
  const cipher = crypto.createCipheriv("aes-128-cbc", aesKey(encryptionKey), Buffer.alloc(16, 0));
  return Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]).toString("hex");
}

function decrypt(hexText, encryptionKey) {
  const decipher = crypto.createDecipheriv("aes-128-cbc", aesKey(encryptionKey), Buffer.alloc(16, 0));
  return Buffer.concat([decipher.update(Buffer.from(hexText, "hex")), decipher.final()]).toString("utf8");
}

// amountRupees: Order.totalAmount. returnUrl: where Worldline redirects/
// posts back after payment - required for this gateway (there is no
// client-side widget/callback like Razorpay/Cashfree, it's a full-page
// redirect to a hosted payment page).
async function createOrder({ config, amountRupees, currency = "INR", receipt, returnUrl }) {
  if (!returnUrl) throw new Error("returnUrl is required for Worldline (redirect-based gateway)");

  // Pipe-delimited request layout per the classic Worldline/TechProcess
  // format - field order matters and must match this merchant's kit.
  const requestString = [config.keyId, receipt, amountRupees, currency, returnUrl].join("|");
  const encData = encrypt(requestString, config.keySecret);

  return {
    id: receipt,
    amount: amountRupees,
    currency,
    // Not a JS-widget gateway - the frontend must auto-submit a real HTML
    // form (POST) to actionUrl with these fields, then the browser leaves
    // the SPA entirely until Worldline redirects back to returnUrl.
    extra: { actionUrl: PAYMENT_PAGE_URL, formFields: { merchantId: config.keyId, encData } },
  };
}

function parseResponse(encResp, encryptionKey) {
  const decrypted = decrypt(encResp, encryptionKey);
  const [merchantId, txnRef, status, amount, gatewayPaymentId] = decrypted.split("|");
  return { merchantId, txnRef, status, amount, gatewayPaymentId };
}

// payload: { encResp } - the encrypted response string Worldline appended
// to the returnUrl (query param or POST body depending on this merchant's
// configuration) after the shopper completes/cancels payment on their
// hosted page.
async function verifyPaymentSignature({ config, payload }) {
  const encResp = payload?.encResp;
  if (!encResp) return { valid: false };
  try {
    const parsed = parseResponse(encResp, config.keySecret);
    // Exact success status value/field must be confirmed against this
    // merchant's response-code table - "SUCCESS" is the commonly documented
    // one but acquirer-specific codes exist.
    if (parsed.status !== "SUCCESS") return { valid: false };
    return { valid: true, gatewayPaymentId: parsed.gatewayPaymentId || parsed.txnRef };
  } catch (err) {
    return { valid: false };
  }
}

// Worldline's server-to-server confirmation is the same encrypted-response
// shape as the browser redirect, just posted directly to a merchant-
// configured URL instead of via the shopper's browser - decryption doubles
// as the signature check here, since a payload that fails AES decryption
// (or produces garbage) was never actually encrypted with this merchant's
// key.
function verifyWebhookSignature({ config, rawBody }) {
  try {
    const params = new URLSearchParams(rawBody);
    const encResp = params.get("encResp") || rawBody;
    const parsed = parseResponse(encResp, config.webhookSecret || config.keySecret);
    return parsed.status === "SUCCESS";
  } catch (err) {
    return false;
  }
}

module.exports = { createOrder, verifyPaymentSignature, verifyWebhookSignature };
