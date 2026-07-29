'use strict'
const svc = require('../services/orderService')
const { hashPassword, comparePassword } = require('../utils/hash')

/**
 * No-auth routes for the CUSTOMER (QR ordering + single-tenant white-label)
 * app. Registered under /api/public and listed in server.js's publicPaths so
 * they skip the JWT/API-key hook. Customer login/register live here too
 * since they need to be reachable before a token exists; authenticated
 * customer-account routes (profile, order history) live in
 * routes/customerAccount.js instead, mounted OUTSIDE /api/public so the
 * normal bearer-token check applies.
 *
 * IMPORTANT (multi-tenant isolation): there is deliberately NO route that
 * lists/searches across companies. The only way to resolve a company from
 * the CUSTOMER app is by its own tenant slug (GET /tenant/:slug), by a QR
 * code that already belongs to one of its tables (GET /qr/:qrCode), or by
 * a branch's standalone menu-card QR (GET /menu-qr/:code) - a customer can
 * never enumerate or browse into another company's data.
 */

// Haversine distance in km - dataset of restaurant branches is small, so a
// DB-side query + JS sort is simpler and plenty fast (no PostGIS needed).
// Page-linked nav items only store a pageId - label/href are derived live
// against the tenant's PUBLISHED pages, so a link to a still-draft or deleted
// page is silently dropped rather than rendering a broken link on the live site.
function resolvePublicNavItems(items, publishedPagesById) {
  return (items || [])
    .filter((item) => item.linkType !== 'page' || publishedPagesById.has(item.pageId))
    .map((item) => {
      const resolved = { ...item }
      if (item.linkType === 'page') {
        const page = publishedPagesById.get(item.pageId)
        resolved.label = item.label || page.title
        resolved.href = `/${page.slug}`
      }
      if (item.children?.length) resolved.children = resolvePublicNavItems(item.children, publishedPagesById)
      return resolved
    })
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

module.exports = async function (fastify, opts) {
  // ---------------- Tenant resolution (single company, by its own slug) ----------------
  // The ONLY entry point for a company's branded URL. Returns that company's
  // profile plus every one of ITS OWN branches (never another company's) -
  // sorted by distance when lat/lng are given, so the customer app can
  // auto-suggest the nearest branch or fall back to a full manual list.
  fastify.get('/tenant/:slug', async (request, reply) => {
    try {
      const { lat, lng, preview: previewToken } = request.query
      const hasCoords = lat !== undefined && lng !== undefined

      const company = await fastify.prisma.company.findFirst({
        where: { tenant: request.params.slug, isPubliclyListed: true },
        include: {
          branches: true,
          storefrontContent: true,
          website: {
            include: {
              theme: true,
              // Fetched unfiltered/unconditionally (including draftBlocks) -
              // whether a page is actually exposed, and with which blocks,
              // is decided below once `isPreview` is known against this
              // website's own previewToken, not at query time.
              pages: {
                select: { id: true, slug: true, title: true, isHome: true, status: true, draftBlocks: true, publishedBlocks: true, seoTitle: true, seoDescription: true },
              },
              navigation: true,
              globalComponents: true,
            },
          },
        },
      })
      if (!company) return reply.code(404).send({ statusCode: '01', message: 'Restaurant not found' })

      // Only this exact website's own token unlocks its own draft pages -
      // an unguessable uuid, so a wrong/missing token just falls through to
      // the normal published-only view rather than erroring.
      const isPreview = !!previewToken && !!company.website && previewToken === company.website.previewToken
      if (company.website) {
        company.website.pages = company.website.pages
          .filter((p) => isPreview || p.status === 'PUBLISHED')
          .map((p) => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            isHome: p.isHome,
            seoTitle: p.seoTitle,
            seoDescription: p.seoDescription,
            publishedBlocks: isPreview ? p.draftBlocks : p.publishedBlocks,
          }))
        delete company.website.previewToken
      }

      const branches = company.branches
        .map((b) => ({
          id: b.id,
          name: b.name,
          addressLine1: b.addressLine1,
          city: b.city,
          openingTime: b.openingTime,
          closingTime: b.closingTime,
          pickupAvailable: b.isOnline && b.acceptOrders,
          distanceKm:
            hasCoords && b.latitude != null && b.longitude != null
              ? Number(distanceKm(Number(lat), Number(lng), b.latitude, b.longitude).toFixed(2))
              : null,
        }))
        .sort((a, b) => {
          if (a.distanceKm === null && b.distanceKm === null) return a.name.localeCompare(b.name)
          if (a.distanceKm === null) return 1
          if (b.distanceKm === null) return -1
          return a.distanceKm - b.distanceKm
        })

      return reply.send({
        statusCode: '00',
        message: 'Restaurant fetched successfully',
        data: {
          id: company.id,
          tenant: company.tenant,
          name: company.name,
          companyType: company.companyType,
          logoUrl: company.logoUrlLong || company.logoUrlShort,
          coverImageUrl: company.coverImageUrl,
          description: company.description,
          cuisineTags: company.cuisineTags,
          branches,
          storefrontContent: company.storefrontContent || null,
          website: company.website
            ? {
                ...company.website,
                navigation: company.website.navigation
                  ? {
                      ...company.website.navigation,
                      items: resolvePublicNavItems(
                        company.website.navigation.items,
                        new Map(company.website.pages.map((p) => [p.id, p]))
                      ),
                    }
                  : null,
              }
            : null,
        },
      })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch restaurant', error: err.message })
    }
  })

  // ---------------- Customer auth (email + password, global identity) ----------------
  fastify.post('/auth/register', async (request, reply) => {
    try {
      const { name, email, password, phone } = request.body
      if (!name || !email || !password) {
        return reply.code(400).send({ statusCode: '02', message: 'name, email and password are required' })
      }

      const existing = await fastify.prisma.customer.findUnique({ where: { email } })
      if (existing) return reply.code(409).send({ statusCode: '03', message: 'An account with this email already exists' })

      const passwordHash = await hashPassword(password)
      const customer = await fastify.prisma.customer.create({ data: { name, email, phone: phone || null, passwordHash } })

      const token = fastify.jwt.sign({ id: customer.id, role: 'CUSTOMER' })
      return reply.code(201).send({
        statusCode: '00',
        message: 'Account created successfully',
        token,
        customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
      })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to create account', error: err.message })
    }
  })

  fastify.post('/auth/login', async (request, reply) => {
    try {
      const { email, password } = request.body
      const customer = await fastify.prisma.customer.findUnique({ where: { email } })
      if (!customer || !customer.passwordHash || !(await comparePassword(password, customer.passwordHash))) {
        return reply.code(401).send({ statusCode: '01', message: 'Invalid email or password' })
      }

      const token = fastify.jwt.sign({ id: customer.id, role: 'CUSTOMER' })
      return reply.send({
        statusCode: '00',
        message: 'Login successful',
        token,
        customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
      })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Login failed', error: err.message })
    }
  })

  // Customer scans a table QR -> resolve branch + table + whether the branch is currently taking orders
  fastify.get('/qr/:qrCode', async (request, reply) => {
    try {
      const table = await fastify.prisma.diningTable.findUnique({
        where: { qrCode: request.params.qrCode },
        include: {
          branch: {
            select: {
              id: true, name: true, companyId: true, isOnline: true, acceptOrders: true,
              openingTime: true, closingTime: true, phone: true,
              company: { select: { tenant: true, name: true, logoUrlShort: true, logoUrlLong: true, companyType: true } },
            },
          },
        },
      })

      if (!table || !table.active) {
        return reply.code(404).send({ statusCode: '01', message: 'Table not found' })
      }

      return reply.send({ statusCode: '00', message: 'Table resolved successfully', data: table })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to resolve QR code', error: err.message })
    }
  })

  // Customer scans a branch's standalone Menu QR (read-only menu card, no
  // table/session involved - the customer orders through a waiter instead)
  fastify.get('/menu-qr/:code', async (request, reply) => {
    try {
      const branch = await fastify.prisma.branch.findUnique({
        where: { menuQrCode: request.params.code },
        select: {
          id: true, name: true, companyId: true, isOnline: true,
          openingTime: true, closingTime: true, phone: true,
          company: { select: { tenant: true, name: true, logoUrlShort: true, logoUrlLong: true, companyType: true } },
        },
      })

      if (!branch) {
        return reply.code(404).send({ statusCode: '01', message: 'Menu not found' })
      }

      return reply.send({ statusCode: '00', message: 'Menu resolved successfully', data: branch })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to resolve menu QR', error: err.message })
    }
  })

  // Branch menu for the customer app - AVAILABLE and OUT_OF_STOCK items shown (greyed out client-side), HIDDEN excluded
  fastify.get('/branches/:branchId/menu', async (request, reply) => {
    try {
      const { branchId } = request.params

      const branch = await fastify.prisma.branch.findUnique({ where: { id: branchId } })
      if (!branch) return reply.code(404).send({ statusCode: '01', message: 'Branch not found' })

      const categories = await fastify.prisma.menuCategory.findMany({
        where: { companyId: branch.companyId },
        include: {
          image: true,
          subCategories: { orderBy: { displayOrder: 'asc' } },
          menuItems: {
            where: { branchId, availability: { not: 'HIDDEN' } },
            orderBy: { displayOrder: 'asc' },
            include: { taxRate: true },
          },
        },
        orderBy: { displayOrder: 'asc' },
      })

      // sub-category items are fetched separately since MenuItem points at only one of category/subCategory scope
      const subCategoryIds = categories.flatMap((c) => c.subCategories.map((s) => s.id))
      const subCategoryItems = subCategoryIds.length
        ? await fastify.prisma.menuItem.findMany({
            where: { branchId, subCategoryId: { in: subCategoryIds }, availability: { not: 'HIDDEN' } },
            orderBy: { displayOrder: 'asc' },
            include: { taxRate: true },
          })
        : []

      const data = categories.map((c) => ({
        ...c,
        subCategories: c.subCategories.map((s) => ({
          ...s,
          menuItems: subCategoryItems.filter((i) => i.subCategoryId === s.id),
        })),
      }))

      return reply.send({ statusCode: '00', message: 'Menu fetched successfully', data })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch menu', error: err.message })
    }
  })

  // Customer places an order from the QR menu (dine-in) or the marketplace
  // app (pickup). Stays fully guest-friendly - a bearer token is optional and
  // only used to link the order to a logged-in customer's account when present.
  fastify.post('/orders', async (request, reply) => {
    try {
      const { branchId, tableId, items, customerName, customerPhone, notes, orderType } = request.body

      const branch = await fastify.prisma.branch.findUnique({ where: { id: branchId } })
      if (!branch) return reply.code(404).send({ statusCode: '01', message: 'Branch not found' })
      if (!branch.acceptOrders || !branch.isOnline) {
        return reply.code(400).send({ statusCode: '02', message: 'This branch is not accepting orders right now' })
      }

      let customerId = null
      const bearer = request.headers.authorization?.split(' ')[1]
      if (bearer) {
        try {
          const decoded = fastify.jwt.verify(bearer)
          if (decoded.role === 'CUSTOMER') customerId = decoded.id
        } catch {
          // Not a valid/expired token - fall through to guest handling below.
        }
      }

      if (!customerId && (customerName || customerPhone)) {
        const customer = await fastify.prisma.customer.create({
          data: { companyId: branch.companyId, name: customerName || 'Guest', phone: customerPhone || null },
        })
        customerId = customer.id
      }

      const order = await svc.createOrder(fastify, {
        companyId: branch.companyId,
        branchId,
        tableId,
        customerId,
        source: 'QR',
        orderType: orderType || 'DINE_IN',
        notes,
        items,
      })

      return reply.code(201).send({ statusCode: '00', message: 'Order placed successfully', data: order })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })

  // Customer polls / subscribes (via socket room order:<id>) to their own order
  fastify.get('/orders/:id', async (request, reply) => {
    try {
      const order = await fastify.prisma.order.findUnique({
        where: { id: request.params.id },
        include: { orderItems: { include: { menuItem: true } }, table: true },
      })

      if (!order) return reply.code(404).send({ statusCode: '01', message: 'Order not found' })

      return reply.send({ statusCode: '00', message: 'Order fetched successfully', data: order })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch order', error: err.message })
    }
  })
}
