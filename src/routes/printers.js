// Printer registry CRUD - same shape as routes/paymentGateways.js: every
// route scoped to request.user.companyId, config changes restricted to
// admins, "Test Print" open to anyone who can also trigger a real print.
const checkRole = require("../utils/checkRole");

const READ_ROLES = ["SUPERADMIN", "BRANCHADMIN", "CASHIER", "WAITER", "KITCHEN", "ACCOUNTANT"];
const WRITE_ROLES = ["SUPERADMIN", "BRANCHADMIN"];

async function printerRoutes(fastify) {
  const prisma = () => fastify.prisma;

  fastify.get("/", { preHandler: checkRole(...READ_ROLES) }, async (request, reply) => {
    try {
      const { branchId } = request.query || {};
      const printers = await prisma().printer.findMany({
        where: { companyId: request.user.companyId, ...(branchId ? { branchId } : {}) },
        include: { printerProfile: true },
        orderBy: { createdAt: "desc" },
      });
      return reply.send({ statusCode: "00", message: "Printers fetched successfully", data: printers });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to fetch printers", error: err.message });
    }
  });

  fastify.post("/", { preHandler: checkRole(...WRITE_ROLES) }, async (request, reply) => {
    try {
      const { name, connectionType, connectionConfig, branchId, printerProfileId, isDefault } = request.body || {};
      if (!name || !connectionType) {
        return reply.code(400).send({ statusCode: "01", message: "name and connectionType are required" });
      }

      const companyId = request.user.companyId;
      if (isDefault) {
        await prisma().printer.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } });
      }

      const printer = await prisma().printer.create({
        data: {
          companyId,
          branchId: branchId || null,
          name,
          connectionType,
          connectionConfig: connectionConfig || {},
          printerProfileId: printerProfileId || null,
          isDefault: !!isDefault,
        },
      });
      return reply.send({ statusCode: "00", message: "Printer created successfully", data: printer });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to create printer", error: err.message });
    }
  });

  fastify.put("/:id", { preHandler: checkRole(...WRITE_ROLES) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId;
      const existing = await prisma().printer.findFirst({ where: { id: request.params.id, companyId } });
      if (!existing) return reply.code(404).send({ statusCode: "99", message: "Printer not found" });

      const { name, connectionType, connectionConfig, branchId, printerProfileId, isDefault, isActive } = request.body || {};
      if (isDefault) {
        await prisma().printer.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } });
      }

      const printer = await prisma().printer.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined && { name }),
          ...(connectionType !== undefined && { connectionType }),
          ...(connectionConfig !== undefined && { connectionConfig }),
          ...(branchId !== undefined && { branchId: branchId || null }),
          ...(printerProfileId !== undefined && { printerProfileId: printerProfileId || null }),
          ...(isDefault !== undefined && { isDefault }),
          ...(isActive !== undefined && { isActive }),
        },
      });
      return reply.send({ statusCode: "00", message: "Printer updated successfully", data: printer });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to update printer", error: err.message });
    }
  });

  fastify.delete("/:id", { preHandler: checkRole(...WRITE_ROLES) }, async (request, reply) => {
    try {
      const deleted = await prisma().printer.deleteMany({ where: { id: request.params.id, companyId: request.user.companyId } });
      if (!deleted.count) return reply.code(404).send({ statusCode: "99", message: "Printer not found" });
      return reply.send({ statusCode: "00", message: "Printer removed successfully" });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to remove printer", error: err.message });
    }
  });

  // Test Print - a minimal receipt with no real order, so any staff member
  // can confirm a printer actually works without needing a live order handy.
  fastify.post("/:id/test-print", { preHandler: checkRole(...READ_ROLES) }, async (request, reply) => {
    try {
      const printer = await prisma().printer.findFirst({
        where: { id: request.params.id, companyId: request.user.companyId },
        include: { printerProfile: true },
      });
      if (!printer) return reply.code(404).send({ statusCode: "99", message: "Printer not found" });

      const { EscPosBuilder } = require("../services/printing/escposCommands");
      const cols = printer.printerProfile?.charsPerLine || (printer.printerProfile?.paperWidthMm === 58 ? 32 : 48);
      const buffer = new EscPosBuilder()
        .init()
        .align("center")
        .bold(true)
        .line("TEST PRINT")
        .bold(false)
        .rule(cols)
        .line(`Printer: ${printer.name}`)
        .line(new Date().toLocaleString("en-IN"))
        .rule(cols)
        .feed(2)
        .cut()
        .toBuffer();

      if (printer.connectionType === "NETWORK") {
        const { printToNetwork } = require("../services/printing/drivers/networkDriver");
        await printToNetwork(printer.connectionConfig, buffer);
        return reply.send({ statusCode: "00", message: "Test print sent successfully" });
      }

      return reply.send({ statusCode: "00", message: "Test print rendered - print client-side", data: { payload: buffer.toString("base64") } });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Test print failed", error: err.message });
    }
  });
}

module.exports = printerRoutes;
