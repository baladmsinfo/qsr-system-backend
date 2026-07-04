'use strict'
const fp = require('fastify-plugin')
const { PrismaClient } = require('@prisma/client')

async function prismaPlugin(fastify, opts) {
  const prisma = new PrismaClient({ log: ['error'] })
  await prisma.$connect()
  fastify.decorate('prisma', prisma)

  fastify.addHook('onClose', async (server) => {
    await server.prisma.$disconnect()
  })
}
module.exports = fp(prismaPlugin)
