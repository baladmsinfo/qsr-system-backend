// Main print entry point. QR/barcode <img> rendering lives in
// routes/publicPrintAssets.js instead (registered under /api/public/print) -
// a plain <img src> tag can't attach an Authorization header, and this
// backend's global auth preHandler (server.js) only exempts a hardcoded
// /api/public/ prefix, not anything under /api/print/.
const checkRole = require("../utils/checkRole");
const { requestPrint } = require("../services/printing/printService");

const PRINT_ROLES = ["SUPERADMIN", "BRANCHADMIN", "CASHIER", "WAITER", "KITCHEN"];

async function printRoutes(fastify) {
  fastify.post("/", { preHandler: checkRole(...PRINT_ROLES) }, async (request, reply) => {
    try {
      const { printerId, receiptTemplateId, orderId, format, templateType } = request.body || {};
      if (!printerId || !orderId) return reply.code(400).send({ statusCode: "01", message: "printerId and orderId are required" });

      const result = await requestPrint(fastify, {
        companyId: request.user.companyId,
        printerId,
        receiptTemplateId,
        orderId,
        format,
        templateType,
      });
      return reply.send({ statusCode: "00", message: "Print requested successfully", data: result });
    } catch (err) {
      request.log.error(err);
      return reply.code(400).send({ statusCode: "99", message: err.message || "Failed to print", error: err.message });
    }
  });
}

module.exports = printRoutes;
