'use strict'
const { SubscriptionError } = require('../services/subscription.service')
const { CentralSubscriptionError } = require('../plugins/subscription')

/**
 * Sends a subscription/limit error in the API's usual shape and returns true,
 * or returns false so the caller falls through to its own error handling.
 * Limit errors use statusCode "10" (the Fee Collection convention) plus a
 * stable `code` and `data` the frontend uses to show the upgrade prompt.
 */
function sendSubscriptionError(reply, err) {
  if (err instanceof SubscriptionError || err instanceof CentralSubscriptionError) {
    return reply.code(err.httpStatus || 400).send({
      statusCode: err.code === 'SUBSCRIPTION_LIMIT_REACHED' ? '10' : '99',
      code: err.code,
      message: err.message,
      ...(err.details ? { data: err.details } : {}),
    }), true
  }
  return false
}

module.exports = { sendSubscriptionError }
