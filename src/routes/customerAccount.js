'use strict'
const checkRole = require('../utils/checkRole')
const { ORDER_INCLUDE } = require('../services/orderService')

/**
 * Authenticated customer self-service routes for the CUSTOMER (white-label)
 * app - profile + order history. Mounted at /api/customer, deliberately NOT
 * under /api/public, so the existing global bearer-token preHandler in
 * server.js applies normally (see routes/public.js's auth section for where
 * the token is issued).
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

  // A customer account is a global identity and CAN have ordered from more
  // than one company, but each white-label tenant's UI must only ever show
  // that tenant's own orders - the CUSTOMER app always passes ?companyId=
  // (the resolved tenant's id) when viewing "Your Orders" from within a
  // tenant's branded pages, scoping the query accordingly.
  fastify.get('/orders', { preHandler: checkRole('CUSTOMER') }, async (request, reply) => {
    const { companyId } = request.query
    const orders = await fastify.prisma.order.findMany({
      where: { customerId: request.user.id, ...(companyId ? { companyId } : {}) },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return reply.send({ statusCode: '00', message: 'Orders fetched successfully', data: orders })
  })
}
