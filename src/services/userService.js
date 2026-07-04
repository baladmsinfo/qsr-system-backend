async function findByEmail(prisma, email) {
  return prisma.user.findUnique({
    where: { email },
  })
}

module.exports = { findByEmail }
