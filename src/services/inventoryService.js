'use strict'

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode })
}

/** Quantity-based menu items for a branch, with their current stock level (0 if no row yet). */
async function listStock(prisma, { companyId, branchId }) {
  const items = await prisma.menuItem.findMany({
    where: { companyId, branchId, unitType: { not: null } },
    include: {
      category: true,
      stocks: { where: { branchId } },
    },
    orderBy: { name: 'asc' },
  })

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    unitType: item.unitType,
    customUnitLabel: item.customUnitLabel,
    price: item.price,
    availability: item.availability,
    category: item.category,
    quantityAvailable: item.stocks[0]?.quantityAvailable ?? 0,
    updatedAt: item.stocks[0]?.updatedAt ?? null,
  }))
}

/** Sets the absolute stock level for one item at one branch (upsert). */
async function setStock(prisma, { companyId, branchId, menuItemId, quantityAvailable }) {
  if (typeof quantityAvailable !== 'number' || quantityAvailable < 0) {
    throw httpError('quantityAvailable must be a non-negative number', 400)
  }

  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, companyId } })
  if (!item) throw httpError('Menu item not found', 404)
  if (!item.unitType) throw httpError('This item is not quantity-based - it has no unit configured', 400)

  const stock = await prisma.menuItemStock.upsert({
    where: { menuItemId_branchId: { menuItemId, branchId } },
    update: { quantityAvailable },
    create: { menuItemId, branchId, quantityAvailable },
  })

  return stock
}

module.exports = { listStock, setStock }
