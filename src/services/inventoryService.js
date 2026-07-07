'use strict'

const LOW_STOCK_THRESHOLD = 5

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

  return items.map((item) => {
    const quantityAvailable = item.stocks[0]?.quantityAvailable ?? 0
    let stockStatus = 'IN_STOCK'
    if (!item.trackInventory) stockStatus = 'UNLIMITED'
    else if (quantityAvailable <= 0) stockStatus = 'OUT_OF_STOCK'
    else if (quantityAvailable < LOW_STOCK_THRESHOLD) stockStatus = 'LOW_STOCK'

    return {
      id: item.id,
      name: item.name,
      unitType: item.unitType,
      customUnitLabel: item.customUnitLabel,
      price: item.price,
      availability: item.availability,
      category: item.category,
      trackInventory: item.trackInventory,
      quantityAvailable,
      stockStatus,
      updatedAt: item.stocks[0]?.updatedAt ?? null,
    }
  })
}

/** Sets the absolute stock level for one item at one branch (upsert) - logs an audit row. */
async function setStock(prisma, { companyId, branchId, menuItemId, quantityAvailable, reason, actor }) {
  if (typeof quantityAvailable !== 'number' || quantityAvailable < 0) {
    throw httpError('quantityAvailable must be a non-negative number', 400)
  }

  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, companyId } })
  if (!item) throw httpError('Menu item not found', 404)
  if (!item.unitType) throw httpError('This item is not quantity-based - it has no unit configured', 400)
  if (!item.trackInventory) throw httpError('This item has unlimited stock - inventory is not tracked for it', 400)

  return prisma.$transaction(async (tx) => {
    const existing = await tx.menuItemStock.findUnique({ where: { menuItemId_branchId: { menuItemId, branchId } } })
    const previousQty = existing?.quantityAvailable ?? 0

    const stock = await tx.menuItemStock.upsert({
      where: { menuItemId_branchId: { menuItemId, branchId } },
      update: { quantityAvailable },
      create: { menuItemId, branchId, quantityAvailable },
    })

    await tx.stockAdjustment.create({
      data: {
        menuItemId,
        branchId,
        previousQty,
        newQty: quantityAvailable,
        delta: Number((quantityAvailable - previousQty).toFixed(3)),
        reason: reason || 'Manual adjustment',
        actorId: actor?.id || null,
        actorRole: actor?.role || null,
      },
    })

    return stock
  })
}

/** Toggle whether a quantity-based item's stock is tracked at all ("unlimited" when false). */
async function setTrackInventory(prisma, { companyId, menuItemId, trackInventory }) {
  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, companyId } })
  if (!item) throw httpError('Menu item not found', 404)
  if (!item.unitType) throw httpError('This item is not quantity-based - it has no unit configured', 400)

  return prisma.menuItem.update({ where: { id: menuItemId }, data: { trackInventory: !!trackInventory } })
}

async function getHistory(prisma, { companyId, branchId, menuItemId }) {
  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, companyId } })
  if (!item) throw httpError('Menu item not found', 404)

  return prisma.stockAdjustment.findMany({
    where: { menuItemId, branchId },
    include: { actor: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

module.exports = { LOW_STOCK_THRESHOLD, listStock, setStock, setTrackInventory, getHistory }
