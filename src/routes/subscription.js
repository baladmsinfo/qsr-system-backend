'use strict'
// Company subscription - mounted at /api/subscription (staff JWT required by
// the global auth hook). The company is always taken from the token, never
// from the request, so nobody can read or buy for another business.
const checkRole = require('../utils/checkRole')
const svc = require('../services/subscription.service')
const { sendSubscriptionError } = require('../utils/subscriptionErrors')

const ALL_STAFF = ['SUPERADMIN', 'BRANCHADMIN', 'KITCHEN', 'CASHIER', 'WAITER', 'ACCOUNTANT']
// The subscription belongs to the company, so only its owner manages it.
const OWNER = ['SUPERADMIN']

module.exports = async function (fastify) {
  function fail(request, reply, err, fallback) {
    if (sendSubscriptionError(reply, err)) return
    request.log.error(err)
    return reply.code(500).send({ statusCode: '99', message: fallback })
  }

  // Current plan, limits and usage - every staff screen uses this to show
  // "3 of 5 used" and to disable actions before the server would refuse them.
  fastify.get('/status', {
    preHandler: checkRole(...ALL_STAFF),
    schema: { tags: ['Subscription'], summary: 'Current subscription, limits and usage for your business' },
  }, async (request, reply) => {
    try {
      // Only the owner's calls trigger the outbound pending-payment recheck.
      const data = await svc.getStatus(fastify, request.user.companyId, { reconcile: request.user.role === 'SUPERADMIN' })
      return reply.send({ statusCode: '00', message: 'Subscription status fetched successfully', data })
    } catch (err) {
      return fail(request, reply, err, 'Failed to fetch subscription status')
    }
  })

  fastify.get('/plans', {
    preHandler: checkRole(...OWNER),
    schema: { tags: ['Subscription'], summary: 'Plans available for QSR (from the central subscription product)' },
  }, async (request, reply) => {
    try {
      const plans = await svc.listPlans(fastify)
      return reply.send({ statusCode: '00', message: 'Plans fetched successfully', data: plans })
    } catch (err) {
      return fail(request, reply, err, 'Failed to fetch subscription plans')
    }
  })

  fastify.post('/initiate', {
    preHandler: checkRole(...OWNER),
    schema: {
      tags: ['Subscription'],
      summary: 'Start a mandate checkout for a plan (price is taken from the central plan, not the request)',
      body: { type: 'object', required: ['planId'], properties: { planId: { type: 'string', minLength: 1, maxLength: 64 } } },
    },
  }, async (request, reply) => {
    try {
      const data = await svc.initiateSubscription(fastify, {
        companyId: request.user.companyId,
        planId: request.body.planId,
        actorId: request.user.id,
      })
      return reply.send({ statusCode: '00', message: 'Checkout started', data })
    } catch (err) {
      return fail(request, reply, err, 'Failed to start checkout')
    }
  })

  // Called by the app after the checkout window closes (success OR failure -
  // the browser's own result is ignored). Asks the central service, which
  // asks Worldline; only its answer can activate the subscription.
  fastify.post('/verify', {
    preHandler: checkRole(...OWNER),
    schema: {
      tags: ['Subscription'],
      summary: 'Verify a checkout with the payment service and activate it if confirmed',
      body: { type: 'object', required: ['subscriptionId'], properties: { subscriptionId: { type: 'string', minLength: 1, maxLength: 64 } } },
    },
  }, async (request, reply) => {
    try {
      const sub = await svc.verifySubscription(fastify, {
        companyId: request.user.companyId,
        subscriptionId: request.body.subscriptionId,
        actorId: request.user.id,
      })
      const status = await svc.getStatus(fastify, request.user.companyId, { reconcile: false })
      return reply.send({
        statusCode: '00',
        message: sub.status === 'ACTIVE' ? 'Subscription activated' : sub.status === 'PENDING' ? 'Payment is still being confirmed' : 'Payment was not completed',
        data: { result: sub.status, reason: sub.statusReason || null, status },
      })
    } catch (err) {
      return fail(request, reply, err, 'Failed to verify payment')
    }
  })

  fastify.get('/history', {
    preHandler: checkRole(...OWNER),
    schema: { tags: ['Subscription'], summary: 'Subscription and checkout history for your business' },
  }, async (request, reply) => {
    try {
      const data = await svc.getHistory(fastify.prisma, request.user.companyId)
      return reply.send({ statusCode: '00', message: 'Subscription history fetched successfully', data })
    } catch (err) {
      return fail(request, reply, err, 'Failed to fetch subscription history')
    }
  })
}
