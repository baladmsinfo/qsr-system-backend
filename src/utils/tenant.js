const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function generateShortTenant(name, maxLength = 8) {
  // Take first letter of each word
  let base = name
    .trim()
    .split(/\s+/)
    .map(word => word[0])
    .join("")
    .toLowerCase();

  // Truncate if longer than maxLength
  if (base.length > maxLength) {
    base = base.slice(0, maxLength);
  }

  let uniqueTenant = base;
  let counter = 1;

  // Ensure uniqueness in DB
  while (await prisma.company.findUnique({ where: { tenant: uniqueTenant } })) {
    uniqueTenant = `${base}${counter++}`; // append number if already exists
  }

  return uniqueTenant;
}

async function getShortName(name) {
  if (!name) return "";
  return name.trim().split(" ")[0].toLowerCase();
}


module.exports = { generateShortTenant, getShortName }
