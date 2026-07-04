const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const currencyData = require('./currencyList.json')


async function ensureCurrency() {
  console.log("Seeding currencies with upsert...");

  if (!currencyData || typeof currencyData !== "object") {
    throw new Error("currencyData is missing or invalid");
  }

  const entries = Object.values(currencyData); // Works because your JSON is an object, not an array.

  for (const c of entries) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        symbol: c.symbol,
        country: c.name, // you can change to c.country if available
        decimalDigits: c.decimal_digits ?? null,
        rounding: c.rounding ?? null,
        isDefault: c.code === "INR", // INR is default
      },
      create: {
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        country: c.name,
        decimalDigits: c.decimal_digits ?? null,
        rounding: c.rounding ?? null,
        isDefault: c.code === "INR",
      }
    });
  }

  // Ensure ONLY INR is default
  await prisma.currency.updateMany({
    where: { code: { not: "INR" } },
    data: { isDefault: false }
  });

  console.log("Currency UPSERT completed successfully.");
}


ensureCurrency()
  .then(async () => await prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });