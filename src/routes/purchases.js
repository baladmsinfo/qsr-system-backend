'use strict'
const checkRole = require('../utils/checkRole')
const { getAccountId } = require('../services/paymentServices')
const { resolveBranchId } = require('../utils/scope')

const MANAGERS = ['SUPERADMIN', 'BRANCHADMIN', 'ACCOUNTANT']

module.exports = async function (fastify, opts) {
  fastify.get('/', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const { page = 1, take = 10, vendorId } = request.query
      const skip = (page - 1) * Number(take)

      const where = { companyId, ...(vendorId ? { vendorId } : {}) }

      const [purchases, total] = await Promise.all([
        fastify.prisma.purchase.findMany({
          where, skip, take: Number(take), orderBy: { date: 'desc' },
          include: { vendor: true, taxRate: true },
        }),
        fastify.prisma.purchase.count({ where }),
      ])

      return reply.send({ statusCode: '00', message: 'Purchases fetched successfully', data: purchases, total })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch purchases', error: err.message })
    }
  })

  fastify.post('/', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const branchId = resolveBranchId(request)
      const { vendorId, date, amount, taxRateId, note } = request.body

      const vendor = await fastify.prisma.vendor.findFirst({ where: { id: vendorId, companyId } })
      if (!vendor) return reply.code(404).send({ statusCode: '01', message: 'Vendor not found' })

      let taxAmount = 0
      let totalAmount = amount
      if (taxRateId) {
        const tax = await fastify.prisma.taxRate.findUnique({ where: { id: taxRateId } })
        if (!tax) return reply.code(404).send({ statusCode: '02', message: 'Tax rate not found' })
        taxAmount = Number(((amount * tax.rate) / 100).toFixed(2))
        totalAmount = Number((amount + taxAmount).toFixed(2))
      }

      const purchase = await fastify.prisma.$transaction(async (tx) => {
        const created = await tx.purchase.create({
          data: { companyId, branchId, vendorId, date: new Date(date), amount, taxRateId: taxRateId || null, taxAmount, totalAmount, note },
        })

        const description = note ?? `Purchase from ${vendor.name}`

        await tx.journalEntry.create({
          data: { companyId, date: created.date, description, debit: amount, credit: 0, accountId: await getAccountId(tx, companyId, 'Purchases') },
        })

        if (taxAmount > 0) {
          await tx.journalEntry.create({
            data: { companyId, date: created.date, description, debit: taxAmount, credit: 0, accountId: await getAccountId(tx, companyId, 'Tax Receivable') },
          })
        }

        await tx.journalEntry.create({
          data: { companyId, date: created.date, description, debit: 0, credit: totalAmount, accountId: await getAccountId(tx, companyId, 'Accounts Payable') },
        })

        return created
      })

      return reply.code(201).send({ statusCode: '00', message: 'Purchase recorded successfully', data: purchase })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to record purchase', error: err.message })
    }
  })

  fastify.delete('/:id', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const existing = await fastify.prisma.purchase.findFirst({ where: { id: request.params.id, companyId } })
      if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Purchase not found' })

      await fastify.prisma.purchase.delete({ where: { id: request.params.id } })

      return reply.send({ statusCode: '00', message: 'Purchase deleted successfully' })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to delete purchase', error: err.message })
    }
  })
}
