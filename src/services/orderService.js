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

// The shape the Kitchen Display expects for a single ticket. `order.orderItems`
// (the WHOLE order's items, not just this ticket's) lets the KDS show a note
// when an order also contains READY_TO_SERVE items that were handled
// automatically and never got a ticket of their own.
const TICKET_INCLUDE = {
  order: { include: { table: true, orderItems: { include: { menuItem: true } } } },
  orderItems: { include: { menuItem: true } },
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

const UNIT_LABELS = { PIECE: 'pcs', GRAM: 'g', KG: 'kg', ML: 'ml', LITRE: 'L' }
function unitLabel(menuItem) {
  if (!menuItem.unitType) return ''
  return menuItem.unitType === 'CUSTOM' ? menuItem.customUnitLabel || 'unit(s)' : UNIT_LABELS[menuItem.unitType]
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

/**
 * Creates one KitchenTicket per distinct station, but only for items that
 * actually need kitchen preparation (menuItem.preparationType ===
 * PREPARED_FRESH) - READY_TO_SERVE items (bottled drinks, packaged snacks,
 * etc.) never get a ticket at all and are marked READY immediately, the
 * same status a prepared item reaches once its ticket is COMPLETED (see
 * kitchenService.TICKET_ITEM_STATUS_MAP), so they never block the waiter
 * from serving the order.
 *
 * Returns the number of stations/tickets actually created, so the caller
 * can tell "everything on this order was ready-to-serve" apart from "some
 * items are still being cooked".
 */
async function createKitchenTickets(tx, order) {
  const orderItems = await tx.orderItem.findMany({ where: { orderId: order.id }, include: { menuItem: true } })

  const readyItems = orderItems.filter((i) => i.menuItem.preparationType === 'READY_TO_SERVE')
  const preparedItems = orderItems.filter((i) => i.menuItem.preparationType !== 'READY_TO_SERVE')

  if (readyItems.length) {
    await tx.orderItem.updateMany({
      where: { id: { in: readyItems.map((i) => i.id) } },
      data: { status: 'READY' },
    })
  }

  const stations = [...new Set(preparedItems.map((i) => i.menuItem.kitchenStation))]

  for (const station of stations) {
    const ticket = await tx.kitchenTicket.create({
      data: { orderId: order.id, token: ticketToken(), station },
    })
    await tx.orderItem.updateMany({
      where: { id: { in: preparedItems.filter((i) => i.menuItem.kitchenStation === station).map((i) => i.id) } },
      data: { kitchenTicketId: ticket.id },
    })
  }

  return stations.length
}

async function priceLines(prisma, companyId, branchId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw httpError('At least one order item is required', 400)
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: items.map((i) => i.menuItemId) }, companyId, branchId },
    include: { taxRate: true, stocks: { where: { branchId } } },
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

    // Quantity-based items (sold by weight/volume/piece-count) draw down a
    // per-branch stock level - the actual atomic decrement + race-safe
    // re-check happens inside createOrder's transaction; this is just a
    // fast, friendly fail before we even open a transaction.
    const quantity = Number(line.quantity) || 1
    if (menuItem.unitType) {
      const available = menuItem.stocks[0]?.quantityAvailable ?? 0
      if (quantity > available) {
        throw httpError(`Only ${available} ${unitLabel(menuItem)} of ${menuItem.name} available`, 400)
      }
    }

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

      // Atomic, race-safe stock deduction for quantity-based items - the
      // `gte` guard is enforced by the database as part of the same UPDATE,
      // so two concurrent orders can never both succeed against the last
      // remaining unit (priceLines' own check above is just a fast, early,
      // friendlier-message version of this same guarantee).
      if (line.menuItem.unitType) {
        const result = await tx.menuItemStock.updateMany({
          where: { menuItemId: line.menuItem.id, branchId, quantityAvailable: { gte: line.quantity } },
          data: { quantityAvailable: { decrement: line.quantity } },
        })
        if (result.count === 0) {
          throw httpError(`Only limited ${line.menuItem.name} left - please adjust the quantity`, 400)
        }
      }
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

  // The waiter can only serve once every kitchen station has either handed
  // the food off or had its items cancelled - a cancelled ticket has no
  // remaining work, so it shouldn't block serving what was actually
  // prepared. An order with NO tickets at all (every item was READY_TO_SERVE)
  // is vacuously "all handed off" - every()/some() on an empty array is
  // exactly the right semantics here, so there's no length>0 requirement.
  if (status === 'SERVED') {
    const allHandedOff = order.kitchenTickets.every((t) => ['COMPLETED', 'CANCELLED'].includes(t.status))
    if (!allHandedOff) {
      throw httpError('The kitchen has not handed off all items for this order yet', 400)
    }
  }

  let cancelledTicketIds = []

  await prisma.$transaction(async (tx) => {
    let finalStatus = status

    if (status === 'ACCEPTED') {
      const stationsWithTickets = await createKitchenTickets(tx, order)
      if (stationsWithTickets === 0) {
        // Nothing on this order needs the kitchen at all (every item is
        // READY_TO_SERVE) - it's instantly ready for the waiter, the same
        // meaning READY has when every kitchen station finishes.
        finalStatus = 'READY'
      }
    }

    const data = { status: finalStatus }
    if (finalStatus === 'COMPLETED') data.cashierId = actor.id

    await tx.order.update({ where: { id: orderId }, data })
    await logAudit(tx, { orderId, entityType: 'ORDER', fromStatus: order.status, toStatus: finalStatus, actor, note: finalStatus !== status ? 'No items require kitchen preparation' : null })

    // Cancelling a whole order must be visible to the kitchen, not silently
    // drop the ticket - every not-yet-completed ticket becomes CANCELLED
    // (kitchen must explicitly dismiss it, see kitchenService.dismissTicket)
    // and every not-yet-served item is marked CANCELLED for the same reason.
    if (status === 'CANCELLED') {
      await tx.orderItem.updateMany({
        where: { orderId, status: { notIn: ['SERVED', 'CANCELLED'] } },
        data: { status: 'CANCELLED' },
      })

      const ticketsToCancel = order.kitchenTickets.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status))
      if (ticketsToCancel.length) {
        await tx.kitchenTicket.updateMany({
          where: { id: { in: ticketsToCancel.map((t) => t.id) } },
          data: { status: 'CANCELLED' },
        })
        for (const t of ticketsToCancel) {
          await logAudit(tx, {
            orderId,
            entityType: 'KITCHEN_TICKET',
            ticketId: t.id,
            fromStatus: t.status,
            toStatus: 'CANCELLED',
            actor,
            note: `${t.station} station - order cancelled`,
          })
        }
        cancelledTicketIds = ticketsToCancel.map((t) => t.id)
      }
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
      include: TICKET_INCLUDE,
    })
    for (const ticket of fullTickets) {
      fastify.emitToBranch(updated.branchId, 'kitchen:ticket', ticket)
    }
  }

  if (cancelledTicketIds.length) {
    const fullCancelledTickets = await prisma.kitchenTicket.findMany({
      where: { id: { in: cancelledTicketIds } },
      include: TICKET_INCLUDE,
    })
    for (const ticket of fullCancelledTickets) {
      fastify.emitToBranch(updated.branchId, 'kitchen:ticket', ticket)
    }
  }

  return updated
}

/**
 * Cancels one or more specific items on an order (partial cancellation),
 * distinct from updateOrderStatus's whole-order CANCELLED transition:
 * - The order stays active for its remaining, non-cancelled items.
 * - A kitchen ticket becomes fully CANCELLED (and thus dismissible from the
 *   Kitchen Display) only once every item on it is resolved (served or
 *   cancelled) with at least one actual cancellation - a ticket with a mix
 *   of active and cancelled items is left exactly as-is otherwise, so the
 *   kitchen keeps working the remaining items.
 * - If cancelling these items happens to leave every item on the whole
 *   order cancelled, the order itself is auto-cancelled too - there's
 *   nothing left to prepare/serve/bill.
 * - Totals are recalculated from the remaining non-cancelled items, since a
 *   customer must never be billed for a cancelled item.
 */
async function cancelOrderItems(fastify, { orderId, companyId, itemIds, actor }) {
  const prisma = fastify.prisma
  const order = await prisma.order.findFirst({
    where: { id: orderId, companyId },
    include: { orderItems: true, kitchenTickets: true },
  })
  if (!order) throw httpError('Order not found', 404)

  if (['CANCELLED', 'COMPLETED'].includes(order.status)) {
    throw httpError(`Cannot cancel items on a ${order.status.toLowerCase()} order`, 400)
  }

  const allowedRoles = ORDER_TRANSITION_ROLES.CANCELLED || []
  if (!actor?.role || !allowedRoles.includes(actor.role)) {
    throw httpError('Your role is not permitted to cancel order items', 403)
  }

  const targetItems = order.orderItems.filter(
    (i) => Array.isArray(itemIds) && itemIds.includes(i.id) && !['SERVED', 'CANCELLED'].includes(i.status)
  )
  if (!targetItems.length) {
    throw httpError('No cancellable items found for this order', 400)
  }

  const touchedTicketIds = new Set(targetItems.map((i) => i.kitchenTicketId).filter(Boolean))
  const cancelledTicketIdsThisCall = new Set()

  await prisma.$transaction(async (tx) => {
    await tx.orderItem.updateMany({
      where: { id: { in: targetItems.map((i) => i.id) } },
      data: { status: 'CANCELLED' },
    })

    await logAudit(tx, {
      orderId,
      entityType: 'ORDER',
      toStatus: 'ITEMS_CANCELLED',
      actor,
      note: `${targetItems.length} item(s) cancelled`,
    })

    const allItems = await tx.orderItem.findMany({ where: { orderId }, include: { taxRate: true } })
    const activeItems = allItems.filter((i) => i.status !== 'CANCELLED')
    const subtotal = Number(activeItems.reduce((s, i) => s + i.total, 0).toFixed(2))
    const taxAmount = Number(
      activeItems.reduce((s, i) => s + (i.taxRate ? (i.total * i.taxRate.rate) / 100 : 0), 0).toFixed(2)
    )
    await tx.order.update({
      where: { id: orderId },
      data: { subtotal, taxAmount, totalAmount: Number((subtotal + taxAmount).toFixed(2)) },
    })

    for (const ticketId of touchedTicketIds) {
      const ticket = order.kitchenTickets.find((t) => t.id === ticketId)
      if (!ticket || ['COMPLETED', 'CANCELLED'].includes(ticket.status)) continue

      const ticketItems = allItems.filter((i) => i.kitchenTicketId === ticketId)
      const allResolved = ticketItems.every((i) => ['CANCELLED', 'SERVED'].includes(i.status))
      if (allResolved) {
        await tx.kitchenTicket.update({ where: { id: ticketId }, data: { status: 'CANCELLED' } })
        await logAudit(tx, {
          orderId,
          entityType: 'KITCHEN_TICKET',
          ticketId,
          fromStatus: ticket.status,
          toStatus: 'CANCELLED',
          actor,
          note: `${ticket.station} station - all items cancelled`,
        })
        cancelledTicketIdsThisCall.add(ticketId)
      }
    }

    // Nothing left to prepare/serve/bill - auto-cancel the order too.
    if (allItems.every((i) => i.status === 'CANCELLED')) {
      await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } })
      await logAudit(tx, {
        orderId,
        entityType: 'ORDER',
        fromStatus: order.status,
        toStatus: 'CANCELLED',
        actor,
        note: 'Auto-cancelled - every item on this order was cancelled',
      })

      for (const t of order.kitchenTickets) {
        if (['COMPLETED', 'CANCELLED'].includes(t.status) || cancelledTicketIdsThisCall.has(t.id)) continue
        await tx.kitchenTicket.update({ where: { id: t.id }, data: { status: 'CANCELLED' } })
        await logAudit(tx, {
          orderId,
          entityType: 'KITCHEN_TICKET',
          ticketId: t.id,
          fromStatus: t.status,
          toStatus: 'CANCELLED',
          actor,
          note: `${t.station} station - order auto-cancelled`,
        })
        touchedTicketIds.add(t.id)
        cancelledTicketIdsThisCall.add(t.id)
      }
    }
  })

  const updated = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE })

  fastify.emitToBranch(updated.branchId, 'order:status', updated)
  fastify.emitToCompany(updated.companyId, 'order:status', updated)
  fastify.emitToOrder(updated.id, 'order:status', updated)

  if (touchedTicketIds.size) {
    const fullTickets = await prisma.kitchenTicket.findMany({
      where: { id: { in: [...touchedTicketIds] } },
      include: TICKET_INCLUDE,
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
  TICKET_INCLUDE,
  ORDER_TRANSITIONS,
  ORDER_TRANSITION_ROLES,
  logAudit,
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  cancelOrderItems,
  moveOrderTable,
}
