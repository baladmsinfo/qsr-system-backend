'use strict'
const svc = require('../services/customerService')
const checkRole = require('../utils/checkRole')

module.exports = async function (fastify, opts) {
  // Create customer
  // Create Customer
  fastify.post(
    "/",
    {
      preHandler: checkRole("SUPERADMIN", "BRANCHADMIN", "WAITER", "CASHIER"),
    },
    async (request, reply) => {
      try {
        const data = { ...request.body, companyId: request.user.companyId };

        const customer = await svc.createCustomer(fastify.prisma, data);

        reply.code(201).send({
          statusCode: "00",
          message: "Customer created successfully",
          data: customer
        });
      } catch (error) {
        fastify.log.error(error);
        reply.code(500).send({
          statusCode: "99",
          message: "Failed to create customer",
          error: error.message
        });
      }
    }
  );

  // List customers
  fastify.get(
    '/',
    {
      preHandler: checkRole("SUPERADMIN", "BRANCHADMIN", "WAITER", "CASHIER"),
      schema: {
        tags: ['Customers'],
        summary: 'List customers (paginated)',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', example: 1 },
            take: { type: 'number', example: 20 }
          }
        }
      }
    },
    async (request, reply) => {
      const page = Number(request.query.page || 1)
      const take = Number(request.query.take || 20)
      const skip = (page - 1) * take
      return svc.listCustomers(fastify.prisma, request.user.companyId, { skip, take })
    }
  )

  fastify.get(
    '/:id',
    {
      preHandler: checkRole("SUPERADMIN", "BRANCHADMIN", "WAITER", "CASHIER"),
      schema: {
        tags: ['Customers'],
        summary: 'Get customer by ID',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const customer = await svc.getCustomerById(
          fastify.prisma,
          request.params.id,
          request.user.companyId
        )

        if (!customer) {
          return reply.code(404).send({
            statusCode: "01",
            message: "Customer not found"
          })
        }

        reply.send({
          statusCode: "00",
          data: customer
        })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({
          statusCode: "99",
          message: "Failed to fetch customer",
          error: error.message
        })
      }
    }
  )

  fastify.get(
    '/:id/orders',
    {
      preHandler: checkRole("SUPERADMIN", "BRANCHADMIN", "WAITER", "CASHIER"),
    },
    async (request, reply) => {
      const { startDate, endDate, take } = request.query

      const orders = await svc.getCustomerOrders(
        fastify.prisma,
        request.params.id,
        request.user.companyId,
        { startDate, endDate, take: Number(take) || 10 }
      )

      reply.send({
        statusCode: '00',
        data: orders,
      })
    }
  )

  // Update customer
  fastify.put(
    '/:id',
    {
      preHandler: checkRole("SUPERADMIN", "BRANCHADMIN", "WAITER", "CASHIER"),
      schema: {
        tags: ['Customers'],
        summary: 'Update an existing customer',
        params: {
          type: 'object',
          properties: { id: { type: 'string', example: 'customer-id-uuid' } }
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'John Doe Updated' },
            email: { type: 'string', example: 'john.new@example.com' },
            phone: { type: 'string', example: '+91-9999999999' },
            gstin: { type: 'string', example: '22BBBBB1111B2Z6' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const updated = await svc.updateCustomer(
          fastify.prisma,
          request.params.id,
          request.body,
          request.user.companyId
        )
        if (!updated) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Customer not found'
          })
        }
        reply.send({
          statusCode: 200,
          message: 'Customer updated successfully',
          data: updated
        })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to update customer',
          error: error.message
        })
      }
    }
  )

  // Delete customer
  fastify.delete(
    '/:id',
    {
      preHandler: checkRole("SUPERADMIN", "BRANCHADMIN", "WAITER", "CASHIER"),
      schema: {
        tags: ['Customers'],
        summary: 'Delete a customer',
        params: {
          type: 'object',
          properties: { id: { type: 'string', example: 'customer-id-uuid' } }
        }
      }
    },
    async (request, reply) => {
      try {
        const deleted = await svc.deleteCustomer(
          fastify.prisma,
          request.params.id,
          request.user.companyId
        )
        if (!deleted) {
          return reply.code(404).send({
            statusCode: 404,
            message: 'Customer not found'
          })
        }
        reply.send({
          statusCode: 200,
          message: 'Customer deleted successfully'
        })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({
          statusCode: 500,
          message: 'Failed to delete customer',
          error: error.message
        })
      }
    }
  )
}
