'use strict'
// Server-to-server client for the central Payment Subscription product.
// Same contract Fee Collection uses (x-api-key auth, /plans/products/:id/plans,
// /subscriptions/initiate), plus /subscriptions/verifyMandate - the central
// service's own server-side Worldline check, which is the only trusted
// source of "this mandate is active". The API key never leaves this file.
const fp = require('fastify-plugin')
const axios = require('axios')

class CentralSubscriptionError extends Error {
  /**
   * @param {string} code  stable machine code for callers / API responses
   * @param {string} message safe, user-presentable message
   */
  constructor(code, message, { status, cause } = {}) {
    super(message)
    this.name = 'CentralSubscriptionError'
    this.code = code
    this.httpStatus = status || 502
    if (cause) this.cause = cause
  }
}

async function subscriptionPlugin(fastify, opts) {
  const baseURL = opts.SUBSCRIPTION_BASE_URL
  const apiKey = opts.SUBSCRIPTION_APIKEY
  const productId = opts.SUBS_PRODUCT_ID
  const configured = Boolean(baseURL && apiKey && productId)

  if (!configured) {
    fastify.log.warn('Subscription integration not configured (SUBSCRIPTION_BASE_URL / SUBSCRIPTION_APIKEY / SUBS_PRODUCT_ID) - plan purchase is disabled, trial limits still apply')
  }

  const http = axios.create({
    baseURL,
    timeout: opts.timeout || 10000,
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
  })

  function assertConfigured() {
    if (!configured) {
      throw new CentralSubscriptionError('SUBSCRIPTION_NOT_CONFIGURED', 'Subscriptions are not configured on this server yet', { status: 503 })
    }
  }

  // Map transport-level failures to safe errors. Never include headers or
  // the request body in logs - the body carries customer contact details.
  function toError(err, action) {
    const status = err.response?.status
    fastify.log.error({ action, status, code: err.code }, 'Central subscription service call failed')
    if (status === 401 || status === 403) {
      return new CentralSubscriptionError('SUBSCRIPTION_AUTH_FAILED', 'The subscription service rejected this server\'s credentials', { status: 502, cause: err })
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return new CentralSubscriptionError('SUBSCRIPTION_SERVICE_TIMEOUT', 'The subscription service took too long to respond. Please try again.', { status: 504, cause: err })
    }
    return new CentralSubscriptionError('SUBSCRIPTION_SERVICE_UNAVAILABLE', 'The subscription service is unavailable right now. Please try again shortly.', { status: 503, cause: err })
  }

  /** All plans registered under the QSR product (SUBS_PRODUCT_ID). */
  async function getProductPlans() {
    assertConfigured()
    let body
    try {
      ;({ data: body } = await http.get(`/plans/products/${encodeURIComponent(productId)}/plans`))
    } catch (err) {
      throw toError(err, 'getProductPlans')
    }
    if (body?.statusCode !== '00' || !Array.isArray(body.plans)) {
      throw new CentralSubscriptionError('SUBSCRIPTION_BAD_RESPONSE', 'Could not load plans from the subscription service')
    }
    return body.plans
  }

  /**
   * Starts a Worldline mandate checkout for a plan. Returns the central
   * response body as-is: { statusCode, message, data } where data is the
   * signed checkout payload (txn_id = central order_id).
   */
  async function initiate({ planId, customerName, emailId, mobileNumber }) {
    assertConfigured()
    try {
      const { data } = await http.post('/subscriptions/initiate', { planId, customerName, emailId, mobileNumber })
      return data
    } catch (err) {
      throw toError(err, 'initiate')
    }
  }

  /**
   * Asks the central service to verify a mandate with Worldline (server to
   * server) and returns its updated order: { statusCode, message, data:
   * { order_id, planId, mandateStatus, mandateId, status, ... } }.
   */
  async function verifyMandate(orderId) {
    assertConfigured()
    try {
      const { data } = await http.post('/subscriptions/verifyMandate', { order_id: String(orderId) })
      return data
    } catch (err) {
      throw toError(err, 'verifyMandate')
    }
  }

  fastify.decorate('centralSubscription', {
    configured,
    productId,
    getProductPlans,
    initiate,
    verifyMandate,
  })
  fastify.decorate('CentralSubscriptionError', CentralSubscriptionError)
}

module.exports = fp(subscriptionPlugin, { name: 'subscription-central-client' })
module.exports.CentralSubscriptionError = CentralSubscriptionError
