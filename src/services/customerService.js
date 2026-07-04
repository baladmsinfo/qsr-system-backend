// src/services/customerService.js
async function createCustomer(prisma, data) {
  return prisma.customer.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      companyId: data.companyId,
    },
  });
}

async function listCustomers(prisma, companyId, { skip, take }) {
  const [data, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where: { companyId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customer.count({
      where: { companyId },
    }),
  ])

  return {
    statusCode: "00",
    data,
    total,
  }
}

async function getCustomerById(prisma, customerId, companyId) {
  return prisma.customer.findFirst({
    where: {
      id: customerId,
      companyId,
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          gstNumber: true,
          primaryEmail: true,
          primaryPhoneNo: true,
        },
      },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          createdAt: true,
        },
      },
    },
  })
}

async function getCustomerOrders(
  prisma,
  customerId,
  companyId,
  { startDate, endDate, take = 10 }
) {
  return prisma.order.findMany({
    where: {
      customerId,
      companyId,
      ...(startDate && endDate
        ? {
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }
        : {}),
    },
    orderBy: {
      createdAt: 'desc',
    },
    take,
    include: {
      orderItems: {
        include: {
          menuItem: { select: { id: true, name: true } },
          taxRate: true,
        },
      },
      payments: true,
      table: true,
    },
  })
}

async function updateCustomer(prisma, id, data, companyId) {
  const existing = await prisma.customer.findFirst({
    where: { id, companyId },
  });

  if (!existing) return null;

  const {
    id: _,
    companyId: __,
    orders,
    createdAt,
    updatedAt,
    ...cleanData
  } = data;

  return prisma.customer.update({
    where: { id },
    data: cleanData,
  });
}

async function deleteCustomer(prisma, id, companyId) {
  const existing = await prisma.customer.findFirst({
    where: { id, companyId },
  });
  if (!existing) return null;

  return prisma.customer.delete({ where: { id } });
}

module.exports = {
  getCustomerById,
  getCustomerOrders,
  createCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
};
