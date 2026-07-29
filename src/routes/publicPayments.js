// Real checkout-time payment routes - public (no staff auth; called by the
// customer-facing site while placing/paying for an order), scoped by the
// order's own company rather than a logged-in user.
const { getAdapter, getActiveGatewayConfig } = require("../services/paymentGateways");

async function publicPaymentRoutes(fastify) {
  const prisma = () => fastify.prisma;

  // Shared by /verify and /worldline/return - idempotent (a client retry, a
  // webhook, and a redirect-back can all race to record the same payment;
  // only the first writer wins, the rest just confirm it already happened).
  async function recordPaymentIfMissing({ order, config, gatewayPaymentId, raw }) {
    const existing = await prisma().payment.findUnique({ where: { gatewayPaymentId } });
    if (existing) return existing;
    return prisma().payment.create({
      data: {
        companyId: order.companyId,
        orderId: order.id,
        amount: order.totalAmount,
        method: "OTHER",
        gatewayPaymentId,
        rawResponse: JSON.stringify({ provider: config.provider, raw }),
        note: `Paid online via ${config.provider}`,
      },
    });
  }

  // Scoped to THIS plugin only (Fastify's per-register encapsulation, not
  // global) - captures the raw request body string before JSON parsing,
  // since Razorpay signs the exact raw bytes it sent; parsing then
  // re-stringifying can produce different bytes and silently break
  // signature verification.
  fastify.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    req.rawBody = body;
    try {
      done(null, body.length ? JSON.parse(body) : {});
    } catch (err) {
      done(err);
    }
  });

  // Worldline's redirect/webhook postback is form-encoded, not JSON - same
  // raw-body-capture reasoning as above, since its "signature" check is
  // decrypting the exact bytes posted.
  fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (req, body, done) => {
    req.rawBody = body;
    try {
      done(null, Object.fromEntries(new URLSearchParams(body)));
    } catch (err) {
      done(err);
    }
  });

  // Lets a Website Builder checkout block decide whether to show "Pay
  // Online" at all - never leaks credentials, just a boolean, so a merchant
  // with no gateway configured never gets a fake payment button with
  // nothing behind it.
  fastify.get("/available", async (request, reply) => {
    try {
      const { companyId } = request.query || {};
      if (!companyId) return reply.code(400).send({ statusCode: "01", message: "companyId is required" });
      const config = await getActiveGatewayConfig(prisma(), companyId);
      return reply.send({ statusCode: "00", message: "Checked successfully", data: { available: !!config } });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to check payment availability", error: err.message });
    }
  });

  // returnUrl: only actually used by redirect-based gateways (Worldline) -
  // Razorpay/Cashfree's adapters ignore it, but every gateway is asked for
  // it uniformly so this route never needs to branch on provider.
  fastify.post("/initiate", async (request, reply) => {
    try {
      const { orderId, returnUrl } = request.body || {};
      if (!orderId) return reply.code(400).send({ statusCode: "01", message: "orderId is required" });

      const order = await prisma().order.findUnique({ where: { id: orderId } });
      if (!order) return reply.code(404).send({ statusCode: "99", message: "Order not found" });

      const config = await getActiveGatewayConfig(prisma(), order.companyId);
      if (!config) return reply.code(400).send({ statusCode: "02", message: "No payment gateway is configured for this business" });

      const adapter = getAdapter(config.provider);
      const gatewayOrder = await adapter.createOrder({ config, amountRupees: order.totalAmount, receipt: order.id, returnUrl });

      return reply.send({
        statusCode: "00",
        message: "Payment initiated successfully",
        data: {
          provider: config.provider,
          mode: config.mode,
          keyId: config.keyId,
          gatewayOrderId: gatewayOrder.id,
          amount: gatewayOrder.amount,
          currency: gatewayOrder.currency,
          // Provider-specific extras the frontend widget/redirect needs -
          // e.g. Cashfree's paymentSessionId, Worldline's actionUrl/formFields.
          extra: gatewayOrder.extra || null,
        },
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to initiate payment", error: err.message });
    }
  });

  // payload: opaque, provider-shaped object forwarded straight to that
  // adapter's verifyPaymentSignature - Razorpay expects
  // { gatewayOrderId, gatewayPaymentId, signature }, Cashfree expects
  // { gatewayOrderId }, Worldline expects { encResp }. This route never
  // needs to know which fields those are, only the adapter does.
  fastify.post("/verify", async (request, reply) => {
    try {
      const { orderId, payload } = request.body || {};
      if (!orderId || !payload) {
        return reply.code(400).send({ statusCode: "01", message: "orderId and payload are required" });
      }

      const order = await prisma().order.findUnique({ where: { id: orderId } });
      if (!order) return reply.code(404).send({ statusCode: "99", message: "Order not found" });

      const config = await getActiveGatewayConfig(prisma(), order.companyId);
      if (!config) return reply.code(400).send({ statusCode: "02", message: "No payment gateway is configured for this business" });

      const adapter = getAdapter(config.provider);
      const result = await adapter.verifyPaymentSignature({ config, payload });
      if (!result?.valid || !result.gatewayPaymentId) {
        return reply.code(400).send({ statusCode: "03", message: "Payment verification failed" });
      }

      await recordPaymentIfMissing({ order, config, gatewayPaymentId: result.gatewayPaymentId, raw: payload });

      return reply.send({ statusCode: "00", message: "Payment verified successfully" });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to verify payment", error: err.message });
    }
  });

  // Server-to-server confirmation (belt-and-suspenders alongside /verify,
  // matching Razorpay's own recommended integration pattern of trusting the
  // webhook over the client redirect alone). Verified against the PER-
  // MERCHANT webhookSecret, looked up by orderId embedded in the payload's
  // `receipt` field (set to the order id in /initiate above) - Razorpay
  // webhooks don't carry a companyId, so this is how the right merchant's
  // secret gets found.
  fastify.post("/razorpay/webhook", async (request, reply) => {
    try {
      const signature = request.headers["x-razorpay-signature"];
      const payload = JSON.parse(request.rawBody || "{}");
      const orderEntity = payload?.payload?.payment?.entity;
      const gatewayOrderId = orderEntity?.order_id;
      if (!signature || !gatewayOrderId) return reply.code(400).send({ statusCode: "01", message: "Malformed webhook payload" });

      // Razorpay's order `receipt` was set to our own Order.id in /initiate,
      // but the webhook payload doesn't include it directly - the reliable
      // link back to our Order is the payment's `notes`/`order_id` combined
      // with a Payment row already created via /verify (which runs first in
      // the normal flow, the client redirect happens before the async
      // webhook does). If /verify hasn't landed yet, this webhook can't
      // resolve which merchant's webhookSecret to check against, so it's
      // deferred to /verify being the primary path and this endpoint mainly
      // re-confirms rather than being the first writer.
      const existingPayment = await prisma().payment.findUnique({ where: { gatewayPaymentId: orderEntity.id } });
      if (!existingPayment) return reply.send({ statusCode: "00", message: "Acknowledged - awaiting client verification first" });

      const config = await getActiveGatewayConfig(prisma(), existingPayment.companyId);
      if (!config) return reply.code(400).send({ statusCode: "02", message: "No payment gateway configured" });

      const adapter = getAdapter(config.provider);
      const valid = adapter.verifyWebhookSignature({ config, rawBody: request.rawBody, signature });
      if (!valid) return reply.code(400).send({ statusCode: "03", message: "Webhook signature verification failed" });

      return reply.send({ statusCode: "00", message: "Webhook verified successfully" });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to process webhook", error: err.message });
    }
  });

  // Same "confirm rather than first-write" pattern as Razorpay's webhook
  // above - Cashfree's payload carries its own payment id directly (unlike
  // Razorpay's nested entity), which is what /verify already stored as
  // gatewayPaymentId.
  fastify.post("/cashfree/webhook", async (request, reply) => {
    try {
      const signature = request.headers["x-webhook-signature"];
      const timestamp = request.headers["x-webhook-timestamp"];
      const payload = JSON.parse(request.rawBody || "{}");
      const gatewayPaymentId = payload?.data?.payment?.cf_payment_id && String(payload.data.payment.cf_payment_id);
      if (!signature || !gatewayPaymentId) return reply.code(400).send({ statusCode: "01", message: "Malformed webhook payload" });

      const existingPayment = await prisma().payment.findUnique({ where: { gatewayPaymentId } });
      if (!existingPayment) return reply.send({ statusCode: "00", message: "Acknowledged - awaiting client verification first" });

      const config = await getActiveGatewayConfig(prisma(), existingPayment.companyId);
      if (!config) return reply.code(400).send({ statusCode: "02", message: "No payment gateway configured" });

      const adapter = getAdapter(config.provider);
      const valid = adapter.verifyWebhookSignature({ config, rawBody: request.rawBody, signature, timestamp });
      if (!valid) return reply.code(400).send({ statusCode: "03", message: "Webhook signature verification failed" });

      return reply.send({ statusCode: "00", message: "Webhook verified successfully" });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to process webhook", error: err.message });
    }
  });

  // Worldline has no JSON webhook body like the other two - its
  // server-to-server postback is the same encrypted, form-encoded response
  // string used on the browser redirect (see services/paymentGateways/
  // worldline.js). There's no separate merchant lookup step by gatewayPaymentId
  // first, because decrypting the payload IS the signature check for this
  // gateway - but which merchant's key to decrypt with still has to come
  // from somewhere: Worldline's payload doesn't carry our companyId, so
  // this endpoint only re-confirms a payment /verify already recorded
  // (looked up via the same txnRef Worldline echoes back as its order id),
  // matching the "confirm, don't first-write" pattern used above.
  fastify.post("/worldline/webhook", async (request, reply) => {
    try {
      const params = new URLSearchParams(request.rawBody || "");
      const merchantTxnRef = params.get("txnRef") || params.get("orderId");
      if (!merchantTxnRef) return reply.code(400).send({ statusCode: "01", message: "Malformed webhook payload" });

      const order = await prisma().order.findUnique({ where: { id: merchantTxnRef } });
      if (!order) return reply.send({ statusCode: "00", message: "Acknowledged - unknown order" });

      const config = await getActiveGatewayConfig(prisma(), order.companyId);
      if (!config) return reply.code(400).send({ statusCode: "02", message: "No payment gateway configured" });

      const adapter = getAdapter(config.provider);
      const valid = adapter.verifyWebhookSignature({ config, rawBody: request.rawBody });
      if (!valid) return reply.code(400).send({ statusCode: "03", message: "Webhook signature verification failed" });

      return reply.send({ statusCode: "00", message: "Webhook verified successfully" });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to process webhook", error: err.message });
    }
  });

  // Worldline is redirect-based, not widget-based - there is no client-side
  // "payment succeeded" callback for a SPA to await like Razorpay/Cashfree
  // have. Instead the browser leaves the site entirely; this backend route
  // (not a frontend page) IS the returnUrl passed to Worldline in /initiate,
  // so it's the thing that receives the shopper back. `orderId` and
  // `confirmationUrl` are OUR OWN query params, appended to that returnUrl
  // before handing it to Worldline - real hosted-page gateways echo an
  // unrecognized query string back unchanged, which is what lets this route
  // know which order/company it's resolving without Worldline itself
  // carrying that information. Accepts both GET (query-param redirect) and
  // POST (form postback) since which one a given Worldline merchant setup
  // uses isn't fixed - see the caveat in services/paymentGateways/worldline.js.
  async function handleWorldlineReturn(request, reply) {
    const orderId = request.query?.orderId;
    const confirmationUrl = request.query?.confirmationUrl;
    const encResp = request.query?.encResp || request.body?.encResp;

    function redirectWithStatus(status) {
      if (!confirmationUrl) {
        return reply.send({ statusCode: status === "success" ? "00" : "99", message: `Payment ${status}` });
      }
      const url = new URL(decodeURIComponent(confirmationUrl));
      if (orderId) url.searchParams.set("orderId", orderId);
      url.searchParams.set("paymentStatus", status);
      // Fastify 5's reply.redirect signature is (url, code) - not (code, url).
      return reply.redirect(url.toString(), 302);
    }

    try {
      if (!orderId || !encResp) return redirectWithStatus("failed");

      const order = await prisma().order.findUnique({ where: { id: orderId } });
      if (!order) return redirectWithStatus("failed");

      const config = await getActiveGatewayConfig(prisma(), order.companyId);
      if (!config || config.provider !== "WORLDLINE") return redirectWithStatus("failed");

      const adapter = getAdapter(config.provider);
      const result = await adapter.verifyPaymentSignature({ config, payload: { encResp } });
      if (!result?.valid || !result.gatewayPaymentId) return redirectWithStatus("failed");

      await recordPaymentIfMissing({ order, config, gatewayPaymentId: result.gatewayPaymentId, raw: { encResp } });
      return redirectWithStatus("success");
    } catch (err) {
      request.log.error(err);
      return redirectWithStatus("failed");
    }
  }

  fastify.get("/worldline/return", handleWorldlineReturn);
  fastify.post("/worldline/return", handleWorldlineReturn);
}

module.exports = publicPaymentRoutes;
