'use strict'
const checkRole = require('../utils/checkRole')
const { ORDER_INCLUDE } = require('../services/orderService')

/**
 * Authenticated customer self-service routes for the CUSTOMER (marketplace)
 * app - profile + cross-company order history. Mounted at /api/customer,
 * deliberately NOT under /api/public, so the existing global bearer-token
 * preHandler in server.js applies normally (see routes/public.js's auth
 * section for where the token is issued).
 */
module.exports = async function (fastify, opts) {
  fastify.get('/me', { preHandler: checkRole('CUSTOMER') }, async (request, reply) => {
    const customer = await fastify.prisma.customer.findUnique({ where: { id: request.user.id } })
    if (!customer) return reply.code(404).send({ statusCode: '01', message: 'Account not found' })
    return reply.send({
      statusCode: '00',
      message: 'Profile fetched successfully',
      data: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
    })
  })

  fastify.patch('/me', { preHandler: checkRole('CUSTOMER') }, async (request, reply) => {
    const { name, phone } = request.body
    const customer = await fastify.prisma.customer.update({
      where: { id: request.user.id },
      data: { ...(name ? { name } : {}), ...(phone !== undefined ? { phone } : {}) },
    })
    return reply.send({
      statusCode: '00',
      message: 'Profile updated successfully',
      data: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
    })
  })

  // Unlike every admin-side order query, this is intentionally NOT scoped to
  // a single companyId - a logged-in customer's history spans every
  // restaurant company they've ordered from in the marketplace.
  fastify.get('/orders', { preHandler: checkRole('CUSTOMER') }, async (request, reply) => {
    const orders = await fastify.prisma.order.findMany({
      where: { customerId: request.user.id },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return reply.send({ statusCode: '00', message: 'Orders fetched successfully', data: orders })
  })
}
