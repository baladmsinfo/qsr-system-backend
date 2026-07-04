// module.exports = function checkRole(required) {
//   return async (req, reply) => {
//     if (req.role !== required) {
//       return reply.code(403).send({ error: "Forbidden: insufficient role" });
//     }
//   };
// };


const checkRole = (...allowedRoles) => {
  return async (req, reply) => {
    const userRole = req.user?.role

    console.log(userRole)

    if (!userRole || !allowedRoles.includes(userRole)) {
      return reply.code(403).send({
        statusCode: "01",
        message: "Access denied"
      })
    }
  }
}

module.exports = checkRole