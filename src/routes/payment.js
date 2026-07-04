'use strict'
const checkRole = require('../utils/checkRole')

module.exports = async function (fastify, opts) {
  // List payments (optionally filtered by order)
  fastify.get(
    '/',
    { preHandler: checkRole('SUPERADMIN', 'BRANCHADMIN', 'CASHIER', 'ACCOUNTANT') },
    async (req, reply) => {
      try {
        const { orderId } = req.query
        const where = { companyId: req.user.companyId }
        if (orderId) where.orderId = orderId

        const payments = await fastify.prisma.payment.findMany({
          where,
          orderBy: { date: 'desc' },
        })

        return reply.send({ statusCode: '00', message: 'Payments fetched successfully', data: payments })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch payments', error: err.message })
      }
    }
  )

  fastify.get(
    '/:id',
    { preHandler: checkRole('SUPERADMIN', 'BRANCHADMIN', 'CASHIER', 'ACCOUNTANT') },
    async (req, reply) => {
      try {
        const payment = await fastify.prisma.payment.findFirst({
          where: { id: req.params.id, companyId: req.user.companyId },
          include: { order: { select: { id: true, status: true, totalAmount: true } } },
        })

        if (!payment) return reply.code(404).send({ statusCode: '01', message: 'Payment not found' })

        return reply.send({ statusCode: '00', message: 'Payment fetched successfully', data: payment })
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch payment', error: err.message })
      }
    }
  )
}
