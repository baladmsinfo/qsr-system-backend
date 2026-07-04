'use strict'
const crypto = require('crypto')
const checkRole = require('../utils/checkRole')
const { resolveBranchId } = require('../utils/scope')

const STAFF = ['SUPERADMIN', 'BRANCHADMIN', 'WAITER', 'CASHIER']
const MANAGERS = ['SUPERADMIN', 'BRANCHADMIN']

module.exports = async function (fastify, opts) {
  fastify.get('/', { preHandler: checkRole(...STAFF) }, async (request, reply) => {
    try {
      const branchId = resolveBranchId(request)
      if (!branchId) return reply.code(400).send({ statusCode: '01', message: 'branchId is required' })

      const tables = await fastify.prisma.diningTable.findMany({
        where: { branchId },
        orderBy: { tableNo: 'asc' },
      })

      return reply.send({ statusCode: '00', message: 'Tables fetched successfully', data: tables })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch tables', error: err.message })
    }
  })

  fastify.post('/', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const branchId = resolveBranchId(request)
      if (!branchId) return reply.code(400).send({ statusCode: '01', message: 'branchId is required' })

      const { tableNo, capacity } = request.body

      const table = await fastify.prisma.diningTable.create({
        data: {
          branchId,
          tableNo,
          capacity,
          qrCode: `${branchId}-table-${crypto.randomUUID()}`,
        },
      })

      return reply.code(201).send({ statusCode: '00', message: 'Table created successfully', data: table })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to create table', error: err.message })
    }
  })

  fastify.put('/:id', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const branchId = resolveBranchId(request)
      const existing = await fastify.prisma.diningTable.findFirst({ where: { id: request.params.id, branchId } })
      if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Table not found' })

      const { tableNo, capacity, active } = request.body
      const table = await fastify.prisma.diningTable.update({
        where: { id: request.params.id },
        data: { tableNo, capacity, active },
      })

      return reply.send({ statusCode: '00', message: 'Table updated successfully', data: table })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to update table', error: err.message })
    }
  })

  // Regenerate a table's QR token (e.g. if a printed QR is compromised)
  fastify.post('/:id/regenerate-qr', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const branchId = resolveBranchId(request)
      const existing = await fastify.prisma.diningTable.findFirst({ where: { id: request.params.id, branchId } })
      if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Table not found' })

      const table = await fastify.prisma.diningTable.update({
        where: { id: request.params.id },
        data: { qrCode: `${branchId}-table-${crypto.randomUUID()}` },
      })

      return reply.send({ statusCode: '00', message: 'QR code regenerated successfully', data: table })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to regenerate QR code', error: err.message })
    }
  })

  fastify.delete('/:id', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const branchId = resolveBranchId(request)
      const existing = await fastify.prisma.diningTable.findFirst({ where: { id: request.params.id, branchId } })
      if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Table not found' })

      await fastify.prisma.diningTable.delete({ where: { id: request.params.id } })

      return reply.send({ statusCode: '00', message: 'Table deleted successfully' })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to delete table', error: err.message })
    }
  })
}
