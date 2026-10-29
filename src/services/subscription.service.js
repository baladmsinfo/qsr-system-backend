'use strict'
/**
 * Subscription lifecycle + entitlements for QSR.
 *
 * Owner: the Company (one subscription shared by every branch).
 * Plans/payments: the central Payment Subscription product, reached through
 * fastify.centralSubscription (plugins/subscription.js).
 *
 * Lifecycle of one Subscription row (one checkout attempt):
 *   PENDING --verifyMandate 0300--> ACTIVE --period ends, mandate gone--> EXPIRED
 *   PENDING --verifyMandate 0399--> FAILED
 *   PENDING --newer checkout started--> SUPERSEDED
 *   ACTIVE  --another plan activated--> SUPERSEDED
 *
 * The browser's checkout result is never trusted: only the central
 * service's server-side verifyMandate answer changes status.
 *
 * Renewal: the central service exposes no per-billing-cycle debit status to
 * consumers (its order endpoint and expiry job are not usable), so QSR keeps
 * its own billing period. When a period ends, the mandate is re-verified;
 * if it is still active the period is extended (the recurring debit itself
 * is the central service's job). If the central service can't be reached,
 * access continues for SUBSCRIPTION_GRACE_DAYS before falling back to trial.
 */
const { RESOURCES, trialLimits, planLimits } = require('../config/subscriptionLimits')

const MANDATE_ACTIVE = '0300'
const MANDATE_FAILED = '0399'
const PENDING_RECHECK_MS = 60 * 1000 // don't hammer verifyMandate on every status poll
const RENEWAL_RECHECK_MS = 10 * 60 * 1000
const PENDING_GIVE_UP_MS = 24 * 60 * 60 * 1000 // abandoned checkout -> FAILED
const graceDays = () => {
  const n = Number(process.env.SUBSCRIPTION_GRACE_DAYS)
  return Number.isFinite(n) && n >= 0 ? n : 3
}

class SubscriptionError extends Error {
  constructor(code, message, httpStatus = 400, details) {
    super(message)
    this.name = 'SubscriptionError'
    this.code = code
    this.httpStatus = httpStatus
    this.details = details
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addInterval(date, interval) {
  const d = new Date(date)
  if (interval === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d
}

/** Only the fields the QSR frontend needs - never internal central ids beyond the plan id. */
function normalizePlan(plan) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description || null,
    price: Number(plan.price) || 0,
    currency: plan.currency || 'INR',
    interval: plan.interval,
    trialDays: plan.trialDays ?? null,
    features: Array.isArray(plan.features)
      ? plan.features.filter((f) => f && typeof f.text === 'string').map((f) => ({ text: f.text, enabled: f.enabled !== false }))
      : [],
    ctaText: plan.ctaText || null,
    isCustom: Boolean(plan.isCustom),
    isPopular: Boolean(plan.isPopular),
    displayOrder: plan.displayOrder ?? 0,
    limits: planLimits(plan.id),
  }
}

function publicSubscription(sub) {
  if (!sub) return null
  return {
    id: sub.id,
    planId: sub.planId,
    planName: sub.planName,
    planInterval: sub.planInterval,
    price: sub.price,
    currency: sub.currency,
    status: sub.status,
    activatedAt: sub.activatedAt,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    statusReason: sub.statusReason,
    createdAt: sub.createdAt,
  }
}

async function logEvent(tx, { companyId, subscriptionId, type, fromStatus, toStatus, actorId, note }) {
  await tx.subscriptionEvent.create({
    data: { companyId, subscriptionId: subscriptionId || null, type, fromStatus: fromStatus || null, toStatus: toStatus || null, actorId: actorId || null, note: note || null },
  })
}

/** Serializes subscription state changes for one company (transaction-scoped). */
async function lockCompany(tx, companyId, scope) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${scope}:${companyId}`}))`
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/** Purchasable + display plans for the QSR product, safe for the frontend. */
async function listPlans(fastify) {
  const plans = await fastify.centralSubscription.getProductPlans()
  return plans
    .filter((p) => p && p.isActive !== false)
    .map(normalizePlan)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.price - b.price)
}

// ---------------------------------------------------------------------------
// Verification (the only path that can activate a subscription)
// ---------------------------------------------------------------------------

/**
 * Applies a central verifyMandate answer to one local subscription inside a
 * locked transaction. Idempotent: re-applying the same answer is a no-op, so
 * duplicate verify calls / retries never double-activate or double-log.
 */
async function applyVerification(prisma, sub, central, actorId) {
  const order = central?.data
  return prisma.$transaction(async (tx) => {
    await lockCompany(tx, sub.companyId, 'subscription')
    const current = await tx.subscription.findUnique({ where: { id: sub.id } })
    if (!current || current.status !== 'PENDING') return current // already resolved

    const now = new Date()

    // Central says the order doesn't exist (a newer checkout for the same
    // plan replaces the central order id) - this attempt can never complete.
    if (central?.statusCode === '01') {
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: { status: 'FAILED', statusReason: 'Checkout not found at the payment service', endedAt: now, lastVerifiedAt: now },
      })
      await logEvent(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: 'FAILED', fromStatus: 'PENDING', toStatus: 'FAILED', actorId, note: 'Central order not found' })
      return updated
    }

    if (central?.statusCode !== '00' || !order) {
      return tx.subscription.update({ where: { id: sub.id }, data: { lastVerifiedAt: now } })
    }

    // The answer must be about THIS checkout and THIS plan.
    if (String(order.order_id) !== String(sub.centralOrderId) || (order.planId && order.planId !== sub.planId)) {
      throw new SubscriptionError('SUBSCRIPTION_VERIFY_MISMATCH', 'Payment verification did not match this subscription', 409)
    }

    const mandateStatus = order.mandateStatus || null

    if (mandateStatus === MANDATE_ACTIVE) {
      // A company holds one active plan - the new one replaces any other.
      const previous = await tx.subscription.findMany({ where: { companyId: sub.companyId, status: 'ACTIVE', NOT: { id: sub.id } } })
      for (const p of previous) {
        await tx.subscription.update({ where: { id: p.id }, data: { status: 'SUPERSEDED', endedAt: now, statusReason: `Replaced by ${sub.planName}` } })
        await logEvent(tx, { companyId: sub.companyId, subscriptionId: p.id, type: 'SUPERSEDED', fromStatus: 'ACTIVE', toStatus: 'SUPERSEDED', actorId, note: `Replaced by plan ${sub.planId}` })
      }
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          mandateStatus,
          mandateId: order.mandateId || null,
          activatedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: addInterval(now, sub.planInterval),
          lastVerifiedAt: now,
          statusReason: null,
        },
      })
      await tx.company.update({ where: { id: sub.companyId }, data: { trial: false } })
      await logEvent(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: 'ACTIVATED', fromStatus: 'PENDING', toStatus: 'ACTIVE', actorId, note: 'Mandate confirmed by the payment service' })
      return updated
    }

    if (mandateStatus === MANDATE_FAILED) {
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: { status: 'FAILED', mandateStatus, lastVerifiedAt: now, endedAt: now, statusReason: order.message ? String(order.message).slice(0, 200) : 'Mandate was not registered' },
      })
      await logEvent(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: 'FAILED', fromStatus: 'PENDING', toStatus: 'FAILED', actorId, note: 'Mandate rejected' })
      return updated
    }

    // Still pending (0398 / initiated) or an unknown code - keep waiting.
    const changed = current.mandateStatus !== mandateStatus
    const updated = await tx.subscription.update({ where: { id: sub.id }, data: { mandateStatus, lastVerifiedAt: now } })
    if (changed) await logEvent(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: 'VERIFY_PENDING', fromStatus: 'PENDING', toStatus: 'PENDING', actorId, note: `Mandate status ${mandateStatus || 'unknown'}` })
    return updated
  })
}

/** Verifies one PENDING checkout with the central service (server to server). */
async function verifySubscription(fastify, { companyId, subscriptionId, actorId }) {
  const sub = await fastify.prisma.subscription.findFirst({ where: { id: subscriptionId, companyId } })
  if (!sub) throw new SubscriptionError('SUBSCRIPTION_NOT_FOUND', 'Subscription not found', 404)
  if (sub.status !== 'PENDING') return sub

  const central = await fastify.centralSubscription.verifyMandate(sub.centralOrderId)
  return applyVerification(fastify.prisma, sub, central, actorId)
}

/** Best-effort recheck of recent pending checkouts; abandons stale ones. */
async function reconcilePending(fastify, companyId) {
  const prisma = fastify.prisma
  const pending = await prisma.subscription.findMany({ where: { companyId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 3 })
  const now = Date.now()
  for (const sub of pending) {
    if (now - sub.createdAt.getTime() > PENDING_GIVE_UP_MS) {
      await prisma.$transaction(async (tx) => {
        const res = await tx.subscription.updateMany({ where: { id: sub.id, status: 'PENDING' }, data: { status: 'FAILED', endedAt: new Date(), statusReason: 'Checkout was not completed' } })
        if (res.count) await logEvent(tx, { companyId, subscriptionId: sub.id, type: 'FAILED', fromStatus: 'PENDING', toStatus: 'FAILED', note: 'Abandoned checkout (24h)' })
      })
      continue
    }
    if (!fastify.centralSubscription.configured) continue
    if (sub.lastVerifiedAt && now - sub.lastVerifiedAt.getTime() < PENDING_RECHECK_MS) continue
    try {
      const central = await fastify.centralSubscription.verifyMandate(sub.centralOrderId)
      await applyVerification(prisma, sub, central, null)
    } catch (err) {
      fastify.log.warn({ err: err.message, subscriptionId: sub.id }, 'Pending subscription recheck failed')
    }
  }
}

// ---------------------------------------------------------------------------
// Entitlement (what the company may do right now)
// ---------------------------------------------------------------------------

/**
 * Resolves the company's effective access. Handles period rollover: an
 * ACTIVE subscription past its period end is renewed (mandate still active),
 * kept in grace (service unreachable), or expired back to trial limits.
 */
async function getEntitlement(fastify, companyId) {
  const prisma = fastify.prisma
  let active = await prisma.subscription.findFirst({ where: { companyId, status: 'ACTIVE' }, orderBy: { activatedAt: 'desc' } })
  const now = new Date()

  if (active && active.currentPeriodEnd && active.currentPeriodEnd <= now) {
    active = await rollOverPeriod(fastify, active)
  }

  if (active && active.status === 'ACTIVE') {
    const inGrace = active.currentPeriodEnd && active.currentPeriodEnd <= now
    return { mode: 'PAID', subscription: active, inGrace: Boolean(inGrace), limits: planLimits(active.planId) }
  }
  return { mode: 'TRIAL', subscription: null, inGrace: false, limits: trialLimits() }
}

async function rollOverPeriod(fastify, sub) {
  const prisma = fastify.prisma
  const now = new Date()
  const graceEnd = new Date(sub.currentPeriodEnd.getTime() + graceDays() * 86400000)
  const recentlyChecked = sub.lastVerifiedAt && now - sub.lastVerifiedAt.getTime() < RENEWAL_RECHECK_MS

  let central = null
  if (fastify.centralSubscription.configured && !recentlyChecked) {
    try {
      central = await fastify.centralSubscription.verifyMandate(sub.centralOrderId)
    } catch (err) {
      fastify.log.warn({ err: err.message, subscriptionId: sub.id }, 'Renewal check could not reach the subscription service')
    }
  }

  return prisma.$transaction(async (tx) => {
    await lockCompany(tx, sub.companyId, 'subscription')
    const current = await tx.subscription.findUnique({ where: { id: sub.id } })
    if (!current || current.status !== 'ACTIVE' || current.currentPeriodEnd > now) return current // someone else rolled it

    const mandateStatus = central?.data?.mandateStatus
    if (central?.statusCode === '00' && mandateStatus === MANDATE_ACTIVE) {
      let start = current.currentPeriodEnd
      let end = addInterval(start, current.planInterval)
      while (end <= now) { start = end; end = addInterval(start, current.planInterval) }
      const updated = await tx.subscription.update({ where: { id: sub.id }, data: { currentPeriodStart: start, currentPeriodEnd: end, lastVerifiedAt: now, mandateStatus } })
      await logEvent(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: 'RENEWED', fromStatus: 'ACTIVE', toStatus: 'ACTIVE', note: `Period extended to ${end.toISOString()}` })
      return updated
    }

    const definitive = central?.statusCode === '01' || (central?.statusCode === '00' && mandateStatus && mandateStatus !== MANDATE_ACTIVE)
    if (!definitive && now < graceEnd) {
      // Couldn't get a clear answer - keep access during the grace window.
      if (central || !recentlyChecked) await tx.subscription.update({ where: { id: sub.id }, data: { lastVerifiedAt: now } })
      return current
    }

    const updated = await tx.subscription.update({
      where: { id: sub.id },
      data: { status: 'EXPIRED', endedAt: now, lastVerifiedAt: now, mandateStatus: mandateStatus || current.mandateStatus, statusReason: definitive ? 'Mandate is no longer active' : 'Renewal could not be confirmed' },
    })
    const stillActive = await tx.subscription.count({ where: { companyId: sub.companyId, status: 'ACTIVE' } })
    if (!stillActive) await tx.company.update({ where: { id: sub.companyId }, data: { trial: true } })
    await logEvent(tx, { companyId: sub.companyId, subscriptionId: sub.id, type: 'EXPIRED', fromStatus: 'ACTIVE', toStatus: 'EXPIRED', note: updated.statusReason })
    return updated
  })
}

// ---------------------------------------------------------------------------
// Usage + limit enforcement
// ---------------------------------------------------------------------------

const COUNTERS = {
  BRANCHES: (db, companyId) => db.branch.count({ where: { companyId } }),
  // The owner (Super Admin) is not a seat - every other login is.
  STAFF_USERS: (db, companyId) => db.user.count({ where: { companyId, role: { not: 'SUPERADMIN' } } }),
  MENU_ITEMS: (db, companyId) => db.menuItem.count({ where: { companyId } }),
  TABLES: (db, companyId) => db.diningTable.count({ where: { branch: { companyId } } }),
  ORDERS: (db, companyId) => db.order.count({ where: { companyId } }),
}

async function getUsage(db, companyId) {
  const keys = Object.keys(RESOURCES)
  const counts = await Promise.all(keys.map((k) => COUNTERS[k](db, companyId)))
  return Object.fromEntries(keys.map((k, i) => [k, counts[i]]))
}

function limitError(resource, limit, used, entitlement) {
  const meta = RESOURCES[resource]
  const onTrial = entitlement.mode === 'TRIAL'
  return new SubscriptionError(
    'SUBSCRIPTION_LIMIT_REACHED',
    onTrial
      ? `Your free trial allows ${limit} ${meta.label}. Subscribe to a plan to add more.`
      : `Your ${entitlement.subscription.planName} plan allows ${limit} ${meta.label}. Upgrade your plan to add more.`,
    403,
    { resource, label: meta.label, limit, used, mode: entitlement.mode, plan: entitlement.subscription?.planName || null }
  )
}

/**
 * Hard limit check for creating `count` more of `resource`. Call it INSIDE
 * the same transaction that creates the record(s): it takes a per-company,
 * per-resource advisory lock first, so concurrent requests are serialized
 * and can never push usage past the limit. Unlimited resources skip the
 * lock entirely.
 */
async function enforceLimit(tx, companyId, resource, entitlement, count = 1) {
  const limit = entitlement.limits[resource]
  if (limit === null || limit === undefined) return
  await lockCompany(tx, companyId, `limit:${resource}`)
  const used = await COUNTERS[resource](tx, companyId)
  if (used + count > limit) throw limitError(resource, limit, used, entitlement)
}

/** Convenience: resolve entitlement, then run `fn(tx)` under the limit lock. */
async function withinLimit(fastify, companyId, resources, fn) {
  const entitlement = await getEntitlement(fastify, companyId)
  const list = Array.isArray(resources) ? resources : [resources]
  return fastify.prisma.$transaction(async (tx) => {
    for (const r of list) await enforceLimit(tx, companyId, r, entitlement)
    return fn(tx)
  })
}

// ---------------------------------------------------------------------------
// Purchase
// ---------------------------------------------------------------------------

async function initiateSubscription(fastify, { companyId, planId, actorId }) {
  const prisma = fastify.prisma
  if (!planId || typeof planId !== 'string') throw new SubscriptionError('SUBSCRIPTION_PLAN_REQUIRED', 'Choose a plan to continue')

  // The plan must belong to the QSR product and be purchasable - the list
  // is fetched from the central service, never taken from the request.
  const plans = await fastify.centralSubscription.getProductPlans()
  const plan = plans.find((p) => p.id === planId)
  if (!plan || plan.isActive === false) throw new SubscriptionError('SUBSCRIPTION_PLAN_NOT_FOUND', 'This plan is not available', 404)
  if (plan.isCustom) throw new SubscriptionError('SUBSCRIPTION_PLAN_CUSTOM', 'This plan is arranged with our team - please contact us', 400)
  if (!(Number(plan.price) > 0)) throw new SubscriptionError('SUBSCRIPTION_PLAN_INVALID', 'This plan cannot be purchased online', 400)

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, primaryEmail: true, primaryPhoneNo: true } })
  if (!company) throw new SubscriptionError('SUBSCRIPTION_COMPANY_NOT_FOUND', 'Business not found', 404)
  if (!company.primaryPhoneNo || !company.primaryEmail) {
    throw new SubscriptionError('SUBSCRIPTION_CONTACT_MISSING', 'Add your business phone and email before subscribing', 400)
  }

  const entitlement = await getEntitlement(fastify, companyId)
  if (entitlement.mode === 'PAID' && entitlement.subscription.planId === planId && !entitlement.inGrace) {
    throw new SubscriptionError('SUBSCRIPTION_ALREADY_ACTIVE', `You are already subscribed to ${plan.name}`, 409)
  }

  const central = await fastify.centralSubscription.initiate({
    planId,
    customerName: company.name,
    emailId: company.primaryEmail,
    mobileNumber: String(company.primaryPhoneNo),
  })
  const checkout = central?.data
  if (central?.statusCode !== '00' || !checkout?.txn_id) {
    fastify.log.error({ centralStatus: central?.statusCode }, 'Central subscription initiate was rejected')
    throw new SubscriptionError('SUBSCRIPTION_INITIATE_FAILED', central?.message ? `Could not start payment: ${central.message}` : 'Could not start payment. Please try again.', 502)
  }
  // The central service prices from its own plan; refuse if it disagrees
  // with the plan we validated (stale plan data / misconfiguration).
  if (Number(checkout.amount) !== Number(plan.price)) {
    fastify.log.error({ planId, expected: plan.price, got: checkout.amount }, 'Central checkout amount does not match plan price')
    throw new SubscriptionError('SUBSCRIPTION_AMOUNT_MISMATCH', 'Plan price changed - please refresh and try again', 409)
  }

  const subscription = await prisma.$transaction(async (tx) => {
    await lockCompany(tx, companyId, 'subscription')
    // Only the newest checkout can complete (central re-uses the order per
    // plan+customer with a new id), so older pending attempts are retired.
    const stale = await tx.subscription.findMany({ where: { companyId, status: 'PENDING' } })
    for (const s of stale) {
      await tx.subscription.update({ where: { id: s.id }, data: { status: 'SUPERSEDED', endedAt: new Date(), statusReason: 'Replaced by a newer checkout' } })
      await logEvent(tx, { companyId, subscriptionId: s.id, type: 'SUPERSEDED', fromStatus: 'PENDING', toStatus: 'SUPERSEDED', actorId, note: 'Newer checkout started' })
    }
    const created = await tx.subscription.create({
      data: {
        companyId,
        productId: fastify.centralSubscription.productId,
        planId,
        planName: plan.name,
        planInterval: plan.interval,
        price: Number(plan.price),
        currency: plan.currency || 'INR',
        planSnapshot: normalizePlan(plan),
        status: 'PENDING',
        centralOrderId: String(checkout.txn_id),
        createdById: actorId || null,
      },
    })
    await logEvent(tx, { companyId, subscriptionId: created.id, type: 'INITIATED', toStatus: 'PENDING', actorId, note: `Checkout started for ${plan.name}` })
    return created
  })

  return { subscription: publicSubscription(subscription), checkout }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function getStatus(fastify, companyId, { reconcile = true } = {}) {
  if (reconcile) await reconcilePending(fastify, companyId)
  const entitlement = await getEntitlement(fastify, companyId)
  const [usage, pending] = await Promise.all([
    getUsage(fastify.prisma, companyId),
    fastify.prisma.subscription.findFirst({ where: { companyId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } }),
  ])

  const resources = Object.entries(RESOURCES).map(([key, meta]) => {
    const limit = entitlement.limits[key] ?? null
    const used = usage[key]
    return { key, label: meta.label, used, limit, remaining: limit === null ? null : Math.max(0, limit - used), reached: limit !== null && used >= limit }
  })

  return {
    configured: fastify.centralSubscription.configured,
    mode: entitlement.mode,
    inGrace: entitlement.inGrace,
    subscription: publicSubscription(entitlement.subscription),
    pending: publicSubscription(pending),
    resources,
  }
}

async function getHistory(prisma, companyId) {
  const rows = await prisma.subscription.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 50 })
  return rows.map(publicSubscription)
}

module.exports = {
  SubscriptionError,
  listPlans,
  initiateSubscription,
  verifySubscription,
  getStatus,
  getHistory,
  getEntitlement,
  getUsage,
  enforceLimit,
  withinLimit,
  normalizePlan,
  addInterval,
}
