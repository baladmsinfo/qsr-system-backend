'use strict'

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode })
}

async function getAccountId(tx, companyId, name) {
  const acc = await tx.account.findFirst({ where: { companyId, name } })
  if (!acc) throw new Error(`Account not found: ${name}`)
  return acc.id
}

/**
 * Cashier bills an order: records the payment and posts the corresponding
 * journal entries (Cash/Bank debit, Sales Revenue + Tax Payable credit).
 */
async function createOrderPayment(fastify, { companyId, orderId, amount, method, referenceNo, note, cashierId }) {
  const prisma = fastify.prisma

  const order = await prisma.order.findFirst({ where: { id: orderId, companyId } })
  if (!order) throw httpError('Order not found', 404)
  if (order.status !== 'SERVED') {
    throw httpError('Order must be SERVED before it can be billed', 400)
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        companyId,
        orderId,
        amount,
        method,
        referenceNo,
        note,
        date: new Date(),
      },
    })

    const cashAccountName = method === 'CASH' ? 'Cash' : 'Bank'
    const description = `Order ${orderId.slice(0, 8)} payment`

    await tx.journalEntry.create({
      data: {
        companyId,
        date: created.date,
        description,
        debit: Number(order.subtotal.toFixed(2)) + Number(order.taxAmount.toFixed(2)) - Number(order.discount.toFixed(2)),
        credit: 0,
        accountId: await getAccountId(tx, companyId, cashAccountName),
      },
    })

    await tx.journalEntry.create({
      data: {
        companyId,
        date: created.date,
        description,
        debit: 0,
        credit: Number(order.subtotal.toFixed(2)) - Number(order.discount.toFixed(2)),
        accountId: await getAccountId(tx, companyId, 'Sales Revenue'),
      },
    })

    if (order.taxAmount > 0) {
      await tx.journalEntry.create({
        data: {
          companyId,
          date: created.date,
          description,
          debit: 0,
          credit: Number(order.taxAmount.toFixed(2)),
          accountId: await getAccountId(tx, companyId, 'Tax Payable'),
        },
      })
    }

    await tx.order.update({ where: { id: orderId }, data: { status: 'COMPLETED', cashierId: cashierId || order.cashierId } })

    return created
  })

  const updatedOrder = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, orderItems: { include: { menuItem: true } }, table: true } })

  fastify.emitToBranch(order.branchId, 'order:status', updatedOrder)
  fastify.emitToCompany(companyId, 'order:status', updatedOrder)
  fastify.emitToOrder(order.id, 'order:status', updatedOrder)

  return { payment, order: updatedOrder }
}

/**
 * Refund a completed order: reversing journal entries + a negative payment record for audit trail.
 */
async function refundOrderPayment(fastify, { companyId, orderId, amount, method, note }) {
  const prisma = fastify.prisma

  const order = await prisma.order.findFirst({ where: { id: orderId, companyId } })
  if (!order) throw httpError('Order not found', 404)
  if (order.status !== 'COMPLETED') {
    throw httpError('Only a completed (billed) order can be refunded', 400)
  }

  const refundAmount = Math.min(amount, order.totalAmount)

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        companyId,
        orderId,
        amount: -refundAmount,
        method,
        note: note || 'Refund',
        date: new Date(),
      },
    })

    const cashAccountName = method === 'CASH' ? 'Cash' : 'Bank'
    const description = `Refund for order ${orderId.slice(0, 8)}`

    await tx.journalEntry.create({
      data: {
        companyId,
        date: created.date,
        description,
        debit: 0,
        credit: refundAmount,
        accountId: await getAccountId(tx, companyId, cashAccountName),
      },
    })

    await tx.journalEntry.create({
      data: {
        companyId,
        date: created.date,
        description,
        debit: refundAmount,
        credit: 0,
        accountId: await getAccountId(tx, companyId, 'Sales Revenue'),
      },
    })

    return created
  })

  return payment
}

module.exports = { createOrderPayment, refundOrderPayment, getAccountId }
