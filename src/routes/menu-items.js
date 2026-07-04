'use strict'
const checkRole = require('../utils/checkRole')
const { resolveBranchId } = require('../utils/scope')

const STAFF = ['SUPERADMIN', 'BRANCHADMIN', 'KITCHEN', 'CASHIER', 'WAITER', 'ACCOUNTANT']
const MANAGERS = ['SUPERADMIN', 'BRANCHADMIN']

module.exports = async function (fastify, opts) {
  // List menu items for a branch (staff view - includes hidden/out-of-stock items)
  fastify.get('/', { preHandler: checkRole(...STAFF) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const branchId = resolveBranchId(request)
      if (!branchId) return reply.code(400).send({ statusCode: '01', message: 'branchId is required' })

      const { categoryId, availability, search } = request.query

      const items = await fastify.prisma.menuItem.findMany({
        where: {
          companyId,
          branchId,
          ...(categoryId ? { categoryId } : {}),
          ...(availability ? { availability } : {}),
          ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        },
        include: { category: true, subCategory: true, taxRate: true, images: true },
        orderBy: [{ categoryId: 'asc' }, { displayOrder: 'asc' }],
      })

      return reply.send({ statusCode: '00', message: 'Menu items fetched successfully', data: items })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch menu items', error: err.message })
    }
  })

  fastify.get('/:id', { preHandler: checkRole(...STAFF) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const item = await fastify.prisma.menuItem.findFirst({
        where: { id: request.params.id, companyId },
        include: { category: true, subCategory: true, taxRate: true, images: true },
      })
      if (!item) return reply.code(404).send({ statusCode: '01', message: 'Menu item not found' })

      return reply.send({ statusCode: '00', message: 'Menu item fetched successfully', data: item })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch menu item', error: err.message })
    }
  })

  fastify.post('/', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const branchId = resolveBranchId(request)
      if (!branchId) return reply.code(400).send({ statusCode: '01', message: 'branchId is required' })

      const {
        name, description, imageUrl, isVeg, price, prepTimeMinutes, kitchenStation,
        categoryId, subCategoryId, taxRateId, displayOrder, isRecommended, isPopular,
        spicyLevel, tags, availability,
      } = request.body

      const item = await fastify.prisma.menuItem.create({
        data: {
          companyId,
          branchId,
          categoryId,
          subCategoryId: subCategoryId || null,
          name,
          description,
          imageUrl,
          isVeg: isVeg ?? true,
          price,
          prepTimeMinutes,
          kitchenStation: kitchenStation || 'MAIN',
          taxRateId: taxRateId || null,
          displayOrder: displayOrder ?? 0,
          isRecommended: !!isRecommended,
          isPopular: !!isPopular,
          spicyLevel: spicyLevel ?? 0,
          tags: tags || [],
          availability: availability || 'AVAILABLE',
        },
      })

      return reply.code(201).send({ statusCode: '00', message: 'Menu item created successfully', data: item })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to create menu item', error: err.message })
    }
  })

  fastify.put('/:id', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const existing = await fastify.prisma.menuItem.findFirst({ where: { id: request.params.id, companyId } })
      if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Menu item not found' })

      const {
        name, description, imageUrl, isVeg, price, prepTimeMinutes, kitchenStation,
        categoryId, subCategoryId, taxRateId, displayOrder, isRecommended, isPopular,
        spicyLevel, tags, availability,
      } = request.body

      const item = await fastify.prisma.menuItem.update({
        where: { id: request.params.id },
        data: {
          name, description, imageUrl, isVeg, price, prepTimeMinutes, kitchenStation,
          categoryId, subCategoryId, taxRateId, displayOrder, isRecommended, isPopular,
          spicyLevel, tags, availability,
        },
      })

      return reply.send({ statusCode: '00', message: 'Menu item updated successfully', data: item })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to update menu item', error: err.message })
    }
  })

  // Instant availability/price toggle - both BRANCHADMIN and SUPERADMIN can do this
  fastify.patch('/:id/availability', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const { availability } = request.body

      if (!['AVAILABLE', 'OUT_OF_STOCK', 'HIDDEN'].includes(availability)) {
        return reply.code(400).send({ statusCode: '01', message: 'Invalid availability value' })
      }

      const existing = await fastify.prisma.menuItem.findFirst({ where: { id: request.params.id, companyId } })
      if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Menu item not found' })

      const item = await fastify.prisma.menuItem.update({ where: { id: request.params.id }, data: { availability } })

      fastify.emitToBranch(item.branchId, 'menu:availability', item)

      return reply.send({ statusCode: '00', message: 'Availability updated successfully', data: item })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to update availability', error: err.message })
    }
  })

  fastify.patch('/:id/price', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const { price } = request.body

      if (typeof price !== 'number' || price < 0) {
        return reply.code(400).send({ statusCode: '01', message: 'Invalid price' })
      }

      const existing = await fastify.prisma.menuItem.findFirst({ where: { id: request.params.id, companyId } })
      if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Menu item not found' })

      const item = await fastify.prisma.menuItem.update({ where: { id: request.params.id }, data: { price } })

      fastify.emitToBranch(item.branchId, 'menu:price', item)

      return reply.send({ statusCode: '00', message: 'Price updated successfully', data: item })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to update price', error: err.message })
    }
  })

  fastify.delete('/:id', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const existing = await fastify.prisma.menuItem.findFirst({ where: { id: request.params.id, companyId } })
      if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Menu item not found' })

      await fastify.prisma.menuItem.delete({ where: { id: request.params.id } })

      return reply.send({ statusCode: '00', message: 'Menu item deleted successfully' })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to delete menu item', error: err.message })
    }
  })
}
