'use strict'
const checkRole = require('../utils/checkRole')
const { resolveBranchId } = require('../utils/scope')
const svc = require('../services/inventoryService')

// Stock levels for quantity-based menu items - SUPERADMIN/BRANCHADMIN only,
// always scoped to one branch (each branch tracks its own stock independently).
const MANAGERS = ['SUPERADMIN', 'BRANCHADMIN']

module.exports = async function (fastify, opts) {
  fastify.get('/', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const branchId = resolveBranchId(request)
      if (!branchId) return reply.code(400).send({ statusCode: '01', message: 'branchId is required' })

      const items = await svc.listStock(fastify.prisma, { companyId, branchId })
      return reply.send({ statusCode: '00', message: 'Inventory fetched successfully', data: items })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch inventory', error: err.message })
    }
  })

  fastify.patch('/:menuItemId', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const branchId = resolveBranchId(request)
      if (!branchId) return reply.code(400).send({ statusCode: '01', message: 'branchId is required' })

      const stock = await svc.setStock(fastify.prisma, {
        companyId,
        branchId,
        menuItemId: request.params.menuItemId,
        quantityAvailable: Number(request.body.quantityAvailable),
        reason: request.body.reason,
        actor: { id: request.user.id, role: request.user.role },
      })

      return reply.send({ statusCode: '00', message: 'Stock updated successfully', data: stock })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })

  // Toggle unlimited stock on/off for a quantity-based item.
  fastify.patch('/:menuItemId/track', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const item = await svc.setTrackInventory(fastify.prisma, {
        companyId,
        menuItemId: request.params.menuItemId,
        trackInventory: !!request.body.trackInventory,
      })

      return reply.send({ statusCode: '00', message: 'Inventory tracking updated successfully', data: item })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })

  fastify.get('/:menuItemId/history', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const branchId = resolveBranchId(request)
      if (!branchId) return reply.code(400).send({ statusCode: '01', message: 'branchId is required' })

      const history = await svc.getHistory(fastify.prisma, { companyId, branchId, menuItemId: request.params.menuItemId })
      return reply.send({ statusCode: '00', message: 'Stock history fetched successfully', data: history })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })
}
