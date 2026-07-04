async function createCompany(prisma, data) {

  const company = await prisma.company.create({ data })

  // Default chart of accounts
  const defaultAccounts = [
    // Assets
    { name: 'Cash', type: 'ASSET', code: '1000' },
    { name: 'Bank', type: 'ASSET', code: '1010' },
    { name: 'Accounts Receivable', type: 'ASSET', code: '1100' },
    { name: 'Inventory', type: 'ASSET', code: '1200' },
    { name: 'Tax Receivable', type: 'ASSET', code: '1300' },

    // Liabilities
    { name: 'Accounts Payable', type: 'LIABILITY', code: '2000' },
    { name: 'Tax Payable', type: 'LIABILITY', code: '2100' },

    // Equity
    { name: 'Owner Equity', type: 'EQUITY', code: '3000' },

    // Income
    { name: 'Sales Revenue', type: 'INCOME', code: '4000' },

    // Expenses
    { name: 'Purchases', type: 'EXPENSE', code: '5000' }, 
    { name: 'Rent Expense', type: 'EXPENSE', code: '5000' },
    { name: 'Salaries Expense', type: 'EXPENSE', code: '5100' },
    { name: 'Utilities Expense', type: 'EXPENSE', code: '5200' },
  ];

  await prisma.account.createMany({
    data: defaultAccounts.map(acc => ({
      ...acc,
      companyId: company.id,
    })),
  })

  return company
}

async function getCompany(prisma, id) {
  return prisma.company.findUnique({ where: { id } })
}

async function listCompanies(prisma, pagination = {}) {
  return prisma.company.findMany({ skip: pagination.skip, take: pagination.take })
}

module.exports = { createCompany, getCompany, listCompanies }