'use strict'
const crypto = require('crypto')
const checkRole = require('../utils/checkRole')
const { resolveBranchId } = require('../utils/scope')

const MANAGERS = ['SUPERADMIN', 'BRANCHADMIN']

module.exports = async function (fastify, opts) {
  // Fetch this branch's menu-card QR, lazily generating one on first use
  fastify.get('/', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const branchId = resolveBranchId(request)
      if (!branchId) return reply.code(400).send({ statusCode: '01', message: 'branchId is required' })

      let branch = await fastify.prisma.branch.findUnique({ where: { id: branchId } })
      if (!branch) return reply.code(404).send({ statusCode: '01', message: 'Branch not found' })

      if (!branch.menuQrCode) {
        branch = await fastify.prisma.branch.update({
          where: { id: branchId },
          data: { menuQrCode: `${branchId}-menu-${crypto.randomUUID()}` },
        })
      }

      return reply.send({
        statusCode: '00',
        message: 'Menu QR fetched successfully',
        data: { id: branch.id, name: branch.name, menuQrCode: branch.menuQrCode },
      })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch menu QR', error: err.message })
    }
  })

  // Regenerate the branch's menu-card QR token (e.g. if a printed QR is compromised)
  fastify.post('/regenerate', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const branchId = resolveBranchId(request)
      if (!branchId) return reply.code(400).send({ statusCode: '01', message: 'branchId is required' })

      const existing = await fastify.prisma.branch.findUnique({ where: { id: branchId } })
      if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Branch not found' })

      const branch = await fastify.prisma.branch.update({
        where: { id: branchId },
        data: { menuQrCode: `${branchId}-menu-${crypto.randomUUID()}` },
      })

      return reply.send({
        statusCode: '00',
        message: 'Menu QR regenerated successfully',
        data: { id: branch.id, name: branch.name, menuQrCode: branch.menuQrCode },
      })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to regenerate menu QR', error: err.message })
    }
  })
}
