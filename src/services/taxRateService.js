async function createTaxRate(prisma, data) { return prisma.taxRate.create({ data }) }
async function listTaxRates(prisma, companyId) { return prisma.taxRate.findMany({ where: { companyId } }) }
module.exports = { createTaxRate, listTaxRates }
