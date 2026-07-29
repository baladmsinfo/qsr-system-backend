// Runs IN-PROCESS inside the main Fastify server (see server.js) rather than
// as a separate deployed process. Found during exploration: this backend
// already has a BullMQ Queue producer for emails (queues/email.queue.js) but
// no consumer exists anywhere - docker-compose references
// workers/email.worker.js, which doesn't exist in the repo, so queued emails
// are never actually processed today. Running this worker in-process avoids
// repeating that bug: publishing works without depending on a second
// deployed service existing/being kept in sync.
const { Worker } = require("bullmq");
const connection = require("../config/redisConfig");
const { generateStaticSite } = require("../services/staticSiteGenerator");
const spacesStaticHost = require("../services/spacesStaticHost");

function previewUrlFor(websiteId) {
  const cdnBase = process.env.DO_SPACE_SITES_CDN || `https://${process.env.DO_SPACE_SITES_BUCKET}.${process.env.DO_SPACE_REGION}.cdn.digitaloceanspaces.com`;
  return `${cdnBase}/sites/${websiteId}/live`;
}

function createPublishWorker(fastify) {
  async function processJob(job) {
    const prisma = fastify.prisma;
    const { deploymentId } = job.data;

    const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } });
    if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

    const website = await prisma.website.findUnique({ where: { id: deployment.websiteId } });
    const companyId = website.companyId;

    async function updateStatus(status, extra = {}) {
      await prisma.deployment.update({ where: { id: deploymentId }, data: { status, ...extra } });
      fastify.emitToCompany(companyId, "publish:progress", { deploymentId, status, ...extra });
    }

    try {
      await updateStatus("GENERATING");

      const fullWebsite = await prisma.website.findUnique({
        where: { id: website.id },
        include: {
          pages: { where: { status: "PUBLISHED" } },
          navigation: true,
          globalComponents: true,
          theme: true,
        },
      });
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      const primaryDomain = await prisma.domain.findFirst({ where: { websiteId: website.id, isPrimary: true } });
      const baseUrl = primaryDomain ? `https://${primaryDomain.hostname}` : previewUrlFor(website.id);

      // Live data for dynamic-mode blocks (MenuShowcase/OpeningHours/
      // BranchLocator) - queried directly via Prisma (this worker already
      // owns that data) rather than the static export calling its own public
      // HTTP route. Defaults to the first branch, same simplification as the
      // admin canvas preview (multi-branch selection isn't built yet).
      const branches = await prisma.branch.findMany({
        where: { companyId },
        select: { id: true, name: true, addressLine1: true, city: true, openingTime: true, closingTime: true },
      });
      let menuCategories = [];
      if (branches[0]) {
        menuCategories = await prisma.menuCategory.findMany({
          where: { companyId },
          include: {
            subCategories: { include: { menuItems: { where: { branchId: branches[0].id, availability: { not: "HIDDEN" } } } } },
            menuItems: { where: { branchId: branches[0].id, availability: { not: "HIDDEN" } } },
          },
        });
      }

      const { files } = await generateStaticSite({ website: fullWebsite, company, baseUrl, liveData: { menuCategories, branches } });

      // No separate heavy bundling step exists for plain static HTML/CSS
      // (generateStaticSite already minifies) - BUILDING is still reported as
      // its own stage so the Toolbar's progress UI matches the spec's stages.
      await updateStatus("BUILDING");

      await updateStatus("DEPLOYING");
      const { previewUrl } = await spacesStaticHost.deploy({ websiteId: website.id, version: deployment.version, files });

      const productionUrl = primaryDomain ? `https://${primaryDomain.hostname}` : null;
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "SUCCEEDED", previewUrl, productionUrl, completedAt: new Date() },
      });
      await prisma.website.update({ where: { id: website.id }, data: { status: "PUBLISHED" } });
      fastify.emitToCompany(companyId, "publish:progress", { deploymentId, status: "SUCCEEDED", previewUrl, productionUrl });
    } catch (err) {
      fastify.log.error(err, "publish job failed");
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "FAILED", errorMessage: err.message, completedAt: new Date() },
      });
      fastify.emitToCompany(companyId, "publish:progress", { deploymentId, status: "FAILED", errorMessage: err.message });
      throw err;
    }
  }

  return new Worker("publish", processJob, { connection });
}

module.exports = { createPublishWorker, previewUrlFor };
