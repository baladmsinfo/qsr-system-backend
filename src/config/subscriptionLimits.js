'use strict'

/**
 * Which QSR resources a subscription limits, and by how much.
 *
 * The central Payment Subscription product's plan `features` are display
 * text only ({ text, enabled } - its zod schema strips anything else), so
 * plans cannot carry machine-readable limits. Limits therefore live here:
 *
 * - TRIAL limits apply to a company with no ACTIVE paid subscription (the
 *   same model Fee Collection uses: free trial capped by count, paid =
 *   unlimited). These numbers are a business decision - override them with
 *   SUBSCRIPTION_TRIAL_LIMITS without a code change.
 * - Paid plans are unlimited unless SUBSCRIPTION_PLAN_LIMITS maps that
 *   central plan id to specific limits.
 *
 * Both env vars are JSON objects keyed by resource, e.g.
 *   SUBSCRIPTION_TRIAL_LIMITS={"ORDERS":100,"MENU_ITEMS":40}
 *   SUBSCRIPTION_PLAN_LIMITS={"<central-plan-id>":{"BRANCHES":3}}
 * A value of null means unlimited.
 *
 * All limits are company-wide and lifetime counts of existing records
 * (nothing is ever deleted or blocked from viewing when a limit is hit -
 * only creating more is refused).
 */
const RESOURCES = {
  BRANCHES: { label: 'branches', singular: 'branch' },
  STAFF_USERS: { label: 'staff accounts', singular: 'staff account' },
  MENU_ITEMS: { label: 'menu items', singular: 'menu item' },
  TABLES: { label: 'tables', singular: 'table' },
  ORDERS: { label: 'orders', singular: 'order' },
}

const DEFAULT_TRIAL_LIMITS = {
  BRANCHES: 1,
  STAFF_USERS: 5,
  MENU_ITEMS: 30,
  TABLES: 10,
  ORDERS: 50,
}

function parseJsonEnv(name) {
  const raw = process.env[name]
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // Don't crash the server over a typo - fall back to defaults and say so.
    console.warn(`[subscription] ${name} is not valid JSON - ignoring it`)
    return {}
  }
}

function sanitize(limits) {
  const out = {}
  for (const key of Object.keys(RESOURCES)) {
    if (!(key in limits)) continue
    const v = limits[key]
    out[key] = v === null ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : undefined
    if (out[key] === undefined) delete out[key]
  }
  return out
}

function trialLimits() {
  return { ...DEFAULT_TRIAL_LIMITS, ...sanitize(parseJsonEnv('SUBSCRIPTION_TRIAL_LIMITS')) }
}

/** Limits for a paid plan - unlimited for every resource unless configured. */
function planLimits(planId) {
  const unlimited = Object.fromEntries(Object.keys(RESOURCES).map((k) => [k, null]))
  const configured = parseJsonEnv('SUBSCRIPTION_PLAN_LIMITS')[planId]
  return { ...unlimited, ...(configured ? sanitize(configured) : {}) }
}

module.exports = { RESOURCES, DEFAULT_TRIAL_LIMITS, trialLimits, planLimits }
