// Runs IN-PROCESS inside the main Fastify server (see server.js), mirroring
// workers/publishWorker.js exactly - same reasoning: this backend already
// has at least one BullMQ Queue with no deployed consumer (queues/email.queue.js),
// so a print job silently never printing would repeat that bug. Only
// NETWORK printers ever reach this worker - see printService.js's
// SERVER_DRIVEN_TYPES for why USB/Bluetooth/WebUSB/WebSerial jobs never
// touch the backend queue at all.
const { Worker } = require("bullmq");
const connection = require("../config/redisConfig");
const { printToNetwork } = require("../services/printing/drivers/networkDriver");
const { renderEscPos } = require("../services/printing/escposRenderer");

function createPrintWorker(fastify) {
  async function processJob(job) {
    const prisma = fastify.prisma;
    const { printerJobId } = job.data;

    const printerJob = await prisma.printerJob.findUnique({
      where: { id: printerJobId },
      include: { printer: { include: { printerProfile: true } }, receiptTemplate: true },
    });
    if (!printerJob) throw new Error(`PrinterJob ${printerJobId} not found`);

    await prisma.printerJob.update({ where: { id: printerJobId }, data: { status: "PROCESSING", attempts: { increment: 1 } } });

    try {
      const buffer = renderEscPos(printerJob.payload, printerJob.receiptTemplate.layoutJson, printerJob.printer.printerProfile);
      await printToNetwork(printerJob.printer.connectionConfig, buffer);

      await prisma.printerJob.update({ where: { id: printerJobId }, data: { status: "SUCCESS" } });
      await prisma.printHistory.create({
        data: {
          companyId: printerJob.companyId,
          printerId: printerJob.printerId,
          receiptTemplateId: printerJob.receiptTemplateId,
          orderId: printerJob.orderId,
          format: printerJob.format,
          status: "SUCCESS",
        },
      });
      fastify.emitToCompany?.(printerJob.companyId, "print:job", { printerJobId, status: "SUCCESS" });
    } catch (err) {
      const isFinalAttempt = job.attemptsMade + 1 >= job.opts.attempts;
      await prisma.printerJob.update({ where: { id: printerJobId }, data: { status: isFinalAttempt ? "FAILED" : "QUEUED", lastError: err.message } });
      if (isFinalAttempt) {
        await prisma.printHistory.create({
          data: {
            companyId: printerJob.companyId,
            printerId: printerJob.printerId,
            receiptTemplateId: printerJob.receiptTemplateId,
            orderId: printerJob.orderId,
            format: printerJob.format,
            status: "FAILED",
            errorMessage: err.message,
          },
        });
        fastify.emitToCompany?.(printerJob.companyId, "print:job", { printerJobId, status: "FAILED", error: err.message });
      }
      throw err; // let BullMQ's own backoff/attempts handle the retry
    }
  }

  return new Worker("print", processJob, { connection });
}

module.exports = { createPrintWorker };
