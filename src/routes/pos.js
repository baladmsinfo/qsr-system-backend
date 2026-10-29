'use strict'
const checkRole = require('../utils/checkRole')
const { createOrderPayment, createPrepayment, refundOrderPayment } = require('../services/paymentServices')
const { resolveBranchId } = require('../utils/scope')
const bucksbox = require('../services/bucksboxService')

const CASHIERS = ['SUPERADMIN', 'BRANCHADMIN', 'CASHIER']
const UPI_ADMINS = ['SUPERADMIN', 'BRANCHADMIN']
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'OTHER']

// Shared body parsing for /pay and /prepay. referenceNo is the cashier-entered
// UTR/RRN (manual UPI). Gateway-confirmed UPI is recorded only by
// /orders/:orderId/upi/verify, so gatewayPaymentId is never taken from a client.
function parsePaymentBody(body = {}) {
  const { amount, method, referenceNo, note } = body
  const parsedAmount = Number(amount)
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return { error: 'A positive amount is required' }
  if (!PAYMENT_METHODS.includes(method)) return { error: `method must be one of ${PAYMENT_METHODS.join(', ')}` }

  const clean = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  return {
    data: {
      amount: parsedAmount,
      method,
      referenceNo: clean(referenceNo, 100),
      note: clean(note, 500),
    },
  }
}

const round2 = (n) => Math.round(n * 100) / 100

// QR trans_id -> the order it was raised for, so a verify call can't settle a
// different order with it. In-memory: after a restart verify falls back to the
// amount check + the unique gatewayPaymentId.
const issuedQrs = new Map()
const QR_TTL_MS = 30 * 60 * 1000

// Unique per attempt - a re-generated QR for the same order must not reuse a
// gateway order id.
function gatewayOrderIdFor(orderId) {
  return `QSR${orderId.replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase()}${Date.now().toString(36).toUpperCase()}`
}

function rememberQr(transId, entry) {
  const now = Date.now()
  for (const [id, e] of issuedQrs) if (now - e.at > QR_TTL_MS) issuedQrs.delete(id)
  issuedQrs.set(transId, { ...entry, at: now })
}

module.exports = async function (fastify, opts) {
  const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode })
  const prisma = () => fastify.prisma

  /* ---------------- BucksBox credentials: branch override -> company default ----------------
   * Each QSR account (company) has its own BucksBox Client ID + Key
   * (PaymentGatewayConfig provider BUCKSBOX), and any branch can override it
   * with its own merchant (BranchUpiConfig) - e.g. one BucksBox VPA per
   * outlet. Everything is looked up from the signed-in user's company, and
   * from the order's branch (or the user's branch), never from client input
   * alone, so one account can never use another's credentials.
   */

  const companyUpiRow = (companyId) =>
    prisma().paymentGatewayConfig.findUnique({ where: { companyId_provider: { companyId, provider: 'BUCKSBOX' } } })

  const branchUpiRow = (companyId, branchId) =>
    branchId ? prisma().branchUpiConfig.findFirst({ where: { companyId, branchId } }) : null

  const companyCreds = (row) => ({ environment: row.mode === 'live' ? 'production' : 'staging', clientId: row.keyId, key: row.keySecret })
  const branchCreds = (row) => ({ environment: row.mode === 'live' ? 'production' : 'staging', clientId: row.clientId, key: row.key })

  // -> { scope: 'branch' | 'company', creds } or null when neither is set up.
  async function resolveUpi(companyId, branchId) {
    const branchRow = await branchUpiRow(companyId, branchId)
    if (branchRow) return { scope: 'branch', creds: branchCreds(branchRow) }
    const companyRow = await companyUpiRow(companyId)
    return companyRow ? { scope: 'company', creds: companyCreds(companyRow) } : null
  }

  async function requireUpiCredentials(companyId, branchId) {
    const resolved = await resolveUpi(companyId, branchId)
    if (!resolved) throw httpError('UPI QR is not set up for this branch. Add a BucksBox Client ID and Key under UPI QR Setup.', 400)
    return resolved.creds
  }

  // A branch the signed-in user may act on, checked against their company.
  // Branch-scoped staff are pinned to their own branch by resolveBranchId.
  async function requestBranch(request, { required = false } = {}) {
    const branchId = resolveBranchId(request)
    if (!branchId) {
      if (required) throw httpError('branchId is required', 400)
      return null
    }
    const branch = await prisma().branch.findFirst({ where: { id: branchId, companyId: request.user.companyId }, select: { id: true, name: true } })
    if (!branch) throw httpError('Branch not found', 404)
    return branch
  }

  // Amount still owed on an order that can take a UPI payment now. settle:
  // 'prepay' (counter, before the kitchen) or 'pay' (Awaiting Bill, SERVED).
  async function upiAmountDue(companyId, orderId, settle) {
    const order = await prisma().order.findFirst({ where: { id: orderId, companyId }, include: { payments: true } })
    if (!order) throw httpError('Order not found', 404)
    if (settle === 'pay' && order.status !== 'SERVED') throw httpError('Order must be SERVED before it can be billed', 400)
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) throw httpError('This order is already closed', 400)
    const due = round2(order.totalAmount - order.payments.reduce((sum, p) => sum + p.amount, 0))
    if (due <= 0) throw httpError('This order has already been paid in full', 400)
    return { order, due }
  }

  const sendError = (request, reply, err, fallback) => {
    if (!err.statusCode || err.statusCode >= 500) request.log.error(err)
    return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.statusCode ? err.message : fallback })
  }

  /* ---------------- BucksBox UPI QR setup (stored server-side) ---------------- */

  // What the POS needs to show the UPI options for a branch (?branchId for
  // SUPERADMIN; staff get their own branch). The key never leaves the server.
  fastify.get('/upi/config', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const branch = await requestBranch(request)
      const resolved = await resolveUpi(request.user.companyId, branch?.id)
      return reply.send({
        statusCode: '00',
        message: resolved ? 'BucksBox UPI config fetched successfully' : 'BucksBox UPI is not configured',
        data: resolved ? { enabled: true, environment: resolved.creds.environment, scope: resolved.scope } : { enabled: false },
      })
    } catch (err) {
      return sendError(request, reply, err, 'Failed to fetch UPI config')
    }
  })

  const setupView = (creds, extra = {}) =>
    creds ? { configured: true, environment: creds.environment, clientId: creds.clientId, keyHint: `••••${creds.key.slice(-4)}`, ...extra } : { configured: false }

  // Saved setup for the admin form: the company default plus the branch's own
  // override (when ?branchId / the admin's branch is known). Client ID and a
  // masked key hint only.
  fastify.get('/upi/setup', { preHandler: checkRole(...UPI_ADMINS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const branch = await requestBranch(request)
      const [companyRow, branchRow] = await Promise.all([companyUpiRow(companyId), branchUpiRow(companyId, branch?.id)])
      return reply.send({
        statusCode: '00',
        message: 'UPI QR setup fetched successfully',
        data: {
          company: setupView(companyRow && companyCreds(companyRow), companyRow && { updatedAt: companyRow.updatedAt }),
          branch: branch ? { id: branch.id, name: branch.name, ...setupView(branchRow && branchCreds(branchRow), branchRow && { updatedAt: branchRow.updatedAt }) } : null,
          effective: branchRow ? 'branch' : companyRow ? 'company' : null,
          // The company default applies to every branch - only SUPERADMIN manages it.
          canEditCompany: request.user.role === 'SUPERADMIN',
        },
      })
    } catch (err) {
      return sendError(request, reply, err, 'Failed to fetch UPI QR setup')
    }
  })

  // Which saved row a setup call targets: body/query scope 'company' (all
  // branches, SUPERADMIN only) or 'branch' (default).
  async function setupTarget(request) {
    const scope = (request.body?.scope ?? request.query?.scope) === 'company' ? 'company' : 'branch'
    if (scope === 'company') {
      if (request.user.role !== 'SUPERADMIN') throw httpError('Only a super admin can change the company-wide UPI setup', 403)
      return { scope, branch: null }
    }
    return { scope, branch: await requestBranch(request, { required: true }) }
  }

  async function savedTargetCreds(companyId, target) {
    if (target.scope === 'company') {
      const row = await companyUpiRow(companyId)
      return row && companyCreds(row)
    }
    const row = await branchUpiRow(companyId, target.branch.id)
    return row && branchCreds(row)
  }

  // Body { scope, branchId?, environment, clientId, key? } -> credentials to
  // use. A blank key reuses that scope's saved key (the form never shows it).
  async function setupCredentials(request, target) {
    const { environment, clientId, key } = request.body || {}
    if (!bucksbox.GATEWAY_URLS[environment]) throw httpError('environment must be staging or production', 400)
    const id = typeof clientId === 'string' ? clientId.trim() : ''
    if (!id || id.length > 200) throw httpError('Client ID is required', 400)
    let secret = typeof key === 'string' ? key.trim() : ''
    if (!secret) {
      const saved = await savedTargetCreds(request.user.companyId, target)
      if (!saved) throw httpError('Key is required', 400)
      secret = saved.key
    }
    if (!bucksbox.isValidKey(secret)) throw httpError('Key must be 64 hex characters or a base64 32-byte key', 400)
    return { environment, clientId: id, key: secret }
  }

  // A BucksBox merchant belongs to one QSR account: refuse a Client ID that
  // another company has already connected.
  async function assertClientIdNotTaken(companyId, clientId) {
    const [gateway, branch] = await Promise.all([
      prisma().paymentGatewayConfig.findFirst({ where: { provider: 'BUCKSBOX', keyId: clientId, NOT: { companyId } }, select: { id: true } }),
      prisma().branchUpiConfig.findFirst({ where: { clientId, NOT: { companyId } }, select: { id: true } }),
    ])
    if (gateway || branch) throw httpError('This BucksBox Client ID is already connected to another account', 409)
  }

  fastify.post('/upi/setup/test', { preHandler: checkRole(...UPI_ADMINS) }, async (request, reply) => {
    try {
      const target = await setupTarget(request)
      const result = await bucksbox.testCredentials(await setupCredentials(request, target))
      return reply.send({ statusCode: result.ok ? '00' : '01', message: result.message, data: result })
    } catch (err) {
      return sendError(request, reply, err, 'Connection test failed')
    }
  })

  // Verifies the credentials with BucksBox first, so a typo can't break
  // QR payments at the counter.
  fastify.put('/upi/setup', { preHandler: checkRole(...UPI_ADMINS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const target = await setupTarget(request)
      const creds = await setupCredentials(request, target)
      await assertClientIdNotTaken(companyId, creds.clientId)
      const test = await bucksbox.testCredentials(creds)
      if (!test.ok) return reply.code(400).send({ statusCode: '01', message: test.message })

      const mode = creds.environment === 'production' ? 'live' : 'test'
      if (target.scope === 'company') {
        const data = { keyId: creds.clientId, keySecret: creds.key, mode }
        await prisma().paymentGatewayConfig.upsert({
          where: { companyId_provider: { companyId, provider: 'BUCKSBOX' } },
          create: { companyId, provider: 'BUCKSBOX', ...data },
          update: data,
        })
      } else {
        const data = { clientId: creds.clientId, key: creds.key, mode }
        await prisma().branchUpiConfig.upsert({
          where: { branchId: target.branch.id },
          create: { companyId, branchId: target.branch.id, ...data },
          update: data,
        })
      }
      return reply.send({
        statusCode: '00',
        message: target.scope === 'company' ? 'Company UPI QR setup saved' : `UPI QR setup saved for ${target.branch.name}`,
        data: { scope: target.scope, branchId: target.branch?.id || null, ...setupView(creds) },
      })
    } catch (err) {
      return sendError(request, reply, err, 'Failed to save UPI QR setup')
    }
  })

  // ?scope=company|branch&branchId=... Removing a branch override falls the
  // branch back to the company default.
  fastify.delete('/upi/setup', { preHandler: checkRole(...UPI_ADMINS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const target = await setupTarget(request)
      if (target.scope === 'company') {
        await prisma().paymentGatewayConfig.deleteMany({ where: { companyId, provider: 'BUCKSBOX' } })
      } else {
        await prisma().branchUpiConfig.deleteMany({ where: { companyId, branchId: target.branch.id } })
      }
      return reply.send({ statusCode: '00', message: 'UPI QR setup removed' })
    } catch (err) {
      return sendError(request, reply, err, 'Failed to remove UPI QR setup')
    }
  })

  /* ---------------- BucksBox UPI QR payments (web POS) ---------------- */

  // Static QR (customer enters the amount) for the user's branch - no single
  // outcome to verify, the cashier records it with manual UPI entry.
  fastify.post('/upi/static-qr', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const branch = await requestBranch(request)
      const creds = await requireUpiCredentials(request.user.companyId, branch?.id)
      const qr = await bucksbox.generateQr(creds, {})
      return reply.send({ statusCode: '00', message: 'Static QR generated', data: { qrImage: qr.qrImage, qrString: qr.qrString, environment: creds.environment } })
    } catch (err) {
      return sendError(request, reply, err, 'Failed to generate the static QR')
    }
  })

  // Dynamic QR for exactly the amount due on the order (computed here, never
  // taken from the client), on the order's branch's BucksBox merchant.
  // Body { settle: 'prepay' | 'pay' }.
  fastify.post('/orders/:orderId/upi/qr', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const settle = request.body?.settle === 'pay' ? 'pay' : 'prepay'
      const { order, due } = await upiAmountDue(companyId, request.params.orderId, settle)
      const creds = await requireUpiCredentials(companyId, order.branchId)

      const gatewayOrderId = gatewayOrderIdFor(order.id)
      const qr = await bucksbox.generateQr(creds, { amount: due, orderId: gatewayOrderId })
      if (!qr.transId) throw httpError('BucksBox did not return a transaction reference for this QR', 502)
      rememberQr(qr.transId, { companyId, orderId: order.id, amount: due })

      return reply.send({
        statusCode: '00',
        message: 'UPI QR generated',
        data: { qrImage: qr.qrImage, qrString: qr.qrString, transId: qr.transId, gatewayOrderId, amount: due, environment: creds.environment },
      })
    } catch (err) {
      return sendError(request, reply, err, 'Failed to generate the UPI QR')
    }
  })

  // Polled by the POS while the QR is on screen. Checks the status with
  // BucksBox and, once it's SUCCESS for the full amount due, records the UPI
  // payment itself - the client never asserts that a payment happened.
  // Body { transId, settle: 'prepay' | 'pay' }. Idempotent per transId.
  fastify.post('/orders/:orderId/upi/verify', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const orderId = request.params.orderId
      const settle = request.body?.settle === 'pay' ? 'pay' : 'prepay'
      const transId = typeof request.body?.transId === 'string' ? request.body.transId.trim() : ''
      if (!transId || transId.length > 100) return reply.code(400).send({ statusCode: '01', message: 'transId is required' })

      const issued = issuedQrs.get(transId)
      if (issued && (issued.companyId !== companyId || issued.orderId !== orderId)) {
        return reply.code(400).send({ statusCode: '01', message: 'This QR was raised for a different order' })
      }

      // Already recorded (e.g. the previous poll's response was lost).
      const existing = await prisma().payment.findUnique({ where: { gatewayPaymentId: transId } })
      if (existing) {
        if (existing.orderId !== orderId || existing.companyId !== companyId) {
          return reply.code(409).send({ statusCode: '99', message: 'This payment reference is already recorded against another order' })
        }
        return reply.send({ statusCode: '00', message: 'UPI payment received', data: { status: 'paid', payment: existing } })
      }

      const { order, due } = await upiAmountDue(companyId, orderId, settle)
      const creds = await requireUpiCredentials(companyId, order.branchId)
      const status = await bucksbox.upiStatus(creds, transId)

      if (status.state === 'pending') {
        return reply.send({ statusCode: '00', message: 'Waiting for payment', data: { status: 'pending' } })
      }
      if (status.state === 'failed') {
        issuedQrs.delete(transId)
        return reply.send({ statusCode: '00', message: status.message || 'UPI payment failed', data: { status: 'failed', message: status.message || 'UPI payment failed' } })
      }
      if (status.amount == null || Math.abs(status.amount - due) > 0.01) {
        const got = status.amount == null ? 'an unknown amount' : `Rs ${status.amount}`
        return reply.send({
          statusCode: '00',
          message: 'Amount mismatch',
          data: { status: 'review', message: `BucksBox reports ${got} received but Rs ${due} is due. Check the BucksBox dashboard and record it with Manual UPI entry.` },
        })
      }

      const result = await recordUpiPayment(request, {
        orderId,
        settle,
        amount: due,
        referenceNo: status.rrn || transId,
        gatewayPaymentId: transId,
        raw: status.raw,
        note: `BucksBox UPI QR${status.payerVpa ? ` from ${status.payerVpa}` : ''}`,
      })
      issuedQrs.delete(transId)
      return reply.send({ statusCode: '00', message: 'UPI payment received', data: { status: 'paid', ...result } })
    } catch (err) {
      return sendError(request, reply, err, 'Failed to check the UPI payment')
    }
  })

  function recordUpiPayment(request, { orderId, settle, amount, referenceNo, gatewayPaymentId, raw, note }) {
    const record = settle === 'pay' ? createOrderPayment : createPrepayment
    return record(fastify, {
      companyId: request.user.companyId,
      orderId,
      amount,
      method: 'UPI',
      referenceNo,
      gatewayPaymentId,
      rawResponse: JSON.stringify(raw).slice(0, 10000),
      note: note.slice(0, 500),
      cashierId: request.user.id,
    })
  }

  /* ---------------- Android app: @bucksbox/capacitor-sdk ---------------- */
  // The native SDK encrypts/signs on the device, so the Android POS needs the
  // clientId + key of the branch it's collecting for. Held in memory on the
  // device only. The web POS never calls these - it uses the server-side QR.

  // For the static QR: the user's branch (?branchId for SUPERADMIN).
  fastify.get('/upi/sdk-credentials', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const branch = await requestBranch(request)
      const creds = await requireUpiCredentials(request.user.companyId, branch?.id)
      return reply.send({ statusCode: '00', message: 'BucksBox SDK credentials fetched', data: creds })
    } catch (err) {
      return sendError(request, reply, err, 'Failed to fetch UPI credentials')
    }
  })

  // Starts an SDK QR: the server fixes the amount due, issues the gateway
  // order id the SDK must use (so sdk-confirm can tie the result to this
  // order) and hands over the order's branch credentials.
  fastify.post('/orders/:orderId/upi/sdk-session', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const settle = request.body?.settle === 'pay' ? 'pay' : 'prepay'
      const { order, due } = await upiAmountDue(companyId, request.params.orderId, settle)
      const credentials = await requireUpiCredentials(companyId, order.branchId)
      const gatewayOrderId = gatewayOrderIdFor(order.id)
      rememberQr(`sdk:${gatewayOrderId}`, { companyId, orderId: order.id, amount: due })
      return reply.send({ statusCode: '00', message: 'UPI session started', data: { gatewayOrderId, amount: due, credentials } })
    } catch (err) {
      return sendError(request, reply, err, 'Failed to start the UPI payment')
    }
  })

  // Records a payment the Android SDK widget reported as successful. The
  // widget's result carries no BucksBox trans_id, so the server can't re-query
  // the status - it accepts only a SUCCESS status for the exact amount due on
  // a session it issued, and the gateway order id is the unique payment key.
  // Body { gatewayOrderId, settle, result }. Idempotent per gatewayOrderId.
  fastify.post('/orders/:orderId/upi/sdk-confirm', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const orderId = request.params.orderId
      const settle = request.body?.settle === 'pay' ? 'pay' : 'prepay'
      const gatewayOrderId = typeof request.body?.gatewayOrderId === 'string' ? request.body.gatewayOrderId.trim() : ''
      const result = request.body?.result || {}
      const review = (message) => reply.send({ statusCode: '00', message, data: { status: 'review', message } })

      const session = issuedQrs.get(`sdk:${gatewayOrderId}`)
      if (!gatewayOrderId || !session || session.companyId !== companyId || session.orderId !== orderId) {
        const existing = gatewayOrderId && await prisma().payment.findUnique({ where: { gatewayPaymentId: gatewayOrderId } })
        if (existing && existing.orderId === orderId && existing.companyId === companyId) {
          return reply.send({ statusCode: '00', message: 'UPI payment received', data: { status: 'paid', payment: existing } })
        }
        return reply.code(400).send({ statusCode: '01', message: 'Unknown or expired UPI session for this order - check the BucksBox dashboard and use Manual UPI entry' })
      }
      if (result.orderId && result.orderId !== gatewayOrderId) return review('The payment result is for a different QR - check the BucksBox dashboard and use Manual UPI entry.')

      const data = result.data || {}
      if (result.statusCode !== '00' || String(data.status || '').toUpperCase() !== 'SUCCESS') {
        return review('BucksBox did not report a SUCCESS status for this QR. Check the BucksBox dashboard and record it with Manual UPI entry.')
      }
      const { due } = await upiAmountDue(companyId, orderId, settle)
      const paid = Number(data.amount ?? result.amount)
      if (!Number.isFinite(paid) || Math.abs(paid - due) > 0.01 || Math.abs(session.amount - due) > 0.01) {
        return review(`BucksBox reports Rs ${Number.isFinite(paid) ? paid : '?'} received but Rs ${due} is due. Check the BucksBox dashboard and record it with Manual UPI entry.`)
      }

      const recorded = await recordUpiPayment(request, {
        orderId,
        settle,
        amount: due,
        referenceNo: data.rrn || data.ref_id || gatewayOrderId,
        gatewayPaymentId: gatewayOrderId,
        raw: result,
        note: `BucksBox UPI QR (Android SDK)${data.payer_vpa ? ` from ${data.payer_vpa}` : ''}`,
      })
      issuedQrs.delete(`sdk:${gatewayOrderId}`)
      return reply.send({ statusCode: '00', message: 'UPI payment received', data: { status: 'paid', ...recorded } })
    } catch (err) {
      return sendError(request, reply, err, 'Failed to record the UPI payment')
    }
  })

  // Orders ready for billing (SERVED but not yet paid)
  fastify.get('/bills/pending', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const branchId = resolveBranchId(request)

      const orders = await fastify.prisma.order.findMany({
        // POS-prepaid orders (paid at counter, at the moment of placing the
        // order) are excluded here - they already have a payment on file
        // and are billed by simply marking them Completed from Live Orders,
        // not through this awaiting-bill/pay flow.
        where: { companyId, ...(branchId ? { branchId } : {}), status: 'SERVED', payments: { none: {} } },
        include: { table: true, orderItems: { include: { menuItem: true } } },
        orderBy: { createdAt: 'asc' },
      })

      return reply.send({ statusCode: '00', message: 'Pending bills fetched successfully', data: orders })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch pending bills', error: err.message })
    }
  })

  // Printable bill for a single order
  fastify.get('/bill/:orderId', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const order = await fastify.prisma.order.findFirst({
        where: { id: request.params.orderId, companyId: request.user.companyId },
        include: {
          table: true,
          customer: true,
          company: { select: { name: true, gstNumber: true, addressLine1: true, city: true, state: true, pincode: true } },
          branch: { select: { name: true, gstNumber: true, phone: true } },
          orderItems: { include: { menuItem: true, taxRate: true } },
          payments: true,
        },
      })

      if (!order) return reply.code(404).send({ statusCode: '01', message: 'Order not found' })

      return reply.send({ statusCode: '00', message: 'Bill fetched successfully', data: order })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch bill', error: err.message })
    }
  })

  // Take payment & close the order
  fastify.post('/orders/:orderId/pay', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const { data, error } = parsePaymentBody(request.body)
      if (error) return reply.code(400).send({ statusCode: '01', message: error })

      const result = await createOrderPayment(fastify, {
        companyId: request.user.companyId,
        orderId: request.params.orderId,
        ...data,
        cashierId: request.user.id,
      })

      return reply.code(201).send({ statusCode: '00', message: 'Payment recorded, order completed', data: result })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })

  // Counter (POS) prepayment - pay now, kitchen prepares/serves after
  fastify.post('/orders/:orderId/prepay', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const { data, error } = parsePaymentBody(request.body)
      if (error) return reply.code(400).send({ statusCode: '01', message: error })

      const result = await createPrepayment(fastify, {
        companyId: request.user.companyId,
        orderId: request.params.orderId,
        ...data,
        cashierId: request.user.id,
      })

      return reply.code(201).send({ statusCode: '00', message: 'Payment recorded', data: result })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })

  // Refund a completed order
  fastify.post('/orders/:orderId/refund', { preHandler: checkRole(...CASHIERS) }, async (request, reply) => {
    try {
      const { amount, method, note } = request.body

      const payment = await refundOrderPayment(fastify, {
        companyId: request.user.companyId,
        orderId: request.params.orderId,
        amount,
        method,
        note,
      })

      return reply.code(201).send({ statusCode: '00', message: 'Refund recorded successfully', data: payment })
    } catch (err) {
      request.log.error(err)
      return reply.code(err.statusCode || 500).send({ statusCode: '99', message: err.message })
    }
  })
}
