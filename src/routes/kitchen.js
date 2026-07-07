'use strict'
const checkRole = require('../utils/checkRole')
const svc = require('../services/kitchenService')
const { resolveBranchId } = require('../utils/scope')

module.exports = async function (fastify, opts) {
  // Kitchen Display: incoming/preparing/ready tickets for a branch
  fastify.get(
    '/tickets',
    { preHandler: checkRole('SUPERADMIN', 'BRANCHADMIN', 'KITCHEN') },
    async (request, reply) => {
      try {
        const branchId = resolveBranchId(request)
        if (!branchId) {
          return reply.code(400).send({ statusCode: '01', message: 'branchId is required' })
        }

        const { station, status } = request.query
        const tickets = await svc.listTickets(fastify.prisma, { branchId, station, status })

        return reply.send({ statusCode: '00', message: 'Kitchen tickets fetched successfully', data: tickets })
      } catch (err) {
        request.log.error(err)
        return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch kitchen tickets', error: err.message })
      }
    }
  )

  // Kitchen only moves a ticket through PENDING -> PREPARING -> READY
  fastify.patch(
    '/tickets/:id/status',
    { preHandler: checkRole('SUPERADMIN', 'BRANCHADMIN', 'KITCHEN') },
    async (request, reply) => {
      try {
        const branchId = resolveBranchId(request)
        const { status } = request.body

        if (!['PENDING', 'PREPARING', 'READY', 'COMPLETED'].includes(status)) {
          return reply.code(400).send({ statusCode: '01', message: 'Invalid ticket status' })
        }

        const ticket = await svc.updateTicketStatus(fastify, {
          ticketId: request.params.id,
          branchId,
          status,
          actor: { id: request.user.id, role: request.user.role },
        })

        return reply.send({ statusCode: '00', message: 'Kitchen ticket updated successfully', data: ticket })
      } catch (err) {
        request.log.error(err)
        return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
      }
    }
  )

  // The only way a CANCELLED ticket (whole order cancelled, or every item on
  // it individually cancelled) can be removed from the active Kitchen Display.
  fastify.patch(
    '/tickets/:id/dismiss',
    { preHandler: checkRole('SUPERADMIN', 'BRANCHADMIN', 'KITCHEN') },
    async (request, reply) => {
      try {
        const branchId = resolveBranchId(request)

        const ticket = await svc.dismissTicket(fastify, {
          ticketId: request.params.id,
          branchId,
          actor: { id: request.user.id, role: request.user.role },
        })

        return reply.send({ statusCode: '00', message: 'Ticket dismissed successfully', data: ticket })
      } catch (err) {
        request.log.error(err)
        return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
      }
    }
  )
}
