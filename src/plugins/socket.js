'use strict'
const fp = require('fastify-plugin')
const { Server } = require('socket.io')

async function socketPlugin(fastify, opts) {
  const io = new Server(fastify.server, {
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
    },
  })

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (token) {
      try {
        socket.data.user = fastify.jwt.verify(token)
      } catch (err) {
        // invalid/expired token -> treat as an anonymous (customer) connection
      }
    }
    next()
  })

  io.on('connection', (socket) => {
    const user = socket.data.user
    if (user?.branchId) socket.join(`branch:${user.branchId}`)
    if (user?.companyId) socket.join(`company:${user.companyId}`)

    socket.on('join:branch', (branchId) => branchId && socket.join(`branch:${branchId}`))
    socket.on('join:company', (companyId) => companyId && socket.join(`company:${companyId}`))
    socket.on('join:order', (orderId) => orderId && socket.join(`order:${orderId}`))
    socket.on('leave:order', (orderId) => orderId && socket.leave(`order:${orderId}`))
  })

  fastify.decorate('io', io)

  fastify.decorate('emitToBranch', (branchId, event, payload) => {
    if (branchId) io.to(`branch:${branchId}`).emit(event, payload)
  })

  fastify.decorate('emitToCompany', (companyId, event, payload) => {
    if (companyId) io.to(`company:${companyId}`).emit(event, payload)
  })

  fastify.decorate('emitToOrder', (orderId, event, payload) => {
    if (orderId) io.to(`order:${orderId}`).emit(event, payload)
  })

  fastify.addHook('onClose', async () => {
    io.close()
  })
}

module.exports = fp(socketPlugin)
