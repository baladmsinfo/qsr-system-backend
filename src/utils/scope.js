/**
 * Resolves which branch a request should operate on.
 * SUPERADMIN/ACCOUNTANT users have no fixed branchId and must specify one
 * (query/body) to act on a particular branch; branch-scoped staff
 * (BRANCHADMIN/KITCHEN/CASHIER/WAITER) are always pinned to their own branch.
 */
function resolveBranchId(request, override) {
  const requested = override ?? request.query?.branchId ?? request.body?.branchId ?? null

  if (request.user?.role === 'SUPERADMIN') {
    return requested || null
  }

  return request.branchId || requested || null
}

module.exports = { resolveBranchId }
