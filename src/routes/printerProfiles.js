// Printer capability profiles (paper width, chars-per-line, feature flags) -
// a Printer references one of these rather than duplicating this data per
// physical device.
const checkRole = require("../utils/checkRole");

const READ_ROLES = ["SUPERADMIN", "BRANCHADMIN", "CASHIER", "WAITER", "KITCHEN", "ACCOUNTANT"];
const WRITE_ROLES = ["SUPERADMIN", "BRANCHADMIN"];

async function printerProfileRoutes(fastify) {
  const prisma = () => fastify.prisma;

  fastify.get("/", { preHandler: checkRole(...READ_ROLES) }, async (request, reply) => {
    try {
      const profiles = await prisma().printerProfile.findMany({ where: { companyId: request.user.companyId }, orderBy: { name: "asc" } });
      return reply.send({ statusCode: "00", message: "Printer profiles fetched successfully", data: profiles });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to fetch printer profiles", error: err.message });
    }
  });

  fastify.post("/", { preHandler: checkRole(...WRITE_ROLES) }, async (request, reply) => {
    try {
      const { name, paperWidthMm, charsPerLine, capabilities } = request.body || {};
      if (!name) return reply.code(400).send({ statusCode: "01", message: "name is required" });

      const profile = await prisma().printerProfile.create({
        data: {
          companyId: request.user.companyId,
          name,
          paperWidthMm: paperWidthMm || 80,
          charsPerLine: charsPerLine || (paperWidthMm === 58 ? 32 : 48),
          capabilities: capabilities || {},
        },
      });
      return reply.send({ statusCode: "00", message: "Printer profile created successfully", data: profile });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to create printer profile", error: err.message });
    }
  });

  fastify.put("/:id", { preHandler: checkRole(...WRITE_ROLES) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId;
      const existing = await prisma().printerProfile.findFirst({ where: { id: request.params.id, companyId } });
      if (!existing) return reply.code(404).send({ statusCode: "99", message: "Printer profile not found" });

      const { name, paperWidthMm, charsPerLine, capabilities } = request.body || {};
      const profile = await prisma().printerProfile.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined && { name }),
          ...(paperWidthMm !== undefined && { paperWidthMm }),
          ...(charsPerLine !== undefined && { charsPerLine }),
          ...(capabilities !== undefined && { capabilities }),
        },
      });
      return reply.send({ statusCode: "00", message: "Printer profile updated successfully", data: profile });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to update printer profile", error: err.message });
    }
  });

  fastify.delete("/:id", { preHandler: checkRole(...WRITE_ROLES) }, async (request, reply) => {
    try {
      const deleted = await prisma().printerProfile.deleteMany({ where: { id: request.params.id, companyId: request.user.companyId } });
      if (!deleted.count) return reply.code(404).send({ statusCode: "99", message: "Printer profile not found" });
      return reply.send({ statusCode: "00", message: "Printer profile removed successfully" });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to remove printer profile", error: err.message });
    }
  });
}

module.exports = printerProfileRoutes;
