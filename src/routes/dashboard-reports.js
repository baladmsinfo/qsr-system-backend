// routes/dashboardReports.js
'use strict'
const checkRole = require('../utils/checkRole')
const { startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear } = require('date-fns')

const MANAGERS = ['SUPERADMIN', 'BRANCHADMIN', 'ACCOUNTANT']

module.exports = async function (fastify) {
    function getDateRange(period) {
        const now = new Date()
        switch (period) {
            case 'thisMonth':
                return { start: startOfMonth(now), end: endOfMonth(now) }
            case 'thisQuarter':
                return { start: startOfQuarter(now), end: endOfQuarter(now) }
            case 'thisYear':
                return { start: startOfYear(now), end: endOfYear(now) }
            case 'yearToDate':
            default:
                return { start: startOfYear(now), end: now }
        }
    }

    function groupKey(date, groupBy) {
        const d = new Date(date)
        if (groupBy === 'day') return d.toISOString().slice(0, 10)
        if (groupBy === 'week') {
            const weekStart = new Date(d)
            weekStart.setDate(d.getDate() - d.getDay())
            return weekStart.toISOString().slice(0, 10)
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }

    function applyBranchFilter(base, branchId) {
        if (!branchId) return base
        return { ...base, branchId }
    }

    // Cash inflow (order payments) vs outflow (purchases)
    fastify.get('/reports/dashboard/cashflow', {
        preHandler: checkRole(...MANAGERS),
    }, async (req, reply) => {
        const { period, branchId } = req.query
        const { start, end } = getDateRange(period)
        const companyId = req.user.companyId
        const groupBy = period === 'thisMonth' ? 'day' : period === 'thisQuarter' ? 'week' : 'month'

        const [payments, purchases] = await Promise.all([
            fastify.prisma.payment.findMany({
                where: { companyId, date: { gte: start, lte: end } },
                include: { order: { select: { branchId: true } } },
            }),
            fastify.prisma.purchase.findMany({
                where: applyBranchFilter({ companyId, date: { gte: start, lte: end } }, branchId),
            }),
        ])

        const filteredPayments = branchId ? payments.filter(p => p.order?.branchId === branchId) : payments

        const grouped = {}
        for (const p of filteredPayments) {
            const key = groupKey(p.date, groupBy)
            if (!grouped[key]) grouped[key] = { inflow: 0, outflow: 0 }
            grouped[key].inflow += p.amount
        }
        for (const pu of purchases) {
            const key = groupKey(pu.date, groupBy)
            if (!grouped[key]) grouped[key] = { inflow: 0, outflow: 0 }
            grouped[key].outflow += pu.totalAmount
        }

        const result = Object.keys(grouped)
            .sort((a, b) => new Date(a) - new Date(b))
            .map(dateKey => ({ date: dateKey, ...grouped[dateKey] }))

        return reply.send({ statusCode: '00', data: result })
    })

    // Sales (completed orders) vs purchases, grouped over time
    fastify.get('/reports/dashboard/profit-loss', {
        preHandler: checkRole(...MANAGERS),
    }, async (req, reply) => {
        const { period, branchId } = req.query
        const { start, end } = getDateRange(period)
        const companyId = req.user.companyId
        const groupBy = period === 'thisMonth' ? 'day' : period === 'thisQuarter' ? 'week' : 'month'

        const [orders, purchases] = await Promise.all([
            fastify.prisma.order.findMany({
                where: applyBranchFilter({ companyId, status: 'COMPLETED', createdAt: { gte: start, lte: end } }, branchId),
            }),
            fastify.prisma.purchase.findMany({
                where: applyBranchFilter({ companyId, date: { gte: start, lte: end } }, branchId),
            }),
        ])

        const grouped = {}
        for (const o of orders) {
            const key = groupKey(o.createdAt, groupBy)
            if (!grouped[key]) grouped[key] = { sales: 0, purchases: 0 }
            grouped[key].sales += o.totalAmount
        }
        for (const pu of purchases) {
            const key = groupKey(pu.date, groupBy)
            if (!grouped[key]) grouped[key] = { sales: 0, purchases: 0 }
            grouped[key].purchases += pu.totalAmount
        }

        const result = Object.keys(grouped)
            .sort((a, b) => new Date(a) - new Date(b))
            .map(dateKey => ({
                date: dateKey,
                profitLoss: grouped[dateKey].sales - grouped[dateKey].purchases,
                sales: grouped[dateKey].sales,
                purchases: grouped[dateKey].purchases,
            }))

        return reply.send({ statusCode: '00', data: result })
    })

    fastify.get('/reports/dashboard/sales', {
        preHandler: checkRole(...MANAGERS),
    }, async (req, reply) => {
        const { period, branchId } = req.query
        const { start, end } = getDateRange(period)
        const companyId = req.user.companyId

        const orders = await fastify.prisma.order.findMany({
            where: applyBranchFilter({ companyId, createdAt: { gte: start, lte: end }, status: { not: 'CANCELLED' } }, branchId),
            include: { payments: true },
        })

        let paid = 0, unpaid = 0
        for (const o of orders) {
            const totalPaid = o.payments.reduce((s, p) => s + p.amount, 0)
            if (totalPaid >= o.totalAmount) paid += o.totalAmount
            else unpaid += o.totalAmount - totalPaid
        }

        return { statusCode: '00', data: { period, paid, unpaid } }
    })

    fastify.get('/reports/dashboard/purchases', {
        preHandler: checkRole(...MANAGERS),
    }, async (req, reply) => {
        const { period, branchId } = req.query
        const { start, end } = getDateRange(period)
        const companyId = req.user.companyId

        const purchases = await fastify.prisma.purchase.findMany({
            where: applyBranchFilter({ companyId, date: { gte: start, lte: end } }, branchId),
        })

        const total = purchases.reduce((s, p) => s + p.totalAmount, 0)

        return { statusCode: '00', data: { period, total } }
    })
}
