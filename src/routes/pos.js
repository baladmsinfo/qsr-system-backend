'use strict'
const checkRole = require('../utils/checkRole')
const { createOrderPayment, refundOrderPayment } = require('../services/paymentServices')
const { resolveBranchId } = require('../utils/scope')

const CASHIERS = ['SUPERADMIN', 'BRANCHADMIN', 'CASHIER']

module.exports = async function (fastify, opts) {
  // Orders ready for billing (SERVED but not yet paid)
  fastify.get('/bills/pending', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const branchId = resolveBranchId(request)

      const orders = await fastify.prisma.order.findMany({
        where: { companyId, ...(branchId ? { branchId } : {}), status: 'SERVED' },
        include: { table: true, orderItems: { include: { menuItem: true } } },
        orderBy: { createdAt: 'asc' },
      })

      return reply.send({ statusCode: '00', message: 'Pending bills fetched successfully', data: orders })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch pending bills', error: err.message })
    }
  })

  // Printable bill for a single order
  fastify.get('/bill/:orderId', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const order = await fastify.prisma.order.findFirst({
        where: { id: request.params.orderId, companyId: request.user.companyId },
        include: {
          table: true,
          customer: true,
          company: { select: { name: true, gstNumber: true, addressLine1: true, city: true, state: true, pincode: true } },
          branch: { select: { name: true, gstNumber: true, phone: true } },
          orderItems: { include: { menuItem: true, taxRate: true } },
          payments: true,
        },
      })

      if (!order) return reply.code(404).send({ statusCode: '01', message: 'Order not found' })

      return reply.send({ statusCode: '00', message: 'Bill fetched successfully', data: order })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch bill', error: err.message })
    }
  })

  // Take payment & close the order
  fastify.post('/orders/:orderId/pay', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const { amount, method, referenceNo, note } = request.body

      const result = await createOrderPayment(fastify, {
        companyId: request.user.companyId,
        orderId: request.params.orderId,
        amount,
        method,
        referenceNo,
        note,
        cashierId: request.user.id,
      })

      return reply.code(201).send({ statusCode: '00', message: 'Payment recorded, order completed', data: result })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })

  // Refund a completed order
  fastify.post('/orders/:orderId/refund', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const { amount, method, note } = request.body

      const payment = await refundOrderPayment(fastify, {
        companyId: request.user.companyId,
        orderId: request.params.orderId,
        amount,
        method,
        note,
      })

      return reply.code(201).send({ statusCode: '00', message: 'Refund recorded successfully', data: payment })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })
}
