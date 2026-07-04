// services/accountService.js
async function createAccount(prisma, data, companyId) {
  return await prisma.account.create({
    data: {
      name: data.name,
      type: data.type,
      code: data.code,
      companyId
    }
  })
}

async function listAccountsOptions(prisma, companyId) {
  return await prisma.account.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true
    }
  });
}

async function listAccountsGrouped(prisma, companyId) {
  // 1️⃣ Get all accounts + debit/credit totals using aggregation
  const accounts = await prisma.account.findMany({
    where: { companyId },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
      journals: {
        select: {
          debit: true,
          credit: true
        }
      }
    }
  });

  // 2️⃣ Compute balance for each account
  const enriched = accounts.map(acc => {
    const totalDebit = acc.journals.reduce((sum, j) => sum + j.debit, 0);
    const totalCredit = acc.journals.reduce((sum, j) => sum + j.credit, 0);

    const balance = totalDebit - totalCredit;

    return {
      ...acc,
      balance,
      balanceLabel:
        balance === 0
          ? '0.00'
          : balance > 0
            ? `${balance.toFixed(2)} DR`
            : `${Math.abs(balance).toFixed(2)} CR`
    };
  });

  // 3️⃣ Group by type
  const grouped = {
    ASSET: [],
    LIABILITY: [],
    EQUITY: [],
    INCOME: [],
    EXPENSE: []
  };

  for (const acc of enriched) {
    grouped[acc.type].push(acc);
  }

  return grouped;
}

async function listAccounts(prisma, companyId) {
  return prisma.account.findMany({
    where: { companyId },
    orderBy: { code: 'asc' }
  })
}

async function listAccountsByType(prisma, companyId, type) {
  return prisma.account.findMany({
    where: { companyId, type },
    orderBy: { code: 'asc' }
  })
}

module.exports = { createAccount, listAccountsGrouped, listAccountsOptions, listAccounts, listAccountsByType }