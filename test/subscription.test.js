'use strict'
// Unit tests for services/subscription.service.js - run with `npm test`.
// Uses an in-memory stand-in for the Prisma calls the service makes and a
// fake central subscription client, so no database or network is needed.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const svc = require('../src/services/subscription.service')

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

function matches(row, where = {}) {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'NOT') return !matches(row, v)
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('not' in v) return row[k] !== v.not
      if ('in' in v) return v.in.includes(row[k])
      return matches(row[k] || {}, v)
    }
    return row[k] === v
  })
}

function table(rows) {
  const sortRows = (list, orderBy) => {
    if (!orderBy) return list
    const [[field, dir]] = Object.entries(orderBy)
    return [...list].sort((a, b) => (dir === 'desc' ? b[field] - a[field] : a[field] - b[field]))
  }
  return {
    rows,
    findUnique: async ({ where }) => rows.find((r) => matches(r, where)) || null,
    findFirst: async ({ where, orderBy } = {}) => sortRows(rows.filter((r) => matches(r, where)), orderBy)[0] || null,
    findMany: async ({ where, orderBy, take } = {}) => sortRows(rows.filter((r) => matches(r, where)), orderBy).slice(0, take ?? Infinity),
    count: async ({ where } = {}) => rows.filter((r) => matches(r, where)).length,
    create: async ({ data }) => {
      const row = { id: crypto.randomUUID(), createdAt: new Date(), ...data }
      rows.push(row)
      return row
    },
    update: async ({ where, data }) => {
      const row = rows.find((r) => matches(r, where))
      if (!row) throw new Error('not found')
      Object.assign(row, data)
      return row
    },
    updateMany: async ({ where, data }) => {
      const hit = rows.filter((r) => matches(r, where))
      hit.forEach((r) => Object.assign(r, data))
      return { count: hit.length }
    },
  }
}

function fakeDb({ orders = 0 } = {}) {
  const db = {
    locks: [],
    company: table([{ id: 'c1', name: 'Cafe One', primaryEmail: 'owner@example.com', primaryPhoneNo: '9999999999', trial: true }]),
    subscription: table([]),
    subscriptionEvent: table([]),
    branch: table([{ id: 'b1', companyId: 'c1' }]),
    user: table([{ id: 'u0', companyId: 'c1', role: 'SUPERADMIN' }]),
    menuItem: table([]),
    diningTable: table([]),
    order: table(Array.from({ length: orders }, (_, i) => ({ id: `o${i}`, companyId: 'c1' }))),
    $executeRaw: async (strings, ...values) => { db.locks.push(values.join('')) },
    $transaction: async (fn) => fn(db),
  }
  return db
}

const PLANS = [
  { id: 'plan-basic', name: 'Basic', price: 499, currency: 'INR', interval: 'monthly', isActive: true, features: [{ text: 'POS', enabled: true }, { bad: 1 }], displayOrder: 1 },
  { id: 'plan-pro', name: 'Pro', price: 4999, interval: 'yearly', isActive: true, isPopular: true, displayOrder: 2 },
  { id: 'plan-off', name: 'Retired', price: 99, interval: 'monthly', isActive: false },
  { id: 'plan-custom', name: 'Enterprise', price: 0, interval: 'yearly', isActive: true, isCustom: true },
]

function fakeFastify(db, central = {}) {
  let orderSeq = 1000
  const calls = { initiate: [], verify: [] }
  return {
    calls,
    prisma: db,
    log: { error() {}, warn() {}, info() {} },
    centralSubscription: {
      configured: true,
      productId: 'qsr-product',
      getProductPlans: async () => PLANS,
      initiate: central.initiate || (async (body) => {
        calls.initiate.push(body)
        const plan = PLANS.find((p) => p.id === body.planId)
        return { statusCode: '00', data: { txn_id: ++orderSeq, amount: plan.price, token: 'signed' } }
      }),
      verifyMandate: async (orderId) => {
        calls.verify.push(orderId)
        return central.verify ? central.verify(orderId) : { statusCode: '00', data: { order_id: orderId, mandateStatus: '0398' } }
      },
    },
  }
}

const sub = (db, data) => db.subscription.create({
  data: { companyId: 'c1', productId: 'qsr-product', planId: 'plan-basic', planName: 'Basic', planInterval: 'monthly', price: 499, currency: 'INR', status: 'PENDING', ...data },
})

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

test('listPlans hides inactive plans, sanitizes features and sorts', async () => {
  const fastify = fakeFastify(fakeDb())
  const plans = await svc.listPlans(fastify)
  assert.deepEqual(plans.map((p) => p.id), ['plan-custom', 'plan-basic', 'plan-pro'])
  const basic = plans.find((p) => p.id === 'plan-basic')
  assert.deepEqual(basic.features, [{ text: 'POS', enabled: true }])
  assert.equal(basic.limits.ORDERS, null, 'paid plans are unlimited by default')
})

// ---------------------------------------------------------------------------
// Initiate
// ---------------------------------------------------------------------------

test('initiate rejects plans outside the product, inactive and custom plans', async () => {
  const fastify = fakeFastify(fakeDb())
  for (const planId of ['someone-elses-plan', 'plan-off']) {
    await assert.rejects(svc.initiateSubscription(fastify, { companyId: 'c1', planId }), { code: 'SUBSCRIPTION_PLAN_NOT_FOUND' })
  }
  await assert.rejects(svc.initiateSubscription(fastify, { companyId: 'c1', planId: 'plan-custom' }), { code: 'SUBSCRIPTION_PLAN_CUSTOM' })
  assert.equal(fastify.calls.initiate.length, 0, 'central initiate never called for invalid plans')
})

test('initiate sends company contact details (not a client price) and records PENDING', async () => {
  const db = fakeDb()
  const fastify = fakeFastify(db)
  const { subscription, checkout } = await svc.initiateSubscription(fastify, { companyId: 'c1', planId: 'plan-basic', actorId: 'u0' })
  assert.deepEqual(fastify.calls.initiate[0], { planId: 'plan-basic', customerName: 'Cafe One', emailId: 'owner@example.com', mobileNumber: '9999999999' })
  assert.equal(subscription.status, 'PENDING')
  assert.equal(checkout.token, 'signed')
  assert.equal(db.subscription.rows[0].centralOrderId, String(checkout.txn_id))
})

test('a newer checkout supersedes older pending ones', async () => {
  const db = fakeDb()
  const fastify = fakeFastify(db)
  await svc.initiateSubscription(fastify, { companyId: 'c1', planId: 'plan-basic' })
  await svc.initiateSubscription(fastify, { companyId: 'c1', planId: 'plan-pro' })
  assert.deepEqual(db.subscription.rows.map((r) => r.status), ['SUPERSEDED', 'PENDING'])
})

test('initiate refuses when the central amount disagrees with the plan price', async () => {
  const fastify = fakeFastify(fakeDb(), { initiate: async () => ({ statusCode: '00', data: { txn_id: 1, amount: 1 } }) })
  await assert.rejects(svc.initiateSubscription(fastify, { companyId: 'c1', planId: 'plan-basic' }), { code: 'SUBSCRIPTION_AMOUNT_MISMATCH' })
})

// ---------------------------------------------------------------------------
// Verification - the only path to ACTIVE
// ---------------------------------------------------------------------------

test('verify activates only on a server-confirmed 0300 and is idempotent', async () => {
  const db = fakeDb()
  const fastify = fakeFastify(db, { verify: (id) => ({ statusCode: '00', data: { order_id: id, planId: 'plan-basic', mandateStatus: '0300', mandateId: 'M1' } }) })
  const s = await sub(db, { centralOrderId: '501' })

  const first = await svc.verifySubscription(fastify, { companyId: 'c1', subscriptionId: s.id })
  assert.equal(first.status, 'ACTIVE')
  assert.ok(first.currentPeriodEnd > new Date())
  assert.equal(db.company.rows[0].trial, false)

  const eventsAfterFirst = db.subscriptionEvent.rows.length
  const second = await svc.verifySubscription(fastify, { companyId: 'c1', subscriptionId: s.id })
  assert.equal(second.status, 'ACTIVE')
  assert.equal(db.subscriptionEvent.rows.length, eventsAfterFirst, 'duplicate verify writes nothing')
  assert.equal(fastify.calls.verify.length, 1, 'already-resolved subscriptions are not re-verified')
})

test('verify rejects an answer about a different order or plan', async () => {
  const db = fakeDb()
  const fastify = fakeFastify(db, { verify: () => ({ statusCode: '00', data: { order_id: '999', planId: 'plan-basic', mandateStatus: '0300' } }) })
  const s = await sub(db, { centralOrderId: '501' })
  await assert.rejects(svc.verifySubscription(fastify, { companyId: 'c1', subscriptionId: s.id }), { code: 'SUBSCRIPTION_VERIFY_MISMATCH' })
  assert.equal(db.subscription.rows[0].status, 'PENDING')
})

test('verify cannot touch another company\'s subscription', async () => {
  const db = fakeDb()
  const fastify = fakeFastify(db)
  const s = await sub(db, { centralOrderId: '501' })
  await assert.rejects(svc.verifySubscription(fastify, { companyId: 'other-company', subscriptionId: s.id }), { code: 'SUBSCRIPTION_NOT_FOUND' })
})

test('0399 fails the checkout, 0398 keeps it pending', async () => {
  const db = fakeDb()
  const codes = { 501: '0399', 502: '0398' }
  const fastify = fakeFastify(db, { verify: (id) => ({ statusCode: '00', data: { order_id: id, mandateStatus: codes[id] } }) })
  const failed = await sub(db, { centralOrderId: '501' })
  const pending = await sub(db, { centralOrderId: '502' })
  assert.equal((await svc.verifySubscription(fastify, { companyId: 'c1', subscriptionId: failed.id })).status, 'FAILED')
  assert.equal((await svc.verifySubscription(fastify, { companyId: 'c1', subscriptionId: pending.id })).status, 'PENDING')
  assert.equal(db.company.rows[0].trial, true)
})

test('activating a new plan supersedes the previous active plan', async () => {
  const db = fakeDb()
  const fastify = fakeFastify(db, { verify: (id) => ({ statusCode: '00', data: { order_id: id, mandateStatus: '0300' } }) })
  const old = await sub(db, { status: 'ACTIVE', centralOrderId: '400', activatedAt: new Date(), currentPeriodEnd: new Date(Date.now() + 86400000) })
  const next = await sub(db, { planId: 'plan-pro', planName: 'Pro', planInterval: 'yearly', centralOrderId: '401' })
  await svc.verifySubscription(fastify, { companyId: 'c1', subscriptionId: next.id })
  assert.equal(old.status, 'SUPERSEDED')
  assert.equal(next.status, 'ACTIVE')
})

// ---------------------------------------------------------------------------
// Renewal / grace / expiry
// ---------------------------------------------------------------------------

const lapsed = (db) => sub(db, {
  status: 'ACTIVE', centralOrderId: '700', activatedAt: new Date(Date.now() - 40 * 86400000),
  currentPeriodStart: new Date(Date.now() - 40 * 86400000), currentPeriodEnd: new Date(Date.now() - 86400000),
})

test('an ended period renews when the mandate is still active', async () => {
  const db = fakeDb()
  const fastify = fakeFastify(db, { verify: (id) => ({ statusCode: '00', data: { order_id: id, mandateStatus: '0300' } }) })
  await lapsed(db)
  const ent = await svc.getEntitlement(fastify, 'c1')
  assert.equal(ent.mode, 'PAID')
  assert.ok(ent.subscription.currentPeriodEnd > new Date())
})

test('an ended period expires to trial when the mandate is gone', async () => {
  const db = fakeDb()
  db.company.rows[0].trial = false
  const fastify = fakeFastify(db, { verify: (id) => ({ statusCode: '00', data: { order_id: id, mandateStatus: '0399' } }) })
  await lapsed(db)
  const ent = await svc.getEntitlement(fastify, 'c1')
  assert.equal(ent.mode, 'TRIAL')
  assert.equal(db.subscription.rows[0].status, 'EXPIRED')
  assert.equal(db.company.rows[0].trial, true)
})

test('service outage inside the grace window keeps access', async () => {
  const db = fakeDb()
  const fastify = fakeFastify(db)
  fastify.centralSubscription.verifyMandate = async () => { throw new Error('ECONNREFUSED') }
  await lapsed(db) // ended 1 day ago, default grace is 3 days
  const ent = await svc.getEntitlement(fastify, 'c1')
  assert.equal(ent.mode, 'PAID')
  assert.equal(ent.inGrace, true)
})

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

test('trial order limit blocks creation at the limit, under a lock', async () => {
  const db = fakeDb({ orders: 50 }) // default trial limit is 50
  const fastify = fakeFastify(db)
  const ent = await svc.getEntitlement(fastify, 'c1')
  await assert.rejects(svc.enforceLimit(db, 'c1', 'ORDERS', ent), (err) => {
    assert.equal(err.code, 'SUBSCRIPTION_LIMIT_REACHED')
    assert.deepEqual({ limit: err.details.limit, used: err.details.used, mode: err.details.mode }, { limit: 50, used: 50, mode: 'TRIAL' })
    return true
  })
  assert.ok(db.locks.some((l) => l.includes('limit:ORDERS:c1')))
})

test('under the limit passes; paid plans skip the check entirely', async () => {
  const db = fakeDb({ orders: 49 })
  const fastify = fakeFastify(db)
  await svc.enforceLimit(db, 'c1', 'ORDERS', await svc.getEntitlement(fastify, 'c1'))

  const paid = fakeDb({ orders: 5000 })
  await sub(paid, { status: 'ACTIVE', centralOrderId: '1', activatedAt: new Date(), currentPeriodEnd: new Date(Date.now() + 86400000) })
  const ent = await svc.getEntitlement(fakeFastify(paid), 'c1')
  assert.equal(ent.mode, 'PAID')
  await svc.enforceLimit(paid, 'c1', 'ORDERS', ent)
  assert.equal(paid.locks.length, 0, 'unlimited resources take no lock')
})

test('the owner does not count as a staff seat', async () => {
  const db = fakeDb()
  const usage = await svc.getUsage(db, 'c1')
  assert.equal(usage.STAFF_USERS, 0)
  assert.equal(usage.BRANCHES, 1)
})

test('trial limits can be overridden by env', async () => {
  process.env.SUBSCRIPTION_TRIAL_LIMITS = '{"ORDERS":2,"TABLES":null}'
  try {
    const ent = await svc.getEntitlement(fakeFastify(fakeDb()), 'c1')
    assert.equal(ent.limits.ORDERS, 2)
    assert.equal(ent.limits.TABLES, null)
    assert.equal(ent.limits.BRANCHES, 1)
  } finally {
    delete process.env.SUBSCRIPTION_TRIAL_LIMITS
  }
})

test('addInterval handles monthly and yearly periods', () => {
  const start = new Date('2026-01-15T00:00:00Z')
  assert.equal(svc.addInterval(start, 'monthly').toISOString(), '2026-02-15T00:00:00.000Z')
  assert.equal(svc.addInterval(start, 'yearly').toISOString(), '2027-01-15T00:00:00.000Z')
})
