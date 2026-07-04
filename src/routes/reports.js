// routes/report.js
'use strict'
const checkRole = require('../utils/checkRole')

module.exports = async function (fastify) {
    fastify.get('/ledger/:accountId', {
        preHandler: checkRole("SUPERADMIN", "BRANCHADMIN", "ACCOUNTANT"),
        schema: {
            tags: ['Reports'],
            summary: 'Get ledger report for an account',
            params: {
                type: 'object',
                required: ['accountId'],
                properties: {
                    accountId: { type: 'string' }
                }
            },
            querystring: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' }
                }
            }
        }
    }, async (req, reply) => {
        const { accountId } = req.params
        const { startDate, endDate } = req.query

        const entries = await fastify.prisma.journalEntry.findMany({
            where: {
                accountId,
                companyId: req.user.companyId,
                date: {
                    gte: startDate ? new Date(startDate) : undefined,
                    lte: endDate ? new Date(endDate) : undefined
                }
            },
            orderBy: { date: 'asc' }
        })

        let balance = 0
        const ledger = entries.map(e => {
            balance += e.debit - e.credit
            return {
                date: e.date,
                description: e.description,
                debit: e.debit,
                credit: e.credit,
                runningBalance: balance
            }
        })

        return { statusCode: '00', data: ledger }
    })

    fastify.get('/ledger', {
        preHandler: checkRole("SUPERADMIN", "BRANCHADMIN", "ACCOUNTANT"),
        schema: {
            tags: ['Reports'],
            summary: 'Get full ledger report (all accounts)',
            querystring: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' }
                }
            }
        }
    }, async (req, reply) => {
        const { startDate, endDate } = req.query

        // 🧾 Get all accounts of the company
        const accounts = await fastify.prisma.account.findMany({
            where: { companyId: req.user.companyId },
            orderBy: { name: 'asc' }
        })

        // 📜 Get all journal entries within range
        const entries = await fastify.prisma.journalEntry.findMany({
            where: {
                companyId: req.user.companyId,
                date: {
                    gte: startDate ? new Date(startDate) : undefined,
                    lte: endDate ? new Date(endDate) : undefined
                }
            },
            orderBy: [{ accountId: 'asc' }, { date: 'asc' }],
            include: { account: true }
        })

        const ledger = []

        // 🧩 For each account, include its entries or show "No Transactions"
        for (const account of accounts) {
            ledger.push({
                isHeader: true,
                accountId: account.id,
                accountName: account.name
            })

            const accountEntries = entries.filter(e => e.accountId === account.id)
            if (accountEntries.length === 0) {
                ledger.push({
                    date: null,
                    description: 'No transactions',
                    debit: null,
                    credit: null,
                    runningBalance: null,
                    accountId: account.id
                })
                continue
            }

            let runningBalance = 0
            for (const e of accountEntries) {
                runningBalance += e.debit - e.credit
                ledger.push({
                    date: e.date,
                    description: e.description,
                    debit: e.debit,
                    credit: e.credit,
                    runningBalance,
                    accountId: e.accountId
                })
            }
        }

        return { statusCode: '00', data: ledger }
    })

    fastify.get('/profit-loss', {
        preHandler: checkRole("SUPERADMIN", "BRANCHADMIN", "ACCOUNTANT"),
        schema: {
            tags: ['Reports'],
            summary: 'Get Profit & Loss report',
            querystring: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' }
                }
            }
        }
    }, async (req, reply) => {
        try {
            const { startDate, endDate } = req.query

            const dateFilter =
                startDate || endDate
                    ? {
                        gte: startDate ? new Date(startDate) : undefined,
                        lte: endDate ? new Date(endDate) : undefined
                    }
                    : {}

            const grouped = await fastify.prisma.journalEntry.groupBy({
                by: ['accountId'],
                where: {
                    companyId: req.user.companyId,
                    ...(startDate || endDate ? { date: dateFilter } : {})
                },
                _sum: { debit: true, credit: true }
            })

            const result = await Promise.all(
                grouped.map(async (t) => {
                    const account = await fastify.prisma.account.findUnique({
                        where: { id: t.accountId },
                        select: { id: true, name: true, type: true }
                    })

                    return {
                        accountId: t.accountId,
                        accountName: account?.name || 'Unknown',
                        type: account?.type || 'OTHER',
                        debit: t._sum.debit || 0,
                        credit: t._sum.credit || 0,
                        balance: (t._sum.credit || 0) - (t._sum.debit || 0)
                    }
                })
            )

            const income = result.filter(a => a.type === 'INCOME')
            const expenses = result.filter(a => a.type === 'EXPENSE')

            const totalIncome = income.reduce((s, a) => s + (a.credit - a.debit), 0)

            const totalExpenses = expenses.reduce((s, a) => s + (a.debit - a.credit), 0)

            const netProfit = totalIncome - totalExpenses

            return {
                statusCode: '00',
                data: {
                    period: {
                        startDate: startDate || null,
                        endDate: endDate || null
                    },
                    income: {
                        accounts: income,
                        total: totalIncome
                    },
                    expenses: {
                        accounts: expenses,
                        total: totalExpenses
                    },
                    summary: {
                        netProfit,
                        isProfit: netProfit >= 0
                    }
                }
            }
        } catch (err) {
            req.log.error(err)
            return reply.code(500).send({
                statusCode: '99',
                message: 'Failed to fetch Profit & Loss report',
                error: err.message
            })
        }
    })

    fastify.get('/trial-balance', {
        preHandler: checkRole("SUPERADMIN", "BRANCHADMIN", "ACCOUNTANT"),
        schema: {
            tags: ['Reports'],
            summary: 'Get trial balance report grouped by account type',
            querystring: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' }
                }
            }
        }
    }, async (req, reply) => {
        try {
            const { startDate, endDate } = req.query

            const dateFilter =
                startDate || endDate
                    ? {
                        gte: startDate ? new Date(startDate) : undefined,
                        lte: endDate ? new Date(endDate) : undefined
                    }
                    : {}

            const grouped = await fastify.prisma.journalEntry.groupBy({
                by: ['accountId'],
                where: {
                    companyId: req.user.companyId,
                    ...(startDate || endDate ? { date: dateFilter } : {})
                },
                _sum: { debit: true, credit: true }
            })

            const result = await Promise.all(
                grouped.map(async (t) => {
                    const account = await fastify.prisma.account.findUnique({
                        where: { id: t.accountId },
                        select: { id: true, name: true, type: true }
                    })

                    return {
                        accountId: t.accountId,
                        accountName: account?.name || 'Unknown',
                        type: account?.type || 'OTHER',
                        debit: t._sum.debit || 0,
                        credit: t._sum.credit || 0,
                        balance: (t._sum.debit || 0) - (t._sum.credit || 0)
                    }
                })
            )

            const groups = {
                assets: result.filter(a => a.type === 'ASSET'),
                liabilities: result.filter(a => a.type === 'LIABILITY'),
                equity: result.filter(a => a.type === 'EQUITY'),
                income: result.filter(a => a.type === 'INCOME'),
                expenses: result.filter(a => a.type === 'EXPENSE')
            }

            const calcTotals = arr => ({
                debit: arr.reduce((s, a) => s + a.debit, 0),
                credit: arr.reduce((s, a) => s + a.credit, 0)
            })

            const totals = {
                assets: calcTotals(groups.assets),
                liabilities: calcTotals(groups.liabilities),
                equity: calcTotals(groups.equity),
                income: calcTotals(groups.income),
                expenses: calcTotals(groups.expenses)
            }

            const totalDebit = Object.values(totals).reduce((s, t) => s + t.debit, 0)
            const totalCredit = Object.values(totals).reduce((s, t) => s + t.credit, 0)
            const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 // allow floating error

            return {
                statusCode: '00',
                data: [
                    {
                        group: 'Application of Funds (Assets)',
                        items: groups.assets,
                        totals: totals.assets
                    },
                    {
                        group: 'Source of Funds (Liabilities & Equity)',
                        items: [...groups.liabilities, ...groups.equity],
                        totals: {
                            debit: totals.liabilities.debit + totals.equity.debit,
                            credit: totals.liabilities.credit + totals.equity.credit
                        }
                    },
                    {
                        group: 'Income',
                        items: groups.income,
                        totals: totals.income
                    },
                    {
                        group: 'Expenses',
                        items: groups.expenses,
                        totals: totals.expenses
                    }
                ],
                summary: {
                    totalDebit,
                    totalCredit,
                    isBalanced
                }
            }
        } catch (err) {
            req.log.error(err)
            return reply.code(500).send({
                statusCode: '99',
                message: 'Failed to fetch trial balance',
                error: err.message
            })
        }
    })
}
