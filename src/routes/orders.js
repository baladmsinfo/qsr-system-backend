'use strict'
const checkRole = require('../utils/checkRole')
const svc = require('../services/orderService')
const { resolveBranchId } = require('../utils/scope')

const STAFF = ['SUPERADMIN', 'BRANCHADMIN', 'WAITER', 'CASHIER', 'KITCHEN', 'ACCOUNTANT']
const ORDER_TAKERS = ['SUPERADMIN', 'BRANCHADMIN', 'WAITER', 'CASHIER']

module.exports = async function (fastify, opts) {
  fastify.get('/', { preHandler: checkRole(...STAFF) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const branchId = resolveBranchId(request)
      const { status, tableId, fromDate, toDate, page = 1, take = 50 } = request.query

      const { orders, total, totalAmount } = await svc.listOrders(fastify.prisma, {
        companyId,
        branchId,
        status,
        tableId,
        fromDate,
        toDate,
        take: Number(take),
        skip: (Number(page) - 1) * Number(take),
      })

      return reply.send({
        statusCode: '00',
        message: 'Orders fetched successfully',
        data: orders,
        meta: { total, page: Number(page), take: Number(take), totalAmount },
      })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch orders', error: err.message })
    }
  })

  fastify.get('/:id', { preHandler: checkRole(...STAFF) }, async (request, reply) => {
    try {
      const order = await svc.getOrder(fastify.prisma, { orderId: request.params.id, companyId: request.user.companyId })
      return reply.send({ statusCode: '00', message: 'Order fetched successfully', data: order })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })

  // Waiter/cashier/branch admin taking a dine-in order directly (not via QR)
  fastify.post('/', { preHandler: checkRole(...ORDER_TAKERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const branchId = resolveBranchId(request)
      const { tableId, customerId, notes, items } = request.body

      const order = await svc.createOrder(fastify, {
        companyId,
        branchId,
        tableId,
        customerId,
        waiterId: request.user.role === 'WAITER' ? request.user.id : request.body.waiterId || null,
        source: request.user.role === 'CASHIER' ? 'POS' : 'WAITER',
        notes,
        items,
      })

      return reply.code(201).send({ statusCode: '00', message: 'Order created successfully', data: order })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })

  fastify.patch('/:id/status', { preHandler: checkRole(...STAFF) }, async (request, reply) => {
    try {
      const order = await svc.updateOrderStatus(fastify, {
        orderId: request.params.id,
        companyId: request.user.companyId,
        status: request.body.status,
        actor: { id: request.user.id, role: request.user.role },
      })

      return reply.send({ statusCode: '00', message: 'Order status updated successfully', data: order })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })

  // Waiter moving a table (guests relocated)
  fastify.patch('/:id/table', { preHandler: checkRole('SUPERADMIN', 'BRANCHADMIN', 'WAITER') }, async (request, reply) => {
    try {
      const order = await svc.moveOrderTable(fastify, {
        orderId: request.params.id,
        companyId: request.user.companyId,
        tableId: request.body.tableId,
      })

      return reply.send({ statusCode: '00', message: 'Order table updated successfully', data: order })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })
}
