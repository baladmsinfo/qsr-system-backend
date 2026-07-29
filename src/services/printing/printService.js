// Orchestrates one print request end-to-end: resolve receipt data + template
// + printer profile, render to the right format, then either hand the bytes
// to a driver this backend can actually run (Network) or hand the rendered
// payload back to the caller to print locally (every client-held connection
// type). Both routes/print.js and workers/printWorker.js call into this so
// the "how do I render a receipt" logic exists exactly once.
const { buildReceiptData } = require("./receiptData");
const { renderEscPos } = require("./escposRenderer");
const { renderHtml } = require("./htmlRenderer");
const { printToNetwork } = require("./drivers/networkDriver");

/** Connection types this backend can physically reach and print to itself. */
const SERVER_DRIVEN_TYPES = ["NETWORK"];

async function resolveTemplate(prisma, { companyId, receiptTemplateId, type = "RECEIPT" }) {
  if (receiptTemplateId) {
    const template = await prisma.receiptTemplate.findUnique({ where: { id: receiptTemplateId } });
    if (!template) throw new Error("Receipt template not found");
    return template;
  }
  const fallback = await prisma.receiptTemplate.findFirst({ where: { companyId, type, isDefault: true, isActive: true } });
  if (!fallback) throw new Error(`No default ${type} template configured for this company`);
  return fallback;
}

/**
 * Renders a receipt for a given order/printer/template combination.
 * @returns {Promise<{format: string, buffer?: Buffer, html?: string, receiptData: object}>}
 */
async function renderReceipt(prisma, { orderId, receiptTemplateId, printerProfile, format, companyId, templateType }) {
  const receiptData = orderId ? await buildReceiptData(prisma, orderId) : null;
  if (!receiptData) throw new Error("orderId is required to render a receipt");

  const template = await resolveTemplate(prisma, { companyId, receiptTemplateId, type: templateType });
  const resolvedFormat = format || (template.type === "KOT" ? "ESC_POS" : "ESC_POS");

  if (resolvedFormat === "HTML") {
    return { format: "HTML", html: renderHtml(receiptData, template.layoutJson, printerProfile), receiptData, template };
  }
  // PDF/PNG are generated client-side from this same HTML (browser/Electron
  // print-to-PDF, or a canvas snapshot) - see module comment in
  // htmlRenderer.js; the backend only ever produces ESC_POS or HTML bytes.
  return { format: "ESC_POS", buffer: renderEscPos(receiptData, template.layoutJson, printerProfile), receiptData, template };
}

/**
 * Entry point for POST /api/print. For a NETWORK printer this enqueues a
 * retryable PrinterJob and returns immediately; for every client-held
 * connection type it renders synchronously and hands the payload back for
 * the caller to print itself.
 */
async function requestPrint(fastify, { companyId, printerId, receiptTemplateId, orderId, format, templateType }) {
  const prisma = fastify.prisma;
  const printer = await prisma.printer.findFirst({ where: { id: printerId, companyId }, include: { printerProfile: true } });
  if (!printer) throw new Error("Printer not found");
  if (!printer.isActive) throw new Error("This printer is disabled");

  if (SERVER_DRIVEN_TYPES.includes(printer.connectionType)) {
    const { receiptData, template } = await renderReceipt(prisma, {
      orderId,
      receiptTemplateId,
      printerProfile: printer.printerProfile,
      format: "ESC_POS",
      companyId,
      templateType,
    });
    const job = await prisma.printerJob.create({
      data: {
        companyId,
        printerId,
        receiptTemplateId: template.id,
        orderId: orderId || null,
        format: "ESC_POS",
        payload: receiptData,
        status: "QUEUED",
      },
    });
    const { printQueue } = require("../../queues/print.queue");
    await printQueue.add(
      "print-job",
      { printerJobId: job.id },
      { attempts: 5, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 500, removeOnFail: 500 }
    );
    return { mode: "queued", printerJobId: job.id };
  }

  const { format: resolvedFormat, buffer, html } = await renderReceipt(prisma, {
    orderId,
    receiptTemplateId,
    printerProfile: printer.printerProfile,
    format,
    companyId,
    templateType,
  });
  return {
    mode: "client",
    format: resolvedFormat,
    payload: resolvedFormat === "HTML" ? html : buffer.toString("base64"),
  };
}

module.exports = { renderReceipt, requestPrint, printToNetwork };
