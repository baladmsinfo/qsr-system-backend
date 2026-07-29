// routes/builder.js
// Website Builder API - isolated from StorefrontContent. Every route is
// scoped to the authenticated staff member's own Company (request.user.companyId),
// same pattern as routes/companies.js's storefront-content handlers.
const dns = require('dns').promises
const checkRole = require('../utils/checkRole')
const { publishQueue } = require('../queues/publish.queue')
const spacesStaticHost = require('../services/spacesStaticHost')

const READ_ROLES = ["SUPERADMIN", "BRANCHADMIN", "KITCHEN", "CASHIER", "WAITER", "ACCOUNTANT"]
const WRITE_ROLES = ["SUPERADMIN", "BRANCHADMIN"]

async function builderRoutes(fastify) {
  const prisma = () => fastify.prisma

  async function getOrCreateWebsite(companyId) {
    let website = await prisma().website.findUnique({ where: { companyId } })
    if (!website) {
      website = await prisma().website.create({ data: { companyId } })
      await prisma().page.create({
        data: {
          websiteId: website.id,
          slug: "home",
          title: "Home",
          isHome: true,
          draftBlocks: { blocks: [] },
        },
      })
    }
    return website
  }

  // Returns the page only if it belongs to the requesting company's website.
  async function getOwnedPage(companyId, pageId) {
    const page = await prisma().page.findUnique({
      where: { id: pageId },
      include: { website: true },
    })
    if (!page || page.website.companyId !== companyId) return null
    return page
  }

  async function pruneVersions(pageId, keep = 20) {
    const versions = await prisma().pageVersion.findMany({
      where: { pageId },
      orderBy: { createdAt: "desc" },
      skip: keep,
      select: { id: true },
    })
    if (versions.length) {
      await prisma().pageVersion.deleteMany({ where: { id: { in: versions.map((v) => v.id) } } })
    }
  }

  async function getOrCreateNavigation(websiteId) {
    let navigation = await prisma().navigation.findUnique({ where: { websiteId } })
    if (!navigation) {
      navigation = await prisma().navigation.create({ data: { websiteId } })
    }
    return navigation
  }

  // Page-linked nav items store only a pageId - label/href are derived live so
  // renaming a page needs no explicit re-sync. Deleting a page just leaves a
  // dangling pageId; pruneDanglingRefs strips those out of the STORED tree
  // (persisted back in resolveNavigation below, not just filtered from the
  // response) rather than via a cascading delete hook.
  function pruneDanglingRefs(items, pagesById) {
    return (items || [])
      .filter((item) => item.linkType !== "page" || pagesById.has(item.pageId))
      .map((item) => (item.children?.length ? { ...item, children: pruneDanglingRefs(item.children, pagesById) } : item))
  }

  // Adds `resolvedLabel`/`resolvedHref` as NEW fields for display/consumption -
  // deliberately does NOT touch `label`/`href` themselves. The admin UI reads
  // navigation with GET, lets the user edit it, and PUTs the whole tree back;
  // if resolution overwrote `label` in the GET response, that derived value
  // would get silently persisted as a permanent override on the very next
  // save, defeating the entire point of deriving it live from the page.
  function withResolvedLabels(items, pagesById) {
    return (items || []).map((item) => {
      const resolved = { ...item }
      if (item.linkType === "page") {
        const page = pagesById.get(item.pageId)
        resolved.resolvedLabel = item.label || page.title
        resolved.resolvedHref = `/${page.slug}`
      }
      if (item.children?.length) resolved.children = withResolvedLabels(item.children, pagesById)
      return resolved
    })
  }

  async function resolveNavigation(navigation, websiteId) {
    const pages = await prisma().page.findMany({ where: { websiteId }, select: { id: true, title: true, slug: true } })
    const pagesById = new Map(pages.map((p) => [p.id, p]))

    const pruned = pruneDanglingRefs(navigation.items, pagesById)
    let items = navigation.items
    if (JSON.stringify(pruned) !== JSON.stringify(navigation.items)) {
      const updated = await prisma().navigation.update({ where: { id: navigation.id }, data: { items: pruned } })
      items = updated.items
    }

    return { ...navigation, items: withResolvedLabels(items, pagesById) }
  }

  // ---- Website -------------------------------------------------------

  fastify.get(
    "/website",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const full = await prisma().website.findUnique({
          where: { id: website.id },
          include: {
            theme: true,
            // `branches` (id/name only) is what the Properties panel's Data
            // Source picker needs to know which branch's public menu to bind
            // a dynamic MenuShowcase/OpeningHours/BranchLocator block to -
            // reuses the existing public menu route, no new backend needed.
            company: {
              select: {
                tenant: true,
                branches: { select: { id: true, name: true, addressLine1: true, city: true, openingTime: true, closingTime: true } },
              },
            },
            pages: {
              select: { id: true, slug: true, title: true, isHome: true, status: true, updatedAt: true, order: true },
              orderBy: { order: "asc" },
            },
          },
        })
        return reply.send({ statusCode: "00", message: "Website fetched successfully", data: full })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch website", error: err.message })
      }
    }
  )

  fastify.patch(
    "/website",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const { name, themeId, customDomain } = request.body || {}
        const data = {}
        if (name !== undefined) data.name = name
        if (themeId !== undefined) data.themeId = themeId
        if (customDomain !== undefined) data.customDomain = customDomain || null

        const updated = await prisma().website.update({ where: { id: website.id }, data })
        return reply.send({ statusCode: "00", message: "Website updated successfully", data: updated })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to update website", error: err.message })
      }
    }
  )

  // ---- Theme -------------------------------------------------------------
  // Theme rows are copy-from sources, same as Template->Page: applying a
  // system preset or editing colors/fonts directly always writes to the
  // website's OWN private (isSystem:false) Theme row, created on first touch,
  // never mutates a shared system preset in place.

  fastify.get(
    "/themes",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const themes = await prisma().theme.findMany({ where: { isSystem: true }, orderBy: { createdAt: "asc" } })
        return reply.send({ statusCode: "00", message: "Themes fetched successfully", data: themes })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch themes", error: err.message })
      }
    }
  )

  async function upsertWebsiteTheme(website, { colors, fontHeading, fontBody }) {
    const data = { colors, fontHeading, fontBody, isSystem: false }
    if (website.themeId) {
      return prisma().theme.update({ where: { id: website.themeId }, data })
    }
    const theme = await prisma().theme.create({ data: { name: "Custom", ...data } })
    await prisma().website.update({ where: { id: website.id }, data: { themeId: theme.id } })
    return theme
  }

  fastify.post(
    "/website/theme/apply-preset",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const { themeId } = request.body || {}
        const preset = await prisma().theme.findUnique({ where: { id: themeId } })
        if (!preset) return reply.code(404).send({ statusCode: "99", message: "Theme preset not found" })

        const theme = await upsertWebsiteTheme(website, { colors: preset.colors, fontHeading: preset.fontHeading, fontBody: preset.fontBody })
        return reply.send({ statusCode: "00", message: "Theme preset applied successfully", data: theme })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to apply theme preset", error: err.message })
      }
    }
  )

  fastify.put(
    "/website/theme",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const { colors, fontHeading, fontBody } = request.body || {}
        const theme = await upsertWebsiteTheme(website, { colors, fontHeading, fontBody })
        return reply.send({ statusCode: "00", message: "Theme updated successfully", data: theme })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to update theme", error: err.message })
      }
    }
  )

  // ---- Pages -----------------------------------------------------------

  fastify.get(
    "/pages",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const pages = await prisma().page.findMany({
          where: { websiteId: website.id },
          select: { id: true, slug: true, title: true, isHome: true, status: true, updatedAt: true, order: true },
          orderBy: { order: "asc" },
        })
        return reply.send({ statusCode: "00", message: "Pages fetched successfully", data: pages })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch pages", error: err.message })
      }
    }
  )

  fastify.post(
    "/pages",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const { slug, title } = request.body || {}
        if (!slug || !title) {
          return reply.code(400).send({ statusCode: "01", message: "slug and title are required" })
        }

        const existing = await prisma().page.findUnique({ where: { websiteId_slug: { websiteId: website.id, slug } } })
        if (existing) {
          return reply.code(409).send({ statusCode: "03", message: "A page with this slug already exists" })
        }

        const maxOrder = await prisma().page.aggregate({ where: { websiteId: website.id }, _max: { order: true } })

        const page = await prisma().page.create({
          data: {
            websiteId: website.id,
            slug,
            title,
            order: (maxOrder._max.order ?? 0) + 1,
            draftBlocks: { blocks: [] },
          },
        })
        return reply.send({ statusCode: "00", message: "Page created successfully", data: page })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to create page", error: err.message })
      }
    }
  )

  fastify.post(
    "/pages/:id/duplicate",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const page = await getOwnedPage(request.user.companyId, request.params.id)
        if (!page) {
          return reply.code(404).send({ statusCode: "02", message: "Page not found" })
        }

        let slug = `${page.slug}-copy`
        let suffix = 1
        while (await prisma().page.findUnique({ where: { websiteId_slug: { websiteId: page.websiteId, slug } } })) {
          suffix += 1
          slug = `${page.slug}-copy-${suffix}`
        }

        const maxOrder = await prisma().page.aggregate({ where: { websiteId: page.websiteId }, _max: { order: true } })

        const copy = await prisma().page.create({
          data: {
            websiteId: page.websiteId,
            slug,
            title: `${page.title} Copy`,
            order: (maxOrder._max.order ?? 0) + 1,
            draftBlocks: page.draftBlocks,
            seoTitle: page.seoTitle,
            seoDescription: page.seoDescription,
          },
        })
        return reply.send({ statusCode: "00", message: "Page duplicated successfully", data: copy })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to duplicate page", error: err.message })
      }
    }
  )

  fastify.patch(
    "/pages/reorder",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const { pageIds } = request.body || {}
        if (!Array.isArray(pageIds) || !pageIds.length) {
          return reply.code(400).send({ statusCode: "01", message: "pageIds array is required" })
        }

        const owned = await prisma().page.findMany({ where: { websiteId: website.id, id: { in: pageIds } }, select: { id: true } })
        if (owned.length !== pageIds.length) {
          return reply.code(400).send({ statusCode: "01", message: "One or more pages do not belong to this website" })
        }

        await Promise.all(pageIds.map((id, index) => prisma().page.update({ where: { id }, data: { order: index } })))

        return reply.send({ statusCode: "00", message: "Pages reordered successfully" })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to reorder pages", error: err.message })
      }
    }
  )

  fastify.post(
    "/pages/:id/set-home",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const page = await getOwnedPage(request.user.companyId, request.params.id)
        if (!page) {
          return reply.code(404).send({ statusCode: "02", message: "Page not found" })
        }

        await prisma().$transaction([
          prisma().page.updateMany({ where: { websiteId: page.websiteId, isHome: true }, data: { isHome: false } }),
          prisma().page.update({ where: { id: page.id }, data: { isHome: true } }),
        ])

        return reply.send({ statusCode: "00", message: "Homepage updated successfully" })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to set homepage", error: err.message })
      }
    }
  )

  fastify.get(
    "/pages/:id",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const page = await getOwnedPage(request.user.companyId, request.params.id)
        if (!page) {
          return reply.code(404).send({ statusCode: "02", message: "Page not found" })
        }
        return reply.send({ statusCode: "00", message: "Page fetched successfully", data: page })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch page", error: err.message })
      }
    }
  )

  fastify.put(
    "/pages/:id",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const page = await getOwnedPage(request.user.companyId, request.params.id)
        if (!page) {
          return reply.code(404).send({ statusCode: "02", message: "Page not found" })
        }

        const { blocks, title, slug, seoTitle, seoDescription } = request.body || {}
        const data = {}
        if (blocks !== undefined) data.draftBlocks = { blocks }
        if (title !== undefined) data.title = title
        if (seoTitle !== undefined) data.seoTitle = seoTitle
        if (seoDescription !== undefined) data.seoDescription = seoDescription

        if (slug !== undefined && slug !== page.slug) {
          const existing = await prisma().page.findUnique({ where: { websiteId_slug: { websiteId: page.websiteId, slug } } })
          if (existing) {
            return reply.code(409).send({ statusCode: "03", message: "A page with this slug already exists" })
          }
          data.slug = slug
        }

        const updated = await prisma().page.update({ where: { id: page.id }, data })

        if (blocks !== undefined) {
          await prisma().pageVersion.create({
            data: { pageId: page.id, blocks: { blocks }, label: "Autosave" },
          })
          await pruneVersions(page.id)
        }

        return reply.send({ statusCode: "00", message: "Page saved successfully", data: updated })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to save page", error: err.message })
      }
    }
  )

  fastify.delete(
    "/pages/:id",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const page = await getOwnedPage(request.user.companyId, request.params.id)
        if (!page) {
          return reply.code(404).send({ statusCode: "02", message: "Page not found" })
        }
        if (page.isHome) {
          return reply.code(400).send({ statusCode: "03", message: "Cannot delete the home page" })
        }

        await prisma().pageVersion.deleteMany({ where: { pageId: page.id } })
        await prisma().page.delete({ where: { id: page.id } })
        return reply.send({ statusCode: "00", message: "Page deleted successfully" })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to delete page", error: err.message })
      }
    }
  )

  fastify.post(
    "/pages/:id/publish",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const page = await getOwnedPage(request.user.companyId, request.params.id)
        if (!page) {
          return reply.code(404).send({ statusCode: "02", message: "Page not found" })
        }

        const updated = await prisma().page.update({
          where: { id: page.id },
          data: { publishedBlocks: page.draftBlocks, status: "PUBLISHED" },
        })

        await prisma().pageVersion.create({
          data: { pageId: page.id, blocks: page.draftBlocks, label: "Published" },
        })
        await pruneVersions(page.id)

        return reply.send({ statusCode: "00", message: "Page published successfully", data: updated })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to publish page", error: err.message })
      }
    }
  )

  // ---- Version history ---------------------------------------------------

  fastify.get(
    "/pages/:id/versions",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const page = await getOwnedPage(request.user.companyId, request.params.id)
        if (!page) {
          return reply.code(404).send({ statusCode: "02", message: "Page not found" })
        }
        const versions = await prisma().pageVersion.findMany({
          where: { pageId: page.id },
          select: { id: true, label: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
        return reply.send({ statusCode: "00", message: "Versions fetched successfully", data: versions })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch versions", error: err.message })
      }
    }
  )

  fastify.post(
    "/pages/:id/versions/:versionId/restore",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const page = await getOwnedPage(request.user.companyId, request.params.id)
        if (!page) {
          return reply.code(404).send({ statusCode: "02", message: "Page not found" })
        }

        const version = await prisma().pageVersion.findUnique({ where: { id: request.params.versionId } })
        if (!version || version.pageId !== page.id) {
          return reply.code(404).send({ statusCode: "02", message: "Version not found" })
        }

        const updated = await prisma().page.update({
          where: { id: page.id },
          data: { draftBlocks: version.blocks },
        })
        return reply.send({ statusCode: "00", message: "Version restored into draft", data: updated })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to restore version", error: err.message })
      }
    }
  )

  // ---- Templates ---------------------------------------------------------

  fastify.get(
    "/templates",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const templates = await prisma().template.findMany({ orderBy: { category: "asc" } })
        return reply.send({ statusCode: "00", message: "Templates fetched successfully", data: templates })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch templates", error: err.message })
      }
    }
  )

  fastify.post(
    "/pages/:id/apply-template",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const page = await getOwnedPage(request.user.companyId, request.params.id)
        if (!page) {
          return reply.code(404).send({ statusCode: "02", message: "Page not found" })
        }
        const { templateId } = request.body || {}
        const template = await prisma().template.findUnique({ where: { id: templateId } })
        if (!template) {
          return reply.code(404).send({ statusCode: "02", message: "Template not found" })
        }

        const updated = await prisma().page.update({
          where: { id: page.id },
          data: { draftBlocks: template.blocks },
        })
        return reply.send({ statusCode: "00", message: "Template applied successfully", data: updated })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to apply template", error: err.message })
      }
    }
  )

  // ---- Assets -------------------------------------------------------------

  fastify.get(
    "/assets",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const assets = await prisma().asset.findMany({
          where: { websiteId: website.id },
          orderBy: { createdAt: "desc" },
        })
        return reply.send({ statusCode: "00", message: "Assets fetched successfully", data: assets })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch assets", error: err.message })
      }
    }
  )

  fastify.post(
    "/assets",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      if (!request.isMultipart()) {
        return reply.code(415).send({ statusCode: "01", message: "Unsupported Media Type" })
      }

      try {
        const website = await getOrCreateWebsite(request.user.companyId)

        let filePart = null
        for await (const part of request.parts()) {
          if (!part.file) continue
          if (filePart) {
            return reply.code(400).send({ statusCode: "01", message: "Only one file allowed" })
          }
          if (part.file.truncated) {
            return reply.code(413).send({ statusCode: "01", message: "File too large" })
          }
          const chunks = []
          for await (const chunk of part.file) chunks.push(chunk)
          filePart = {
            filename: part.filename,
            mimetype: part.mimetype || "application/octet-stream",
            file: Buffer.concat(chunks),
          }
        }

        if (!filePart) {
          return reply.code(400).send({ statusCode: "01", message: "No file uploaded" })
        }

        const [uploaded] = await fastify.uploadToSpaces({ files: [filePart] })

        const asset = await prisma().asset.create({
          data: {
            websiteId: website.id,
            url: uploaded.url,
            key: uploaded.key,
            filename: uploaded.filename,
            mimetype: uploaded.type,
            size: uploaded.size,
          },
        })

        return reply.send({ statusCode: "00", message: "Asset uploaded successfully", data: asset })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to upload asset", error: err.message })
      }
    }
  )

  fastify.delete(
    "/assets/:id",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const asset = await prisma().asset.findUnique({ where: { id: request.params.id } })
        if (!asset || asset.websiteId !== website.id) {
          return reply.code(404).send({ statusCode: "02", message: "Asset not found" })
        }

        await fastify.deleteFromSpaces(asset.key)
        await prisma().asset.delete({ where: { id: asset.id } })

        return reply.send({ statusCode: "00", message: "Asset deleted successfully" })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to delete asset", error: err.message })
      }
    }
  )

  // ---- Navigation ---------------------------------------------------------

  fastify.get(
    "/navigation",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const navigation = await getOrCreateNavigation(website.id)
        const resolved = await resolveNavigation(navigation, website.id)
        return reply.send({ statusCode: "00", message: "Navigation fetched successfully", data: resolved })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch navigation", error: err.message })
      }
    }
  )

  fastify.put(
    "/navigation",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const navigation = await getOrCreateNavigation(website.id)
        const { style, sticky, transparent, showSearch, showSocial, ctaButton, items } = request.body || {}
        const data = {}
        if (style !== undefined) data.style = style
        if (sticky !== undefined) data.sticky = sticky
        if (transparent !== undefined) data.transparent = transparent
        if (showSearch !== undefined) data.showSearch = showSearch
        if (showSocial !== undefined) data.showSocial = showSocial
        if (ctaButton !== undefined) data.ctaButton = ctaButton
        if (items !== undefined) data.items = items

        const updated = await prisma().navigation.update({ where: { id: navigation.id }, data })
        const resolved = await resolveNavigation(updated, website.id)
        return reply.send({ statusCode: "00", message: "Navigation updated successfully", data: resolved })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to update navigation", error: err.message })
      }
    }
  )

  // ---- Global Components ---------------------------------------------------

  fastify.get(
    "/global-components",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const components = await prisma().globalComponent.findMany({ where: { websiteId: website.id } })
        return reply.send({ statusCode: "00", message: "Global components fetched successfully", data: components })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch global components", error: err.message })
      }
    }
  )

  fastify.get(
    "/global-components/:key",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const key = request.params.key
        let component = await prisma().globalComponent.findUnique({ where: { websiteId_key: { websiteId: website.id, key } } })
        return reply.send({ statusCode: "00", message: "Global component fetched successfully", data: component })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch global component", error: err.message })
      }
    }
  )

  fastify.put(
    "/global-components/:key",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const key = request.params.key
        const { blockType, props } = request.body || {}
        if (!blockType || !props) {
          return reply.code(400).send({ statusCode: "01", message: "blockType and props are required" })
        }

        const component = await prisma().globalComponent.upsert({
          where: { websiteId_key: { websiteId: website.id, key } },
          create: { websiteId: website.id, key, blockType, props },
          update: { blockType, props },
        })
        return reply.send({ statusCode: "00", message: "Global component updated successfully", data: component })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to update global component", error: err.message })
      }
    }
  )

  // ---- Publish / Deployments ---------------------------------------------

  fastify.post(
    "/publish",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)

        const last = await prisma().deployment.findFirst({ where: { websiteId: website.id }, orderBy: { version: "desc" } })
        const version = (last?.version ?? 0) + 1

        const deployment = await prisma().deployment.create({
          data: { websiteId: website.id, version, status: "QUEUED", createdBy: request.user.id },
        })

        await publishQueue.add("publish", { deploymentId: deployment.id })

        return reply.send({ statusCode: "00", message: "Publish queued", data: deployment })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to queue publish", error: err.message })
      }
    }
  )

  fastify.get(
    "/publish-status",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const latest = await prisma().deployment.findFirst({ where: { websiteId: website.id }, orderBy: { version: "desc" } })
        return reply.send({ statusCode: "00", message: "Publish status fetched successfully", data: latest })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch publish status", error: err.message })
      }
    }
  )

  fastify.get(
    "/deployments",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const deployments = await prisma().deployment.findMany({ where: { websiteId: website.id }, orderBy: { version: "desc" } })
        return reply.send({ statusCode: "00", message: "Deployments fetched successfully", data: deployments })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch deployments", error: err.message })
      }
    }
  )

  fastify.post(
    "/deployments/:id/rollback",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const target = await prisma().deployment.findUnique({ where: { id: request.params.id } })
        if (!target || target.websiteId !== website.id) {
          return reply.code(404).send({ statusCode: "02", message: "Deployment not found" })
        }
        if (target.status !== "SUCCEEDED") {
          return reply.code(400).send({ statusCode: "03", message: "Can only roll back to a succeeded deployment" })
        }

        const primaryDomain = await prisma().domain.findFirst({ where: { websiteId: website.id, isPrimary: true } })
        const { previewUrl } = await spacesStaticHost.rollback({ websiteId: website.id, version: target.version })

        const last = await prisma().deployment.findFirst({ where: { websiteId: website.id }, orderBy: { version: "desc" } })
        const rollbackDeployment = await prisma().deployment.create({
          data: {
            websiteId: website.id,
            version: (last?.version ?? 0) + 1,
            status: "ROLLED_BACK",
            previewUrl,
            productionUrl: primaryDomain ? `https://${primaryDomain.hostname}` : null,
            createdBy: request.user.id,
            completedAt: new Date(),
          },
        })

        fastify.emitToCompany(request.user.companyId, "publish:progress", { deploymentId: rollbackDeployment.id, status: "ROLLED_BACK", previewUrl })

        return reply.send({ statusCode: "00", message: "Rolled back successfully", data: rollbackDeployment })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to roll back", error: err.message })
      }
    }
  )

  // ---- Domains --------------------------------------------------------------

  fastify.get(
    "/domains",
    { preHandler: checkRole(...READ_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const domains = await prisma().domain.findMany({ where: { websiteId: website.id }, orderBy: { createdAt: "asc" } })
        return reply.send({ statusCode: "00", message: "Domains fetched successfully", data: domains })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to fetch domains", error: err.message })
      }
    }
  )

  fastify.post(
    "/domains",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const { hostname } = request.body || {}
        if (!hostname) {
          return reply.code(400).send({ statusCode: "01", message: "hostname is required" })
        }

        const existing = await prisma().domain.findUnique({ where: { hostname } })
        if (existing) {
          return reply.code(409).send({ statusCode: "03", message: "This domain is already in use" })
        }

        const domain = await prisma().domain.create({ data: { websiteId: website.id, hostname } })
        return reply.send({ statusCode: "00", message: "Domain added successfully", data: domain })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to add domain", error: err.message })
      }
    }
  )

  fastify.delete(
    "/domains/:id",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const domain = await prisma().domain.findUnique({ where: { id: request.params.id } })
        if (!domain || domain.websiteId !== website.id) {
          return reply.code(404).send({ statusCode: "02", message: "Domain not found" })
        }
        await prisma().domain.delete({ where: { id: domain.id } })
        return reply.send({ statusCode: "00", message: "Domain removed successfully" })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to remove domain", error: err.message })
      }
    }
  )

  fastify.post(
    "/domains/:id/set-primary",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const domain = await prisma().domain.findUnique({ where: { id: request.params.id } })
        if (!domain || domain.websiteId !== website.id) {
          return reply.code(404).send({ statusCode: "02", message: "Domain not found" })
        }

        await prisma().$transaction([
          prisma().domain.updateMany({ where: { websiteId: website.id, isPrimary: true }, data: { isPrimary: false } }),
          prisma().domain.update({ where: { id: domain.id }, data: { isPrimary: true } }),
        ])

        return reply.send({ statusCode: "00", message: "Primary domain updated successfully" })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to set primary domain", error: err.message })
      }
    }
  )

  // Real check (Node's own dns.resolveTxt) against `_qsr-verify.<hostname>` -
  // no external DNS API/service, no guided wizard UI (deferred), just an
  // honest verification of whatever the user actually put in their DNS.
  fastify.post(
    "/domains/:id/verify",
    { preHandler: checkRole(...WRITE_ROLES) },
    async (request, reply) => {
      try {
        const website = await getOrCreateWebsite(request.user.companyId)
        const domain = await prisma().domain.findUnique({ where: { id: request.params.id } })
        if (!domain || domain.websiteId !== website.id) {
          return reply.code(404).send({ statusCode: "02", message: "Domain not found" })
        }

        let verified = false
        try {
          const records = await dns.resolveTxt(`_qsr-verify.${domain.hostname}`)
          verified = records.some((chunks) => chunks.join("").trim() === domain.verificationToken)
        } catch {
          verified = false
        }

        const updated = await prisma().domain.update({
          where: { id: domain.id },
          data: { verificationStatus: verified ? "VERIFIED" : "FAILED" },
        })

        return reply.send({ statusCode: "00", message: verified ? "Domain verified successfully" : "Verification failed - TXT record not found or doesn't match", data: updated })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: "99", message: "Failed to verify domain", error: err.message })
      }
    }
  )
}

module.exports = builderRoutes
