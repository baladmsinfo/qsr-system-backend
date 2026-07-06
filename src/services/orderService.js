'use strict'

const ORDER_INCLUDE = {
  table: true,
  customer: true,
  waiter: { select: { id: true, name: true } },
  cashier: { select: { id: true, name: true } },
  orderItems: { include: { menuItem: true } },
  kitchenTickets: { include: { orderItems: true } },
  payments: true,
  auditLogs: { orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true, role: true } } } },
}

/**
 * Order.status is a strict state machine. PREPARING and READY are never
 * settable through this manual transition table - they only ever happen as
 * a side effect of kitchen ticket progress (see kitchenService). This is
 * what enforces "kitchen owns cooking status, front-of-house owns
 * accept/serve/complete" at the data layer, not just in the UI.
 */
const ORDER_TRANSITIONS = {
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['CANCELLED'],
  PREPARING: ['CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
}

// Who is allowed to request which target status via the manual order-status endpoint.
// Kitchen never appears here - their only lever is the kitchen ticket endpoint.
const ORDER_TRANSITION_ROLES = {
  ACCEPTED: ['SUPERADMIN', 'BRANCHADMIN', 'WAITER', 'CASHIER'],
  CANCELLED: ['SUPERADMIN', 'BRANCHADMIN', 'WAITER', 'CASHIER'],
  SERVED: ['SUPERADMIN', 'BRANCHADMIN', 'WAITER', 'CASHIER'],
  COMPLETED: ['SUPERADMIN', 'BRANCHADMIN', 'WAITER', 'CASHIER', 'ACCOUNTANT'],
}

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode })
}

function ticketToken() {
  return `T-${Math.floor(100 + Math.random() * 900)}`
}

async function logAudit(tx, { orderId, entityType, ticketId, fromStatus, toStatus, actor, note }) {
  await tx.orderAuditLog.create({
    data: {
      orderId,
      entityType,
      ticketId: ticketId || null,
      fromStatus: fromStatus || null,
      toStatus,
      userId: actor?.id || null,
      role: actor?.role || null,
      note: note || null,
    },
  })
}

/** Creates one KitchenTicket per distinct station represented in the order's items. */
async function createKitchenTickets(tx, order) {
  const orderItems = await tx.orderItem.findMany({ where: { orderId: order.id }, include: { menuItem: true } })
  const stations = [...new Set(orderItems.map((i) => i.menuItem.kitchenStation))]

  for (const station of stations) {
    const ticket = await tx.kitchenTicket.create({
      data: { orderId: order.id, token: ticketToken(), station },
    })
    await tx.orderItem.updateMany({
      where: { id: { in: orderItems.filter((i) => i.menuItem.kitchenStation === station).map((i) => i.id) } },
      data: { kitchenTicketId: ticket.id },
    })
  }
}

async function priceLines(prisma, companyId, branchId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw httpError('At least one order item is required', 400)
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: items.map((i) => i.menuItemId) }, companyId, branchId },
    include: { taxRate: true },
  })
  const byId = Object.fromEntries(menuItems.map((m) => [m.id, m]))

  let subtotal = 0
  let taxAmount = 0
  const lines = []

  for (const line of items) {
    const menuItem = byId[line.menuItemId]
    if (!menuItem) throw httpError(`Menu item not found: ${line.menuItemId}`, 400)
    if (menuItem.availability !== 'AVAILABLE') {
      throw httpError(`${menuItem.name} is currently ${menuItem.availability.toLowerCase().replace('_', ' ')}`, 400)
    }

    const quantity = Number(line.quantity) || 1
    const lineTotal = Number((menuItem.price * quantity).toFixed(2))
    const lineTax = menuItem.taxRate ? Number(((lineTotal * menuItem.taxRate.rate) / 100).toFixed(2)) : 0

    subtotal += lineTotal
    taxAmount += lineTax

    lines.push({
      menuItem,
      quantity,
      price: menuItem.price,
      total: lineTotal,
      remarks: line.remarks || null,
      taxRateId: menuItem.taxRateId || null,
    })
  }

  return {
    lines,
    subtotal: Number(subtotal.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    totalAmount: Number((subtotal + taxAmount).toFixed(2)),
  }
}

/**
 * Orders are created at PLACED with no kitchen tickets yet - the kitchen
 * only receives the order once front-of-house explicitly accepts it
 * (see updateOrderStatus -> ACCEPTED).
 */
async function createOrder(fastify, { companyId, branchId, tableId, customerId, waiterId, source, orderType, notes, items }) {
  const prisma = fastify.prisma
  if (!branchId) throw httpError('branchId is required', 400)

  const { lines, subtotal, taxAmount, totalAmount } = await priceLines(prisma, companyId, branchId, items)

  const orderId = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        companyId,
        branchId,
        tableId: tableId || null,
        customerId: customerId || null,
        waiterId: waiterId || null,
        source: source || 'QR',
        orderType: orderType || 'DINE_IN',
        notes: notes || null,
        subtotal,
        taxAmount,
        totalAmount,
      },
    })

    for (const line of lines) {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: line.menuItem.id,
          price: line.price,
          quantity: line.quantity,
          total: line.total,
          remarks: line.remarks,
          taxRateId: line.taxRateId,
        },
      })
    }

    await logAudit(tx, { orderId: order.id, entityType: 'ORDER', toStatus: 'PLACED', actor: null, note: `Order placed via ${source || 'QR'}` })

    return order.id
  })

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE })

  fastify.emitToBranch(branchId, 'order:new', order)
  fastify.emitToCompany(companyId, 'order:new', order)

  return order
}

// "toDate" is a calendar day (e.g. from a <input type="date">) - treat it as
// inclusive of the whole day rather than midnight-exclusive.
function endOfDay(dateStr) {
  const d = new Date(dateStr)
  d.setHours(23, 59, 59, 999)
  return d
}

async function listOrders(prisma, { companyId, branchId, status, tableId, fromDate, toDate, take = 50, skip = 0 }) {
  const where = {
    companyId,
    ...(branchId ? { branchId } : {}),
    ...(status ? { status } : {}),
    ...(tableId ? { tableId } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: new Date(fromDate) } : {}),
            ...(toDate ? { lte: endOfDay(toDate) } : {}),
          },
        }
      : {}),
  }

  const [orders, total, revenue] = await Promise.all([
    prisma.order.findMany({ where, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' }, take, skip }),
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { totalAmount: true } }),
  ])

  return { orders, total, totalAmount: revenue._sum.totalAmount || 0 }
}

async function getOrder(prisma, { orderId, companyId }) {
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId }, include: ORDER_INCLUDE })
  if (!order) throw httpError('Order not found', 404)
  return order
}

async function updateOrderStatus(fastify, { orderId, companyId, status, actor }) {
  const prisma = fastify.prisma
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId }, include: { kitchenTickets: true } })
  if (!order) throw httpError('Order not found', 404)

  const allowed = ORDER_TRANSITIONS[order.status] || []
  if (!allowed.includes(status)) {
    throw httpError(`Cannot move order from ${order.status} to ${status}`, 400)
  }

  const allowedRoles = ORDER_TRANSITION_ROLES[status] || []
  if (!actor?.role || !allowedRoles.includes(actor.role)) {
    throw httpError(`Your role is not permitted to mark an order ${status}`, 403)
  }

  // The waiter can only serve once every kitchen station has handed the food off.
  if (status === 'SERVED') {
    const allHandedOff = order.kitchenTickets.length > 0 && order.kitchenTickets.every((t) => t.status === 'COMPLETED')
    if (!allHandedOff) {
      throw httpError('The kitchen has not handed off all items for this order yet', 400)
    }
  }

  await prisma.$transaction(async (tx) => {
    const data = { status }
    if (status === 'COMPLETED') data.cashierId = actor.id

    await tx.order.update({ where: { id: orderId }, data })
    await logAudit(tx, { orderId, entityType: 'ORDER', fromStatus: order.status, toStatus: status, actor })

    if (status === 'ACCEPTED') {
      await createKitchenTickets(tx, order)
    }
  })

  const updated = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE })

  fastify.emitToBranch(updated.branchId, 'order:status', updated)
  fastify.emitToCompany(updated.companyId, 'order:status', updated)
  fastify.emitToOrder(updated.id, 'order:status', updated)

  if (status === 'ACCEPTED' && updated.kitchenTickets.length) {
    // Re-fetch with the shape the Kitchen Display expects (order.table, orderItems.menuItem)
    // rather than the bare ORDER_INCLUDE nesting, so newly-created tickets render correctly
    // the moment they appear on the board via the kitchen:ticket socket event.
    const fullTickets = await prisma.kitchenTicket.findMany({
      where: { orderId: updated.id },
      include: { order: { include: { table: true } }, orderItems: { include: { menuItem: true } } },
    })
    for (const ticket of fullTickets) {
      fastify.emitToBranch(updated.branchId, 'kitchen:ticket', ticket)
    }
  }

  return updated
}

async function moveOrderTable(fastify, { orderId, companyId, tableId }) {
  const prisma = fastify.prisma
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId } })
  if (!order) throw httpError('Order not found', 404)

  const table = await prisma.diningTable.findFirst({ where: { id: tableId, branchId: order.branchId } })
  if (!table) throw httpError('Table not found in this branch', 400)

  await prisma.order.update({ where: { id: orderId }, data: { tableId } })
  const updated = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE })

  fastify.emitToBranch(updated.branchId, 'order:updated', updated)
  return updated
}

module.exports = {
  ORDER_INCLUDE,
  ORDER_TRANSITIONS,
  ORDER_TRANSITION_ROLES,
  logAudit,
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  moveOrderTable,
}
