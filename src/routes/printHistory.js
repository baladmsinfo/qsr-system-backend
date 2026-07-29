// Print History - the permanent audit log. NETWORK printer jobs write here
// automatically from workers/printWorker.js once a job reaches SUCCESS/
// FAILED; every client-held connection type (USB/Bluetooth/WebUSB/
// WebSerial/System) never touches the backend for the actual print, so the
// client itself POSTs here afterward to report what happened - this is the
// only way the backend ever learns the outcome of those prints.
const checkRole = require("../utils/checkRole");

const READ_ROLES = ["SUPERADMIN", "BRANCHADMIN", "CASHIER", "WAITER", "KITCHEN", "ACCOUNTANT"];
const REPORT_ROLES = ["SUPERADMIN", "BRANCHADMIN", "CASHIER", "WAITER", "KITCHEN"];

async function printHistoryRoutes(fastify) {
  const prisma = () => fastify.prisma;

  fastify.get("/", { preHandler: checkRole(...READ_ROLES) }, async (request, reply) => {
    try {
      const { printerId, status, limit } = request.query || {};
      const history = await prisma().printHistory.findMany({
        where: {
          companyId: request.user.companyId,
          ...(printerId ? { printerId } : {}),
          ...(status ? { status } : {}),
        },
        include: { printer: { select: { name: true, connectionType: true } }, receiptTemplate: { select: { name: true, type: true } } },
        orderBy: { createdAt: "desc" },
        take: Math.min(Number(limit) || 100, 500),
      });
      return reply.send({ statusCode: "00", message: "Print history fetched successfully", data: history });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to fetch print history", error: err.message });
    }
  });

  fastify.post("/", { preHandler: checkRole(...REPORT_ROLES) }, async (request, reply) => {
    try {
      const { printerId, receiptTemplateId, orderId, format, status, errorMessage } = request.body || {};
      if (!format || !status) return reply.code(400).send({ statusCode: "01", message: "format and status are required" });

      const entry = await prisma().printHistory.create({
        data: {
          companyId: request.user.companyId,
          printerId: printerId || null,
          receiptTemplateId: receiptTemplateId || null,
          orderId: orderId || null,
          format,
          status,
          errorMessage: errorMessage || null,
        },
      });
      return reply.send({ statusCode: "00", message: "Print result recorded successfully", data: entry });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to record print result", error: err.message });
    }
  });
}

module.exports = printHistoryRoutes;
