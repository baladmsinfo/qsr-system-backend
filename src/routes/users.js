'use strict'
const userService = require('../services/userService')
const { enqueueUserRegistrationEmail } = require("../services/emailServices");
const { comparePassword } = require('../utils/hash')
const { generateApiKey } = require('../utils/keyGenerator')
const { generateShortTenant } = require('../utils/tenant')
const bcrypt = require('bcrypt');
const checkRole = require('../utils/checkRole')

const ALL_STAFF = ['SUPERADMIN', 'BRANCHADMIN', 'KITCHEN', 'CASHIER', 'WAITER', 'ACCOUNTANT']

module.exports = async function (fastify, opts) {

  function generateRandomPassword(length = 10) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$&!";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  // Restaurant company sign-up: creates the Company, its first Branch,
  // a SUPERADMIN (company owner) and a BRANCHADMIN for that branch.
  fastify.post("/register", async (request, reply) => {
    try {
      const { password, company: companyData, branch: branchData } = request.body;
      const { primaryEmail, primaryPhoneNo, secondaryEmail, secondaryPhoneNo } = companyData;

      const existingEmail = await fastify.prisma.user.findMany({
        where: { email: { in: [primaryEmail, secondaryEmail].filter(Boolean) } }
      });

      if (existingEmail.length > 0) {
        return reply.send({ statusCode: "02", message: "Email already registered" });
      }

      const currency = await fastify.prisma.currency.findUnique({
        where: { id: companyData.currencyId }
      });

      if (!currency) {
        return reply.send({ statusCode: "01", message: "Invalid currencyId" });
      }

      const company = await fastify.prisma.company.create({
        data: {
          name: companyData.name,
          companyType: companyData.companyType || 'Restaurant',
          gstNumber: companyData.gstNumber || null,
          primaryEmail,
          primaryPhoneNo,
          secondaryEmail,
          secondaryPhoneNo,
          addressLine1: companyData.addressLine1,
          addressLine2: companyData.addressLine2,
          addressLine3: companyData.addressLine3,
          city: companyData.city,
          state: companyData.state,
          pincode: Number(companyData.pincode),
          currencyId: companyData.currencyId,
          shortname: await generateShortTenant(companyData.name),
          tenant: companyData.tenant,
          publicapiKey: generateApiKey(),
          privateapiKey: generateApiKey()
        }
      });

      const branch = await fastify.prisma.branch.create({
        data: {
          name: (branchData && branchData.name) || `${company.name} - Main`,
          companyId: company.id,
          addressLine1: company.addressLine1,
          addressLine2: company.addressLine2,
          addressLine3: company.addressLine3,
          city: company.city,
          state: company.state,
          pincode: company.pincode,
          gstNumber: company.gstNumber,
          phone: primaryPhoneNo,
        }
      });

      const defaultAccounts = [
        { name: 'Cash', type: 'ASSET', code: '1000' },
        { name: 'Bank', type: 'ASSET', code: '1010' },
        { name: 'Accounts Receivable', type: 'ASSET', code: '1100' },
        { name: 'Tax Receivable', type: 'ASSET', code: '1300' },
        { name: 'Accounts Payable', type: 'LIABILITY', code: '2000' },
        { name: 'Tax Payable', type: 'LIABILITY', code: '2100' },
        { name: 'Owner Equity', type: 'EQUITY', code: '3000' },
        { name: 'Sales Revenue', type: 'INCOME', code: '4000' },
        { name: 'Purchases', type: 'EXPENSE', code: '5000' },
        { name: 'Rent Expense', type: 'EXPENSE', code: '5100' },
        { name: 'Salaries Expense', type: 'EXPENSE', code: '5200' },
        { name: 'Utilities Expense', type: 'EXPENSE', code: '5300' },
      ];
      await fastify.prisma.account.createMany({
        data: defaultAccounts.map(a => ({ ...a, companyId: company.id }))
      });

      const branchPassword = generateRandomPassword();
      const hashedBranchPassword = await bcrypt.hash(branchPassword, 10);
      const hashedPassword = await bcrypt.hash(password, 10);

      const superAdmin = await fastify.prisma.user.create({
        data: {
          email: primaryEmail,
          password: hashedPassword,
          name: `${company.name} Super Admin`,
          role: "SUPERADMIN",
          status: true,
          companyId: company.id,
          branchId: null
        }
      });

      const branchAdmin = await fastify.prisma.user.create({
        data: {
          email: secondaryEmail || primaryEmail,
          password: hashedBranchPassword,
          name: `${branch.name} Admin`,
          role: "BRANCHADMIN",
          status: true,
          companyId: company.id,
          branchId: branch.id,
        }
      });

      await enqueueUserRegistrationEmail({
        to: primaryEmail,
        name: company.name,
        role: "SUPERADMIN",
        email: primaryEmail,
        mobile_no: primaryPhoneNo,
        password: password,
      });

      if (secondaryEmail) {
        await enqueueUserRegistrationEmail({
          to: secondaryEmail,
          name: branch.name,
          role: "BRANCHADMIN",
          email: secondaryEmail,
          mobile_no: secondaryPhoneNo,
          password: branchPassword,
        });
      }

      return reply.send({
        statusCode: "00",
        message: "Company, branch & users created successfully",
        data: { company, branch, superAdmin, branchAdmin }
      });

    } catch (err) {
      request.log.error(err);
      return reply.send({
        statusCode: "99",
        message: "Internal server error",
        error: err.message
      });
    }
  });

  fastify.get("/check-tenant", async (request, reply) => {
    const { tenant } = request.query

    if (!tenant || tenant.length < 3) {
      return reply.send({ available: false })
    }

    const existing = await fastify.prisma.company.findUnique({
      where: { tenant }
    })

    return reply.send({
      available: !existing
    })
  })

  fastify.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login user and get JWT token',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { email, password } = request.body
      const user = await userService.findByEmail(fastify.prisma, email)
      if (!user) return reply.code(401).send({ statusCode: 401, message: 'Email not Existed' })

      const ok = await comparePassword(password, user.password)
      if (!ok) return reply.code(401).send({ statusCode: 401, message: 'Invalid credentials' })

      const token = fastify.jwt.sign({
        id: user.id,
        role: user.role,
        companyId: user.companyId,
        branchId: user.branchId || null,
      })

      return reply.code(200).send({
        statusCode: 200,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          branchId: user.branchId || null,
        },
      })
    } catch (err) {
      return reply.code(500).send({ statusCode: 500, message: err.message })
    }
  })

  fastify.get('/currencies', {
    schema: { tags: ['Auth'], summary: 'Fetch currency options for registration page' }
  }, async (request, reply) => {
    try {
      const currencies = await fastify.prisma.currency.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true, symbol: true, country: true },
      });

      return reply.code(200).send({ statusCode: 200, message: "Currencies fetched successfully", data: currencies });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: 500, message: "Internal server error", error: err.message });
    }
  });

  // List staff users for the company (SUPERADMIN only)
  fastify.get('/', {
    preHandler: checkRole("SUPERADMIN"),
    schema: { tags: ['Auth'], summary: 'Get all users in the company' }
  }, async (request, reply) => {
    try {
      const users = await fastify.prisma.user.findMany({
        where: { companyId: request.user.companyId },
        select: {
          id: true, name: true, email: true, role: true, status: true,
          branchId: true, branch: { select: { name: true } }, createdAt: true,
        },
        skip: Number(request.query.skip) || 0,
        take: Number(request.query.take) || 100,
      })

      return reply.code(200).send({ statusCode: 200, message: 'Users fetched successfully', data: users })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: 500, message: 'Internal server error', error: err.message })
    }
  })

  fastify.get('/me', {
    preHandler: checkRole(...ALL_STAFF),
    schema: { tags: ['Auth'], summary: 'Get currently authenticated user', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    try {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        include: { company: { include: { currency: true } }, branch: true },
      })

      if (!user) return reply.code(404).send({ statusCode: 404, message: 'User not found' })

      user.password = undefined

      return reply.code(200).send({ statusCode: 200, message: 'User fetched successfully', user })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ statusCode: 500, message: 'Internal server error', error: err.message })
    }
  })

  // Danger: wipes all demo data. Dev only.
  fastify.delete('/delete-all-users', async (request, reply) => {
    try {
      await fastify.prisma.$transaction(async (tx) => {
        await tx.orderItem.deleteMany({});
        await tx.kitchenTicket.deleteMany({});
        await tx.payment.deleteMany({});
        await tx.order.deleteMany({});

        await tx.expenseImage.deleteMany({});
        await tx.expense.deleteMany({});
        await tx.purchase.deleteMany({});
        await tx.journalEntry.deleteMany({});

        await tx.account.updateMany({ data: { parentId: null } });
        await tx.account.deleteMany({});

        await tx.menuItem.deleteMany({});
        await tx.menuSubCategory.deleteMany({});
        await tx.menuCategory.deleteMany({});
        await tx.diningTable.deleteMany({});

        await tx.taxRate.deleteMany({});
        await tx.customer.deleteMany({});
        await tx.vendor.deleteMany({});
        await tx.banner.deleteMany({});
        await tx.license.deleteMany({});

        await tx.user.deleteMany({});
        await tx.branch.deleteMany({});
        await tx.company.deleteMany({});
      });

      return reply.code(200).send({ statusCode: '00', message: 'All demo data deleted successfully' });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ statusCode: '99', message: 'Internal server error while deleting data', error: err.message });
    }
  });
}
