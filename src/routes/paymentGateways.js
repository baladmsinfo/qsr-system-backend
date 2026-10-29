// Merchant-facing Payment Gateway Settings - staff-auth'd CRUD for a
// company's own gateway credentials. Same pattern as routes/builder.js:
// every route scoped to request.user.companyId, never another company's.
const checkRole = require("../utils/checkRole");

const READ_ROLES = ["SUPERADMIN", "BRANCHADMIN", "ACCOUNTANT"];
const WRITE_ROLES = ["SUPERADMIN", "BRANCHADMIN"];

// keySecret/webhookSecret never leave the backend once saved - the settings
// UI only ever needs to know a gateway IS configured, not see the secret
// again (same reasoning as never sending a password hash back to a client).
function redact(config) {
  if (!config) return config;
  const { keySecret, webhookSecret, ...rest } = config;
  return { ...rest, hasKeySecret: !!keySecret, hasWebhookSecret: !!webhookSecret };
}

async function paymentGatewayRoutes(fastify) {
  const prisma = () => fastify.prisma;

  fastify.get(
    "/",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const configs = await prisma().paymentGatewayConfig.findMany({ where: { companyId: request.user.companyId } });
        return reply.send({ statusCode: "00", message: "Payment gateways fetched successfully", data: configs.map(redact) });
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch payment gateways", error: err.message });
      }
    }
  );

  fastify.put(
    "/:provider",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const provider = request.params.provider;
        const companyId = request.user.companyId;
        const { keyId, keySecret, webhookSecret, mode } = request.body || {};

        const existing = await prisma().paymentGatewayConfig.findUnique({ where: { companyId_provider: { companyId, provider } } });
        // keySecret can be omitted on an UPDATE to keep the existing value
        // (the settings UI never shows a saved secret back to re-type it) -
        // only required when there's no existing row to fall back to.
        if (!keyId || (!keySecret && !existing)) {
          return reply.code(400).send({ statusCode: "01", message: "keyId and keySecret are required" });
        }

        // BucksBox's key is a 32-byte AES key (64 hex chars or base64) - reject
        // anything else here rather than at the counter's first QR.
        if (provider === "BUCKSBOX" && keySecret && !/^[0-9a-fA-F]{64}$/.test(keySecret) && !/^[A-Za-z0-9+/]{43}=$/.test(keySecret)) {
          return reply.code(400).send({ statusCode: "01", message: "BucksBox key must be 64 hex characters or a base64 32-byte key" });
        }
        // A BucksBox merchant belongs to one QSR account (see routes/pos.js).
        if (provider === "BUCKSBOX") {
          const [gateway, branch] = await Promise.all([
            prisma().paymentGatewayConfig.findFirst({ where: { provider, keyId, NOT: { companyId } }, select: { id: true } }),
            prisma().branchUpiConfig.findFirst({ where: { clientId: keyId, NOT: { companyId } }, select: { id: true } }),
          ]);
          if (gateway || branch) {
            return reply.code(409).send({ statusCode: "01", message: "This BucksBox Client ID is already connected to another account" });
          }
        }

        const data = { keyId, mode: mode || "test" };
        if (keySecret) data.keySecret = keySecret;
        if (webhookSecret !== undefined) data.webhookSecret = webhookSecret || null;

        const config = await prisma().paymentGatewayConfig.upsert({
          where: { companyId_provider: { companyId, provider } },
          create: { companyId, provider, keySecret, ...data },
          update: data,
        });
        return reply.send({ statusCode: "00", message: "Payment gateway saved successfully", data: redact(config) });
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ statusCode: "99", message: "Failed to save payment gateway", error: err.message });
      }
    }
  );

  fastify.post(
    "/:provider/activate",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const provider = request.params.provider;
        const companyId = request.user.companyId;
        // BucksBox only powers POS counter UPI (see routes/pos.js) - activating
        // it would deactivate the storefront's real checkout gateway.
        if (provider === "BUCKSBOX") {
          return reply.code(400).send({ statusCode: "01", message: "BucksBox is used for POS UPI only and can't be set as the online checkout gateway" });
        }
        const target = await prisma().paymentGatewayConfig.findUnique({ where: { companyId_provider: { companyId, provider } } });
        if (!target) return reply.code(404).send({ statusCode: "99", message: "Configure this gateway's credentials before activating it" });

        // Exactly one active gateway per company at a time - a real merchant
        // picks one primary processor, matching how checkout actually works.
        await prisma().$transaction([
          prisma().paymentGatewayConfig.updateMany({ where: { companyId, isActive: true }, data: { isActive: false } }),
          prisma().paymentGatewayConfig.update({ where: { id: target.id }, data: { isActive: true } }),
        ]);
        return reply.send({ statusCode: "00", message: "Payment gateway activated successfully" });
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ statusCode: "99", message: "Failed to activate payment gateway", error: err.message });
      }
    }
  );

  fastify.delete(
    "/:provider",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        await prisma().paymentGatewayConfig.delete({
          where: { companyId_provider: { companyId: request.user.companyId, provider: request.params.provider } },
        });
        return reply.send({ statusCode: "00", message: "Payment gateway removed successfully" });
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ statusCode: "99", message: "Failed to remove payment gateway", error: err.message });
      }
    }
  );
}

module.exports = paymentGatewayRoutes;
