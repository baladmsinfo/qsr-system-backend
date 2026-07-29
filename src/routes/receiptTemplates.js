// Receipt Template CRUD - layoutJson is the Receipt Designer's block tree
// (see services/printing/escposRenderer.js + htmlRenderer.js for the block
// types both renderers understand). Templates are edited entirely through
// this JSON, never through code - the "Templates must be editable without
// code" requirement.
const checkRole = require("../utils/checkRole");

const READ_ROLES = ["SUPERADMIN", "BRANCHADMIN", "CASHIER", "WAITER", "KITCHEN", "ACCOUNTANT"];
const WRITE_ROLES = ["SUPERADMIN", "BRANCHADMIN"];

async function receiptTemplateRoutes(fastify) {
  const prisma = () => fastify.prisma;

  fastify.get("/", { preHandler: checkRole(...READ_ROLES) }, async (request, reply) => {
    try {
      const { type } = request.query || {};
      const templates = await prisma().receiptTemplate.findMany({
        where: { companyId: request.user.companyId, ...(type ? { type } : {}) },
        orderBy: { updatedAt: "desc" },
      });
      return reply.send({ statusCode: "00", message: "Receipt templates fetched successfully", data: templates });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to fetch receipt templates", error: err.message });
    }
  });

  fastify.get("/:id", { preHandler: checkRole(...READ_ROLES) }, async (request, reply) => {
    try {
      const template = await prisma().receiptTemplate.findFirst({ where: { id: request.params.id, companyId: request.user.companyId } });
      if (!template) return reply.code(404).send({ statusCode: "99", message: "Receipt template not found" });
      return reply.send({ statusCode: "00", message: "Receipt template fetched successfully", data: template });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to fetch receipt template", error: err.message });
    }
  });

  fastify.post("/", { preHandler: checkRole(...WRITE_ROLES) }, async (request, reply) => {
    try {
      const { name, type, layoutJson, isDefault } = request.body || {};
      if (!name || !layoutJson) return reply.code(400).send({ statusCode: "01", message: "name and layoutJson are required" });

      const companyId = request.user.companyId;
      const templateType = type || "RECEIPT";
      if (isDefault) {
        await prisma().receiptTemplate.updateMany({ where: { companyId, type: templateType, isDefault: true }, data: { isDefault: false } });
      }

      const template = await prisma().receiptTemplate.create({
        data: { companyId, name, type: templateType, layoutJson, isDefault: !!isDefault },
      });
      return reply.send({ statusCode: "00", message: "Receipt template created successfully", data: template });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to create receipt template", error: err.message });
    }
  });

  fastify.put("/:id", { preHandler: checkRole(...WRITE_ROLES) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId;
      const existing = await prisma().receiptTemplate.findFirst({ where: { id: request.params.id, companyId } });
      if (!existing) return reply.code(404).send({ statusCode: "99", message: "Receipt template not found" });

      const { name, layoutJson, isDefault, isActive } = request.body || {};
      if (isDefault) {
        await prisma().receiptTemplate.updateMany({ where: { companyId, type: existing.type, isDefault: true }, data: { isDefault: false } });
      }

      const template = await prisma().receiptTemplate.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined && { name }),
          ...(layoutJson !== undefined && { layoutJson }),
          ...(isDefault !== undefined && { isDefault }),
          ...(isActive !== undefined && { isActive }),
        },
      });
      return reply.send({ statusCode: "00", message: "Receipt template updated successfully", data: template });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to update receipt template", error: err.message });
    }
  });

  fastify.delete("/:id", { preHandler: checkRole(...WRITE_ROLES) }, async (request, reply) => {
    try {
      const deleted = await prisma().receiptTemplate.deleteMany({ where: { id: request.params.id, companyId: request.user.companyId } });
      if (!deleted.count) return reply.code(404).send({ statusCode: "99", message: "Receipt template not found" });
      return reply.send({ statusCode: "00", message: "Receipt template removed successfully" });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to remove receipt template", error: err.message });
    }
  });

  // Falls back to this company's most recent order so a preview is always
  // real data, never a fabricated sample receipt.
  async function resolveOrderId(companyId, requestedOrderId) {
    if (requestedOrderId) return requestedOrderId;
    const recentOrder = await prisma().order.findFirst({ where: { companyId }, orderBy: { createdAt: "desc" } });
    if (!recentOrder) throw new Error("No orders exist yet to preview against");
    return recentOrder.id;
  }

  // Live Preview - renders a SAVED template against a real order.
  fastify.get("/:id/preview", { preHandler: checkRole(...READ_ROLES) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId;
      const template = await prisma().receiptTemplate.findFirst({ where: { id: request.params.id, companyId } });
      if (!template) return reply.code(404).send({ statusCode: "99", message: "Receipt template not found" });

      const orderId = await resolveOrderId(companyId, request.query?.orderId);
      const { buildReceiptData } = require("../services/printing/receiptData");
      const { renderHtml } = require("../services/printing/htmlRenderer");
      const receiptData = await buildReceiptData(prisma(), orderId);
      const html = renderHtml(receiptData, template.layoutJson);

      reply.type("text/html");
      return reply.send(html);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to render preview", error: err.message });
    }
  });

  // Draft Live Preview - same rendering pipeline, but for the Receipt
  // Designer's in-progress, not-yet-saved layoutJson (there's no template
  // id to look up while actively editing a brand-new template or unsaved
  // changes to an existing one).
  fastify.post("/preview", { preHandler: checkRole(...READ_ROLES) }, async (request, reply) => {
    try {
      const { layoutJson, orderId: requestedOrderId } = request.body || {};
      if (!layoutJson) return reply.code(400).send({ statusCode: "01", message: "layoutJson is required" });

      const orderId = await resolveOrderId(request.user.companyId, requestedOrderId);
      const { buildReceiptData } = require("../services/printing/receiptData");
      const { renderHtml } = require("../services/printing/htmlRenderer");
      const receiptData = await buildReceiptData(prisma(), orderId);
      const html = renderHtml(receiptData, layoutJson);

      reply.type("text/html");
      return reply.send(html);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: "99", message: "Failed to render preview", error: err.message });
    }
  });
}

module.exports = receiptTemplateRoutes;
