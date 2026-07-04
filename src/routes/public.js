'use strict'
const svc = require('../services/orderService')

/**
 * No-auth routes for the CUSTOMER (QR ordering) app. Registered under
 * /api/public and listed in server.js's publicPaths so they skip the JWT/API-key hook.
 */
module.exports = async function (fastify, opts) {
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
              company: { select: { name: true, logoUrlShort: true, logoUrlLong: true, companyType: true } },
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

  // Branch menu for the customer app - AVAILABLE and OUT_OF_STOCK items shown (greyed out client-side), HIDDEN excluded
  fastify.get('/branches/:branchId/menu', async (request, reply) => {
    try {
      const { branchId } = request.params

      const branch = await fastify.prisma.branch.findUnique({ where: { id: branchId } })
      if (!branch) return reply.code(404).send({ statusCode: '01', message: 'Branch not found' })

      const categories = await fastify.prisma.menuCategory.findMany({
        where: { companyId: branch.companyId },
        include: {
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

  // Customer places an order from the QR menu
  fastify.post('/orders', async (request, reply) => {
    try {
      const { branchId, tableId, items, customerName, customerPhone, notes } = request.body

      const branch = await fastify.prisma.branch.findUnique({ where: { id: branchId } })
      if (!branch) return reply.code(404).send({ statusCode: '01', message: 'Branch not found' })
      if (!branch.acceptOrders || !branch.isOnline) {
        return reply.code(400).send({ statusCode: '02', message: 'This branch is not accepting orders right now' })
      }

      let customerId = null
      if (customerName || customerPhone) {
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
