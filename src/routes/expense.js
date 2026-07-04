'use strict'
const checkRole = require('../utils/checkRole')
const { getAccountId } = require('../services/paymentServices')
const { resolveBranchId } = require('../utils/scope')

const MANAGERS = ['SUPERADMIN', 'BRANCHADMIN', 'ACCOUNTANT']

module.exports = async function (fastify, opts) {

    const getDateRange = (period) => {
        const now = new Date()
        let from, to = new Date()

        if (period === "thisMonth") {
            from = new Date(now.getFullYear(), now.getMonth(), 1)
        }
        else if (period === "thisQuarter") {
            const q = Math.floor(now.getMonth() / 3)
            from = new Date(now.getFullYear(), q * 3, 1)
        }
        else {
            from = new Date(now.getFullYear(), 0, 1)
        }

        return { from, to }
    }

    fastify.post('/', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
        try {
            const { category, date, amount, note, taxRateId, imageId, imageUrl } = request.body
            const companyId = request.user.companyId
            const branchId = resolveBranchId(request)

            const expenseAccount = await fastify.prisma.account.findFirst({
                where: { companyId, type: 'EXPENSE', name: { contains: category, mode: 'insensitive' } }
            })
            const cashAccount = await fastify.prisma.account.findFirst({
                where: { companyId, type: 'ASSET', name: { contains: 'Cash', mode: 'insensitive' } }
            })

            if (!expenseAccount || !cashAccount) {
                return reply.code(400).send({ statusCode: '01', message: 'Required accounts not found' })
            }

            let taxAmount = 0
            let totalAmount = amount
            if (taxRateId) {
                const tax = await fastify.prisma.taxRate.findUnique({ where: { id: taxRateId } })
                if (!tax) return reply.code(404).send({ statusCode: '02', message: 'Tax rate not found' })
                taxAmount = Number(((amount * tax.rate) / 100).toFixed(2))
                totalAmount = Number((amount + taxAmount).toFixed(2))
            }

            const expense = await fastify.prisma.$transaction(async (tx) => {
                const created = await tx.expense.create({
                    data: {
                        companyId,
                        branchId,
                        accountId: expenseAccount.id,
                        date: new Date(date),
                        amount,
                        taxRateId: taxRateId || null,
                        taxAmount,
                        totalAmount,
                        note,
                    }
                })

                if (imageId && imageUrl) {
                    await tx.expenseImage.create({ data: { expenseId: created.id, imageId, imageUrl } })
                }

                const description = note ?? `${category} Expense`

                await tx.journalEntry.create({
                    data: { companyId, date: created.date, description, debit: amount, credit: 0, accountId: expenseAccount.id }
                })

                if (taxAmount > 0) {
                    await tx.journalEntry.create({
                        data: { companyId, date: created.date, description, debit: taxAmount, credit: 0, accountId: await getAccountId(tx, companyId, 'Tax Payable') }
                    })
                }

                await tx.journalEntry.create({
                    data: { companyId, date: created.date, description, debit: 0, credit: totalAmount, accountId: cashAccount.id }
                })

                return created
            })

            return reply.send({ statusCode: '00', message: 'Expense added successfully', data: expense })
        } catch (err) {
            fastify.log.error(err)
            return reply.code(500).send({ statusCode: '99', message: 'Failed to create expense', error: err.message })
        }
    })

    fastify.get('/chart', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
        try {
            const companyId = request.user.companyId
            const { period = "thisYear", branchId } = request.query
            const { from, to } = getDateRange(period)

            const expenseAccounts = await fastify.prisma.account.findMany({ where: { companyId, type: 'EXPENSE' } })

            const grouped = []
            for (const acc of expenseAccounts) {
                const total = (await fastify.prisma.journalEntry.aggregate({
                    where: { companyId, accountId: acc.id, debit: { gt: 0 }, date: { gte: from, lte: to } },
                    _sum: { debit: true }
                }))._sum.debit || 0

                grouped.push({ category: acc.name, total })
            }

            const grandTotal = grouped.reduce((s, x) => s + x.total, 0)

            return reply.send({ statusCode: "00", message: `Expense chart for ${period}`, data: { items: grouped, total: grandTotal } })
        } catch (err) {
            fastify.log.error(err)
            return reply.code(500).send({ statusCode: "99", message: err.message })
        }
    })

    fastify.get('/', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
        try {
            const { page = 1, take = 10, category, fromDate, toDate, branchId } = request.query
            const skip = (page - 1) * Number(take)
            const companyId = request.user.companyId

            const where = {
                companyId,
                ...(branchId ? { branchId } : {}),
                ...(category ? { account: { name: { contains: category, mode: 'insensitive' } } } : {}),
                ...(fromDate && { date: { gte: new Date(fromDate) } }),
                ...(toDate && { date: { lte: new Date(toDate) } }),
            }

            const [expenses, total] = await Promise.all([
                fastify.prisma.expense.findMany({
                    where, skip, take: Number(take), orderBy: { date: 'desc' },
                    include: { account: true, expenseImages: { include: { image: true } } },
                }),
                fastify.prisma.expense.count({ where }),
            ])

            return reply.send({ statusCode: '00', message: 'Expenses fetched successfully', data: expenses, total })
        } catch (err) {
            fastify.log.error(err)
            return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch expenses', error: err.message })
        }
    })

    fastify.get('/options', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
        try {
            const companyId = request.user.companyId
            const options = await fastify.prisma.account.findMany({
                where: { companyId, type: 'EXPENSE', NOT: { name: { equals: 'Purchases', mode: 'insensitive' } } },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            })

            return reply.code(200).send({ statusCode: '00', message: 'Expense options fetched successfully', data: options })
        } catch (err) {
            fastify.log.error(err)
            return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch expense options', error: err.message })
        }
    })

    fastify.put('/:id', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
        try {
            const { id } = request.params
            const { date, amount, note } = request.body
            const companyId = request.user.companyId

            const existing = await fastify.prisma.expense.findFirst({ where: { id, companyId } })
            if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Expense not found' })

            const updated = await fastify.prisma.expense.update({
                where: { id },
                data: {
                    date: date ? new Date(date) : existing.date,
                    amount: amount ?? existing.amount,
                    note: note ?? existing.note,
                }
            })

            return reply.code(200).send({ statusCode: '00', message: 'Expense updated successfully', data: updated })
        } catch (err) {
            fastify.log.error(err)
            return reply.code(500).send({ statusCode: '99', message: 'Failed to update expense', error: err.message })
        }
    })

    fastify.delete('/:id', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
        try {
            const { id } = request.params
            const companyId = request.user.companyId

            const existing = await fastify.prisma.expense.findFirst({ where: { id, companyId } })
            if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Expense not found' })

            await fastify.prisma.expense.delete({ where: { id } })

            return reply.code(200).send({ statusCode: '00', message: 'Expense deleted successfully' })
        } catch (err) {
            fastify.log.error(err)
            return reply.code(500).send({ statusCode: '99', message: 'Failed to delete expense', error: err.message })
        }
    })
}
