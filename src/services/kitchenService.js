'use strict'

const { logAudit, ORDER_INCLUDE, TICKET_INCLUDE } = require('./orderService')

const TICKET_ITEM_STATUS_MAP = {
  PENDING: 'PENDING',
  PREPARING: 'PREPARING',
  READY: 'READY',
  COMPLETED: 'READY',
}

/** Strict kitchen ticket state machine - kitchen only ever moves forward, one step at a time. */
const TICKET_TRANSITIONS = {
  PENDING: ['PREPARING'],
  PREPARING: ['READY'],
  READY: ['COMPLETED'],
  COMPLETED: [],
}

const TICKET_TRANSITION_ROLES = {
  PREPARING: ['SUPERADMIN', 'BRANCHADMIN', 'KITCHEN'],
  READY: ['SUPERADMIN', 'BRANCHADMIN', 'KITCHEN'],
  COMPLETED: ['SUPERADMIN', 'BRANCHADMIN', 'KITCHEN'],
}

const TICKET_ORDINAL = { PENDING: 0, PREPARING: 1, READY: 2, COMPLETED: 3 }

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode })
}

async function listTickets(prisma, { branchId, station, status }) {
  return prisma.kitchenTicket.findMany({
    where: {
      order: { branchId },
      dismissedAt: null,
      ...(station ? { station } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      order: { include: { table: true } },
      orderItems: { include: { menuItem: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

async function updateTicketStatus(fastify, { ticketId, branchId, status, actor }) {
  const prisma = fastify.prisma
  const ticket = await prisma.kitchenTicket.findFirst({
    where: { id: ticketId, order: { branchId } },
    include: { order: { include: { kitchenTickets: true } } },
  })
  if (!ticket) throw httpError('Kitchen ticket not found', 404)

  if (['CANCELLED', 'COMPLETED'].includes(ticket.order.status)) {
    throw httpError(`Cannot update a kitchen ticket for a ${ticket.order.status.toLowerCase()} order`, 400)
  }

  const allowed = TICKET_TRANSITIONS[ticket.status] || []
  if (!allowed.includes(status)) {
    throw httpError(`Cannot move a ticket from ${ticket.status} to ${status}`, 400)
  }

  const allowedRoles = TICKET_TRANSITION_ROLES[status] || []
  if (!actor?.role || !allowedRoles.includes(actor.role)) {
    throw httpError(`Your role is not permitted to mark a kitchen ticket ${status}`, 403)
  }

  let cascadedOrderStatus = null

  await prisma.$transaction(async (tx) => {
    await tx.kitchenTicket.update({ where: { id: ticketId }, data: { status } })
    await tx.orderItem.updateMany({
      where: { kitchenTicketId: ticketId },
      data: { status: TICKET_ITEM_STATUS_MAP[status] || 'PENDING' },
    })
    await logAudit(tx, {
      orderId: ticket.orderId,
      entityType: 'KITCHEN_TICKET',
      ticketId,
      fromStatus: ticket.status,
      toStatus: status,
      actor,
      note: `${ticket.station} station`,
    })

    // Cascade to Order.status: the order only ever moves forward, never backward,
    // and only while it's still in a kitchen-relevant state (ACCEPTED/PREPARING).
    // "Any station started" (max ordinal) promotes to PREPARING; "every station
    // ready" (min ordinal) promotes to READY. Cancelled tickets represent no
    // remaining work, so they're excluded from this - a mix of one cancelled
    // station and one still-active station should cascade purely on the
    // active one, not get stuck/NaN on the cancelled sibling.
    const siblingTickets = ticket.order.kitchenTickets
      .map((t) => (t.id === ticketId ? { ...t, status } : t))
      .filter((t) => t.status !== 'CANCELLED')
    const maxOrdinal = siblingTickets.length ? Math.max(...siblingTickets.map((t) => TICKET_ORDINAL[t.status])) : -1
    const minOrdinal = siblingTickets.length ? Math.min(...siblingTickets.map((t) => TICKET_ORDINAL[t.status])) : -1

    if (ticket.order.status === 'ACCEPTED' && maxOrdinal >= TICKET_ORDINAL.PREPARING) {
      await tx.order.update({ where: { id: ticket.orderId }, data: { status: 'PREPARING' } })
      await logAudit(tx, { orderId: ticket.orderId, entityType: 'ORDER', fromStatus: 'ACCEPTED', toStatus: 'PREPARING', actor: null, note: 'Kitchen started preparing' })
      cascadedOrderStatus = 'PREPARING'
    }

    if (['ACCEPTED', 'PREPARING'].includes(ticket.order.status) && minOrdinal >= TICKET_ORDINAL.READY) {
      await tx.order.update({ where: { id: ticket.orderId }, data: { status: 'READY' } })
      await logAudit(tx, { orderId: ticket.orderId, entityType: 'ORDER', fromStatus: ticket.order.status, toStatus: 'READY', actor: null, note: 'All kitchen stations ready' })
      cascadedOrderStatus = 'READY'
    }
  })

  const updatedTicket = await prisma.kitchenTicket.findUnique({
    where: { id: ticketId },
    include: TICKET_INCLUDE,
  })

  fastify.emitToBranch(branchId, 'kitchen:ticket', updatedTicket)
  fastify.emitToOrder(ticket.orderId, 'kitchen:ticket', updatedTicket)

  if (cascadedOrderStatus) {
    const updatedOrder = await prisma.order.findUnique({ where: { id: ticket.orderId }, include: ORDER_INCLUDE })
    fastify.emitToBranch(updatedOrder.branchId, 'order:status', updatedOrder)
    fastify.emitToCompany(updatedOrder.companyId, 'order:status', updatedOrder)
    fastify.emitToOrder(updatedOrder.id, 'order:status', updatedOrder)
  }

  return updatedTicket
}

const DISMISS_ROLES = ['SUPERADMIN', 'BRANCHADMIN', 'KITCHEN']

/**
 * Kitchen explicitly acknowledging a fully-cancelled ticket (either the
 * whole order was cancelled, or every item on this ticket was individually
 * cancelled - see orderService.cancelOrderItems) - the ONLY way a cancelled
 * ticket can be removed from the active Kitchen Display. Deliberately a
 * separate action from updateTicketStatus's forward-only transition table,
 * since CANCELLED isn't part of that state machine.
 */
async function dismissTicket(fastify, { ticketId, branchId, actor }) {
  const prisma = fastify.prisma
  const ticket = await prisma.kitchenTicket.findFirst({ where: { id: ticketId, order: { branchId } } })
  if (!ticket) throw httpError('Kitchen ticket not found', 404)

  if (ticket.status !== 'CANCELLED') {
    throw httpError('Only a fully cancelled ticket can be dismissed', 400)
  }
  if (ticket.dismissedAt) {
    throw httpError('This ticket has already been dismissed', 400)
  }

  if (!actor?.role || !DISMISS_ROLES.includes(actor.role)) {
    throw httpError('Your role is not permitted to dismiss a kitchen ticket', 403)
  }

  await prisma.$transaction(async (tx) => {
    await tx.kitchenTicket.update({ where: { id: ticketId }, data: { dismissedAt: new Date() } })
    await logAudit(tx, {
      orderId: ticket.orderId,
      entityType: 'KITCHEN_TICKET',
      ticketId,
      fromStatus: 'CANCELLED',
      toStatus: 'DISMISSED',
      actor,
      note: `${ticket.station} station acknowledged cancellation`,
    })
  })

  const updatedTicket = await prisma.kitchenTicket.findUnique({
    where: { id: ticketId },
    include: TICKET_INCLUDE,
  })

  fastify.emitToBranch(branchId, 'kitchen:ticket', updatedTicket)
  fastify.emitToOrder(ticket.orderId, 'kitchen:ticket', updatedTicket)

  return updatedTicket
}

module.exports = { listTickets, updateTicketStatus, dismissTicket, TICKET_TRANSITIONS, TICKET_TRANSITION_ROLES }
