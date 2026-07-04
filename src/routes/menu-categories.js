'use strict'
const checkRole = require('../utils/checkRole')

const STAFF = ['SUPERADMIN', 'BRANCHADMIN', 'KITCHEN', 'CASHIER', 'WAITER', 'ACCOUNTANT']
const MANAGERS = ['SUPERADMIN', 'BRANCHADMIN']

module.exports = async function (fastify, opts) {
  // List categories with their sub-categories, for the company (shared taxonomy across branches)
  fastify.get('/', { preHandler: checkRole(...STAFF) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId

      const categories = await fastify.prisma.menuCategory.findMany({
        where: { companyId },
        include: { subCategories: { orderBy: { displayOrder: 'asc' } }, image: true },
        orderBy: { displayOrder: 'asc' },
      })

      return reply.send({ statusCode: '00', message: 'Menu categories fetched successfully', data: categories })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to fetch menu categories', error: err.message })
    }
  })

  fastify.post('/', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const { name, description, displayOrder, imageID } = request.body
      const companyId = request.user.companyId

      const category = await fastify.prisma.menuCategory.create({
        data: { name, description, displayOrder: displayOrder ?? 0, companyId, imageID: imageID || null },
      })

      return reply.code(201).send({ statusCode: '00', message: 'Menu category created successfully', data: category })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to create menu category', error: err.message })
    }
  })

  fastify.put('/:id', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const existing = await fastify.prisma.menuCategory.findFirst({ where: { id: request.params.id, companyId } })
      if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Menu category not found' })

      const { name, description, displayOrder, imageID } = request.body
      const category = await fastify.prisma.menuCategory.update({
        where: { id: request.params.id },
        data: { name, description, displayOrder, imageID },
      })

      return reply.send({ statusCode: '00', message: 'Menu category updated successfully', data: category })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to update menu category', error: err.message })
    }
  })

  fastify.delete('/:id', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const existing = await fastify.prisma.menuCategory.findFirst({ where: { id: request.params.id, companyId } })
      if (!existing) return reply.code(404).send({ statusCode: '01', message: 'Menu category not found' })

      await fastify.prisma.menuCategory.delete({ where: { id: request.params.id } })

      return reply.send({ statusCode: '00', message: 'Menu category deleted successfully' })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to delete menu category (it may still have menu items)', error: err.message })
    }
  })

  // Sub-categories
  fastify.post('/:categoryId/sub-categories', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const companyId = request.user.companyId
      const category = await fastify.prisma.menuCategory.findFirst({ where: { id: request.params.categoryId, companyId } })
      if (!category) return reply.code(404).send({ statusCode: '01', message: 'Menu category not found' })

      const { name, displayOrder } = request.body
      const subCategory = await fastify.prisma.menuSubCategory.create({
        data: { name, displayOrder: displayOrder ?? 0, categoryId: category.id },
      })

      return reply.code(201).send({ statusCode: '00', message: 'Menu sub-category created successfully', data: subCategory })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to create menu sub-category', error: err.message })
    }
  })

  fastify.put('/sub-categories/:id', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      const { name, displayOrder } = request.body
      const subCategory = await fastify.prisma.menuSubCategory.update({
        where: { id: request.params.id },
        data: { name, displayOrder },
      })

      return reply.send({ statusCode: '00', message: 'Menu sub-category updated successfully', data: subCategory })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to update menu sub-category', error: err.message })
    }
  })

  fastify.delete('/sub-categories/:id', { preHandler: checkRole(...MANAGERS) }, async (request, reply) => {
    try {
      await fastify.prisma.menuSubCategory.delete({ where: { id: request.params.id } })
      return reply.send({ statusCode: '00', message: 'Menu sub-category deleted successfully' })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: '99', message: 'Failed to delete menu sub-category', error: err.message })
    }
  })
}
