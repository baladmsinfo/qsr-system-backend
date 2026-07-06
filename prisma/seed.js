/**
 * Restaurant platform seed.
 *
 * Seeds one company (Aghraharam Filter Coffee) with one branch (West Nada),
 * its real menu (from the restaurant's own price list), dining tables + QR
 * codes, staff users for every role, chart of accounts, tax rates, a vendor,
 * a couple of walk-in customers, and a few sample orders so the new APIs
 * have real data to exercise end to end.
 *
 * Usage:
 *   node prisma/seed.js
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require("bcrypt");
const { generateApiKey } = require("../src/utils/keyGenerator");
const { generateShortTenant, getShortName } = require("../src/utils/tenant");
const currencyData = require("./currencyList.json");

async function ensureCurrency() {
  console.log("Seeding currencies...");
  const entries = Object.values(currencyData);

  for (const c of entries) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        symbol: c.symbol,
        country: c.name,
        decimalDigits: c.decimal_digits ?? null,
        rounding: c.rounding ?? null,
        isDefault: c.code === "INR",
      },
      create: {
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        country: c.name,
        decimalDigits: c.decimal_digits ?? null,
        rounding: c.rounding ?? null,
        isDefault: c.code === "INR",
      },
    });
  }

  await prisma.currency.updateMany({
    where: { code: { not: "INR" } },
    data: { isDefault: false },
  });
}

async function ensureCompany() {
  const name = "Aghraharam Filter Coffee";

  let company = await prisma.company.findFirst({ where: { name } });

  const data = {
    name,
    companyType: "Restaurant",
    gstNumber: "32AAAAA0000A1Z5",
    primaryEmail: "info@aghraharam.in",
    primaryPhoneNo: "9876543210",
    addressLine1: "Near Guruvayur Temple, West Nada",
    city: "Guruvayur",
    state: "Kerala",
    pincode: 680101,
    currency: { connect: { code: "INR" } },
    coverImageUrl: "https://images.unsplash.com/photo-1610192244261-3f33de3f72e1?w=1200&q=80",
    description: "Authentic South Indian filter coffee, dosas & tiffin since 1985.",
    cuisineTags: ["South Indian", "Tiffin", "Filter Coffee"],
    isPubliclyListed: true,
  };

  if (!company) {
    company = await prisma.company.create({
      data: {
        ...data,
        shortname: await generateShortTenant(name),
        tenant: await getShortName(name),
        publicapiKey: generateApiKey(),
        privateapiKey: generateApiKey(),
      },
    });
  } else {
    company = await prisma.company.update({ where: { id: company.id }, data });
  }

  return company;
}

async function ensureBranch(company) {
  const name = "West Nada";

  let branch = await prisma.branch.findFirst({ where: { companyId: company.id, name } });

  const data = {
    name,
    companyId: company.id,
    addressLine1: "West Nada, Near Guruvayur Temple",
    city: "Guruvayur",
    state: "Kerala",
    pincode: 680101,
    gstNumber: company.gstNumber,
    phone: "9876543210",
    latitude: 10.5941,
    longitude: 76.0412,
    openingTime: "07:00",
    closingTime: "22:00",
    deliveryRadiusKm: 5,
    isOnline: true,
    acceptOrders: true,
    kitchenEnabled: true,
    posEnabled: true,
  };

  if (!branch) {
    branch = await prisma.branch.create({ data });
  } else {
    branch = await prisma.branch.update({ where: { id: branch.id }, data });
  }

  return branch;
}

// A second, lightweight restaurant brand purely so the CUSTOMER app's new
// marketplace home page (nearby-restaurants discovery) has more than one
// company to sort/browse - no staff/accounting scaffolding needed since
// this brand is never used for admin/POS testing.
async function ensureSecondCompany() {
  const name = "Bucksbox Wok & Roll";
  let company = await prisma.company.findFirst({ where: { name } });

  const data = {
    name,
    companyType: "Cloud Kitchen",
    primaryEmail: "hello@wokandroll.in",
    primaryPhoneNo: "9812345670",
    addressLine1: "Chowara Road",
    city: "Guruvayur",
    state: "Kerala",
    pincode: 680102,
    currency: { connect: { code: "INR" } },
    coverImageUrl: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=1200&q=80",
    description: "Indo-Chinese wok favorites, fried rice & rolls, made fresh to order.",
    cuisineTags: ["Chinese", "Indo-Chinese", "Fast Food"],
    isPubliclyListed: true,
  };

  if (!company) {
    company = await prisma.company.create({
      data: { ...data, shortname: await generateShortTenant(name), tenant: await getShortName(name), publicapiKey: generateApiKey(), privateapiKey: generateApiKey() },
    });
  } else {
    company = await prisma.company.update({ where: { id: company.id }, data });
  }

  let branch = await prisma.branch.findFirst({ where: { companyId: company.id, name: "Chowara" } });
  const branchData = {
    name: "Chowara",
    companyId: company.id,
    addressLine1: "Chowara Road, Guruvayur",
    city: "Guruvayur",
    state: "Kerala",
    pincode: 680102,
    phone: "9812345670",
    latitude: 10.6021,
    longitude: 76.035,
    openingTime: "11:00",
    closingTime: "23:00",
    deliveryRadiusKm: 6,
    isOnline: true,
    acceptOrders: true,
    kitchenEnabled: false,
    posEnabled: false,
  };
  branch = branch ? await prisma.branch.update({ where: { id: branch.id }, data: branchData }) : await prisma.branch.create({ data: branchData });

  const menu = [
    { name: "Veg Fried Rice", price: 140 },
    { name: "Chilli Paneer", price: 180, recommended: true },
    { name: "Chicken Manchurian", price: 200, popular: true },
    { name: "Spring Rolls", price: 120 },
  ];

  let category = await prisma.menuCategory.findFirst({ where: { companyId: company.id, name: "Wok Favorites" } });
  if (!category) {
    category = await prisma.menuCategory.create({ data: { companyId: company.id, name: "Wok Favorites", description: "Indo-Chinese classics", displayOrder: 0 } });
  }

  for (let i = 0; i < menu.length; i++) {
    const it = menu[i];
    const data = {
      companyId: company.id,
      branchId: branch.id,
      categoryId: category.id,
      name: it.name,
      isVeg: !/chicken/i.test(it.name),
      availability: "AVAILABLE",
      price: it.price,
      prepTimeMinutes: 15,
      kitchenStation: "MAIN",
      displayOrder: i,
      isRecommended: !!it.recommended,
      isPopular: !!it.popular,
    };
    const existing = await prisma.menuItem.findFirst({ where: { companyId: company.id, branchId: branch.id, name: it.name } });
    if (!existing) await prisma.menuItem.create({ data });
    else await prisma.menuItem.update({ where: { id: existing.id }, data });
  }

  return { company, branch };
}

async function ensureAccounts(company) {
  const items = [
    { name: "Cash", type: "ASSET", code: "1000" },
    { name: "Bank", type: "ASSET", code: "1010" },
    { name: "Accounts Receivable", type: "ASSET", code: "1100" },
    { name: "Tax Receivable", type: "ASSET", code: "1300" },
    { name: "Accounts Payable", type: "LIABILITY", code: "2000" },
    { name: "Tax Payable", type: "LIABILITY", code: "2100" },
    { name: "Owner Equity", type: "EQUITY", code: "3000" },
    { name: "Sales Revenue", type: "INCOME", code: "4000" },
    { name: "Purchases", type: "EXPENSE", code: "5000" },
    { name: "Rent Expense", type: "EXPENSE", code: "5100" },
    { name: "Salaries Expense", type: "EXPENSE", code: "5200" },
    { name: "Utilities Expense", type: "EXPENSE", code: "5300" },
  ];

  const accounts = {};
  for (const a of items) {
    const code = `${company.id.slice(0, 8)}-${a.type}-${a.name.replace(/\s+/g, "")}`;
    let account = await prisma.account.findFirst({ where: { code, companyId: company.id } });
    if (!account) {
      account = await prisma.account.create({ data: { name: a.name, type: a.type, code, companyId: company.id } });
    } else {
      account = await prisma.account.update({ where: { id: account.id }, data: { name: a.name, type: a.type } });
    }
    accounts[a.name] = account;
  }
  return accounts;
}

async function ensureTaxRates(company) {
  const base = [
    { name: "GST 5%", rate: 5, type: "GST" },
    { name: "GST 12%", rate: 12, type: "GST" },
  ];
  const rates = {};
  for (const t of base) {
    let tr = await prisma.taxRate.findFirst({ where: { name: t.name, companyId: company.id } });
    if (!tr) {
      tr = await prisma.taxRate.create({ data: { ...t, companyId: company.id } });
    } else {
      tr = await prisma.taxRate.update({ where: { id: tr.id }, data: { rate: t.rate, type: t.type } });
    }
    rates[t.name] = tr;
  }
  return rates;
}

async function ensureUsers(company, branch) {
  const passwordHash = await bcrypt.hash("bucksbox", 8);
  const domain = "aghraharam.local";

  const staff = [
    { role: "SUPERADMIN", name: "Aghraharam Super Admin", email: `superadmin@${domain}`, branchId: null },
    { role: "BRANCHADMIN", name: "West Nada Branch Admin", email: `branchadmin@${domain}`, branchId: branch.id },
    { role: "KITCHEN", name: "West Nada Kitchen Staff", email: `kitchen@${domain}`, branchId: branch.id },
    { role: "CASHIER", name: "West Nada Cashier", email: `cashier@${domain}`, branchId: branch.id },
    { role: "WAITER", name: "West Nada Waiter", email: `waiter@${domain}`, branchId: branch.id },
    { role: "ACCOUNTANT", name: "Aghraharam Accountant", email: `accountant@${domain}`, branchId: null },
  ];

  const users = {};
  for (const s of staff) {
    const data = {
      email: s.email,
      password: passwordHash,
      name: s.name,
      role: s.role,
      status: true,
      email_verifited: true,
      companyId: company.id,
      branchId: s.branchId,
    };

    let user = await prisma.user.findUnique({ where: { email: s.email } });
    if (!user) {
      user = await prisma.user.create({ data });
    } else {
      user = await prisma.user.update({ where: { id: user.id }, data });
    }
    users[s.role] = user;
  }
  return users;
}

async function ensureTables(branch) {
  const tableCount = 4;
  const tables = [];
  for (let i = 1; i <= tableCount; i++) {
    const tableNo = `Table ${i}`;
    let table = await prisma.diningTable.findFirst({ where: { branchId: branch.id, tableNo } });
    const data = {
      branchId: branch.id,
      tableNo,
      qrCode: `${branch.id}-table-${i}`,
      capacity: i <= 2 ? 2 : 4,
      active: true,
    };
    if (!table) {
      table = await prisma.diningTable.create({ data });
    } else {
      table = await prisma.diningTable.update({ where: { id: table.id }, data });
    }
    tables.push(table);
  }
  return tables;
}

const MENU = [
  {
    category: "Tiffin",
    description: "Idly, Vada & Pongal",
    station: "MAIN",
    items: [
      { name: "Ghee Podi Idly", price: 75, tags: ["idly"] },
      { name: "Ghee Podi Thattu Idly", price: 80, tags: ["idly"] },
      { name: "Butter Podi Thattu Idly", price: 85, tags: ["idly"] },
      { name: "Ghee Pongal", price: 75, tags: ["pongal"], recommended: true },
      { name: "Plate Idly (3 Nos.)", price: 45, tags: ["idly"] },
      { name: "Vada", price: 15, tags: ["vada"] },
      { name: "Thayir Vada", price: 40, tags: ["vada"] },
    ],
  },
  {
    category: "Dosa Menu",
    description: "Dosa, Uthappam & Chapati",
    station: "MAIN",
    items: [
      { name: "Ghee Roast", price: 90 },
      { name: "Adai Dosa", price: 90 },
      { name: "Ghee Podi Dosa", price: 105 },
      { name: "Butter Roast", price: 105 },
      { name: "Masala Dosa", price: 115, popular: true },
      { name: "Butter Podi Dosa", price: 120 },
      { name: "Pesarattu", price: 120 },
      { name: "Butter Masala Dosa", price: 130 },
      { name: "Polar Bear Dosa", price: 125 },
      { name: "Ghee Podi Masala Dosa", price: 135 },
      { name: "Spicy Onion Dosa (Aghraharam Special)", price: 135, recommended: true, spicyLevel: 2 },
      { name: "Onion Uthappam", price: 135 },
      { name: "Mysore Masala Dosa (Special)", price: 145, recommended: true, spicyLevel: 1 },
      { name: "Butter Podi Masala Dosa", price: 145 },
      { name: "Tomato Butter Podi Uthappam", price: 155 },
      { name: "Butter Mysore Masala Dosa", price: 160 },
      { name: "Butter Masala Podi Uthappam", price: 120 },
      { name: "Chapati Set (2 Nos.)", price: 80 },
      { name: "Single Chapati", price: 30 },
    ],
  },
  {
    category: "Drinks",
    description: "Filter Coffee & Beverages",
    station: "BEVERAGE",
    items: [
      { name: "Filter Coffee", price: 25, popular: true },
      { name: "Filter Coffee with Palm Sugar", price: 30 },
      { name: "Black Coffee", price: 20 },
      { name: "Panakarkandu Paal", price: 25 },
      { name: "Chukku Paal", price: 25 },
      { name: "Golden Milk", price: 25 },
      { name: "Milk", price: 25 },
      { name: "Milk with Palm Sugar", price: 30 },
      { name: "Hot Chocolate", price: 60 },
      { name: "Badam Milk (Hot)", price: 60 },
      { name: "Hazelnut Hot Chocolate", price: 80 },
    ],
  },
];

async function ensureMenu(company, branch, taxRates) {
  const gst5 = taxRates["GST 5%"];
  const allItems = [];

  for (let ci = 0; ci < MENU.length; ci++) {
    const cat = MENU[ci];

    let category = await prisma.menuCategory.findFirst({ where: { companyId: company.id, name: cat.category } });
    if (!category) {
      category = await prisma.menuCategory.create({
        data: {
          companyId: company.id,
          name: cat.category,
          description: cat.description,
          displayOrder: ci,
        },
      });
    } else {
      category = await prisma.menuCategory.update({
        where: { id: category.id },
        data: { description: cat.description, displayOrder: ci },
      });
    }

    for (let ii = 0; ii < cat.items.length; ii++) {
      const it = cat.items[ii];

      const data = {
        companyId: company.id,
        branchId: branch.id,
        categoryId: category.id,
        name: it.name,
        isVeg: true,
        availability: "AVAILABLE",
        price: it.price,
        prepTimeMinutes: 10,
        kitchenStation: cat.station,
        displayOrder: ii,
        isRecommended: !!it.recommended,
        isPopular: !!it.popular,
        spicyLevel: it.spicyLevel ?? 0,
        tags: it.tags ?? [],
        taxRateId: gst5.id,
      };

      let menuItem = await prisma.menuItem.findFirst({
        where: { companyId: company.id, branchId: branch.id, name: it.name },
      });
      if (!menuItem) {
        menuItem = await prisma.menuItem.create({ data });
      } else {
        menuItem = await prisma.menuItem.update({ where: { id: menuItem.id }, data });
      }
      allItems.push(menuItem);
    }
  }

  return allItems;
}

async function ensureVendorAndCustomers(company) {
  let vendor = await prisma.vendor.findFirst({ where: { companyId: company.id, gstin: "32BBBBB0000B1Z6" } });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        name: "Fresh Farms Produce",
        gstin: "32BBBBB0000B1Z6",
        phone: "9847012345",
        email: "orders@freshfarms.in",
        companyId: company.id,
      },
    });
  }

  const customerSeeds = [
    { name: "Walk-in Guest", phone: null },
    { name: "Ramesh Iyer", phone: "9847098470" },
  ];
  const customers = [];
  for (const c of customerSeeds) {
    let customer = await prisma.customer.findFirst({ where: { companyId: company.id, name: c.name } });
    if (!customer) {
      customer = await prisma.customer.create({ data: { ...c, companyId: company.id } });
    }
    customers.push(customer);
  }

  return { vendor, customers };
}

async function seedExpenses(company, branch, accounts, taxRates) {
  const expenses = [
    { category: "Rent Expense", amount: 25000, note: "Monthly rent - West Nada" },
    { category: "Utilities Expense", amount: 4200, note: "Electricity bill" },
    { category: "Salaries Expense", amount: 60000, note: "Staff salaries" },
  ];

  for (const e of expenses) {
    const account = accounts[e.category];
    const exists = await prisma.expense.findFirst({
      where: { companyId: company.id, note: e.note },
    });
    if (exists) continue;

    const taxRate = taxRates["GST 5%"];
    const taxAmount = Number(((e.amount * taxRate.rate) / 100).toFixed(2));
    const totalAmount = Number((e.amount + taxAmount).toFixed(2));

    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          companyId: company.id,
          branchId: branch.id,
          accountId: account.id,
          date: new Date(),
          amount: e.amount,
          taxRateId: taxRate.id,
          taxAmount,
          totalAmount,
          note: e.note,
        },
      });

      await tx.journalEntry.create({
        data: {
          companyId: company.id,
          date: expense.date,
          description: e.note,
          debit: e.amount,
          credit: 0,
          accountId: account.id,
        },
      });

      if (taxAmount > 0) {
        await tx.journalEntry.create({
          data: {
            companyId: company.id,
            date: expense.date,
            description: e.note,
            debit: taxAmount,
            credit: 0,
            accountId: accounts["Tax Payable"].id,
          },
        });
      }

      await tx.journalEntry.create({
        data: {
          companyId: company.id,
          date: expense.date,
          description: e.note,
          debit: 0,
          credit: totalAmount,
          accountId: accounts["Cash"].id,
        },
      });
    });
  }
}

async function seedSampleOrders(company, branch, tables, menuItems, customers, users) {
  const findItem = (name) => menuItems.find((m) => m.name === name);

  const orderSeeds = [
    {
      table: tables[0],
      customer: customers[0],
      status: "COMPLETED",
      lines: [
        { item: findItem("Masala Dosa"), qty: 2 },
        { item: findItem("Filter Coffee"), qty: 2 },
      ],
      pay: true,
    },
    {
      table: tables[1],
      customer: customers[1],
      status: "PREPARING",
      lines: [
        { item: findItem("Ghee Podi Idly"), qty: 1 },
        { item: findItem("Ghee Pongal"), qty: 1 },
        { item: findItem("Filter Coffee with Palm Sugar"), qty: 1 },
      ],
      pay: false,
    },
    {
      table: tables[2],
      customer: customers[0],
      status: "PLACED",
      lines: [{ item: findItem("Onion Uthappam"), qty: 1 }],
      pay: false,
    },
  ];

  for (const seed of orderSeeds) {
    const exists = await prisma.order.findFirst({
      where: { branchId: branch.id, tableId: seed.table.id, status: seed.status },
    });
    if (exists) continue;

    const subtotal = seed.lines.reduce((sum, l) => sum + l.item.price * l.qty, 0);
    const taxAmount = Number((subtotal * 0.05).toFixed(2));
    const totalAmount = Number((subtotal + taxAmount).toFixed(2));

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          companyId: company.id,
          branchId: branch.id,
          tableId: seed.table.id,
          customerId: seed.customer.id,
          waiterId: users.WAITER.id,
          cashierId: seed.pay ? users.CASHIER.id : null,
          status: seed.status,
          source: "QR",
          subtotal,
          taxAmount,
          totalAmount,
        },
      });

      const orderItems = [];
      for (const l of seed.lines) {
        const oi = await tx.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: l.item.id,
            price: l.item.price,
            quantity: l.qty,
            total: l.item.price * l.qty,
            status: seed.status === "COMPLETED" ? "SERVED" : "PENDING",
          },
        });
        orderItems.push(oi);
      }

      const ticket = await tx.kitchenTicket.create({
        data: {
          orderId: order.id,
          token: `T-${Math.floor(Math.random() * 900 + 100)}`,
          station: "MAIN",
          status: seed.status === "COMPLETED" ? "COMPLETED" : seed.status === "PREPARING" ? "PREPARING" : "PENDING",
        },
      });

      await tx.orderItem.updateMany({
        where: { id: { in: orderItems.map((o) => o.id) } },
        data: { kitchenTicketId: ticket.id },
      });

      if (seed.pay) {
        await tx.payment.create({
          data: {
            companyId: company.id,
            orderId: order.id,
            amount: totalAmount,
            method: "CASH",
          },
        });

        await tx.journalEntry.create({
          data: {
            companyId: company.id,
            date: new Date(),
            description: `Order ${order.id.slice(0, 8)} payment`,
            debit: totalAmount,
            credit: 0,
            accountId: (await tx.account.findFirst({ where: { companyId: company.id, name: "Cash" } })).id,
          },
        });

        await tx.journalEntry.create({
          data: {
            companyId: company.id,
            date: new Date(),
            description: `Order ${order.id.slice(0, 8)} revenue`,
            debit: 0,
            credit: subtotal,
            accountId: (await tx.account.findFirst({ where: { companyId: company.id, name: "Sales Revenue" } })).id,
          },
        });

        await tx.journalEntry.create({
          data: {
            companyId: company.id,
            date: new Date(),
            description: `Order ${order.id.slice(0, 8)} tax`,
            debit: 0,
            credit: taxAmount,
            accountId: (await tx.account.findFirst({ where: { companyId: company.id, name: "Tax Payable" } })).id,
          },
        });
      }
    });
  }
}

async function main() {
  console.log("Seeding restaurant platform data...");

  await ensureCurrency();

  const company = await ensureCompany();
  const branch = await ensureBranch(company);
  await ensureSecondCompany();
  const accounts = await ensureAccounts(company);
  const taxRates = await ensureTaxRates(company);
  const users = await ensureUsers(company, branch);
  const tables = await ensureTables(branch);
  const menuItems = await ensureMenu(company, branch, taxRates);
  const { vendor, customers } = await ensureVendorAndCustomers(company);

  await seedExpenses(company, branch, accounts, taxRates);
  await seedSampleOrders(company, branch, tables, menuItems, customers, users);

  console.log(`Seeded company "${company.name}" / branch "${branch.name}" with ${menuItems.length} menu items, ${tables.length} tables.`);
}

main()
  .catch((e) => {
    console.error("SEED ERROR:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
