'use strict'
const crypto = require('crypto')
const https = require('https')
const http = require('http')

// Server-side BucksBox gateway client for POS UPI QR. The clientId + key are
// read from PaymentGatewayConfig (provider BUCKSBOX) and never leave this
// backend - the POS only ever sees the QR image and the verified outcome.
//
// Wire contract (same as @bucksbox/websdk's GatewayClient):
//   - body: AES-256-GCM over JSON, AAD "<clientId>.<timestamp>", sent as
//     { payload } with X-IV / X-Tag headers
//   - X-Checksum: HMAC-SHA256(key) over "<timestamp>.<clientId>.<raw body>"
//   - responses are encrypted the same way when X-IV / X-Tag come back

const GATEWAY_URLS = {
  production: 'https://api.bucksbox.in/gateway',
  staging: 'https://uatgateway.bucksbox.in',
}
const TIMEOUT_MS = 20000

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode })
}

function isValidKey(key) {
  return /^[0-9a-fA-F]{64}$/.test(key) || /^[A-Za-z0-9+/]{43}=$/.test(key)
}

function keyBytes(key) {
  return /^[0-9a-fA-F]{64}$/.test(key) ? Buffer.from(key, 'hex') : Buffer.from(key, 'base64')
}

function encrypt(data, key, aad) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(key), iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const payload = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
  return { payload: payload.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
}

function decrypt(payload, iv, tag, key, aad) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(key), Buffer.from(iv, 'base64'))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const plain = Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()])
  return JSON.parse(plain.toString('utf8'))
}

// node http(s) rather than fetch: the gateway wants the encrypted body on GET
// calls too, which fetch refuses to send.
function send(method, url, headers, body) {
  const parsed = new URL(url)
  const lib = parsed.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => { raw += chunk })
        res.on('end', () => {
          let data
          try { data = JSON.parse(raw) } catch { data = raw }
          resolve({ status: res.statusCode, data, headers: res.headers })
        })
      }
    )
    req.on('error', (err) => reject(Object.assign(err, { code: 'NETWORK' })))
    req.on('timeout', () => req.destroy(Object.assign(new Error('BucksBox did not respond in time'), { code: 'NETWORK' })))
    req.end(body)
  })
}

/**
 * One encrypted call to {gateway}/process/<path>. Resolves the decrypted
 * response (a business failure is still a resolved { statusCode !== '00' });
 * rejects with err.code 'NETWORK' or 'HTTP_<status>'.
 */
async function callGateway({ environment, clientId, key }, method, path, body = {}) {
  const base = GATEWAY_URLS[environment]
  if (!base) throw httpError(`Unknown BucksBox environment "${environment}"`, 400)

  const timestamp = Math.floor(Date.now() / 1000)
  const { payload, iv, tag } = encrypt(body, key, `${clientId}.${timestamp}`)
  const rawBody = JSON.stringify({ payload })
  const checksum = crypto.createHmac('sha256', key).update(`${timestamp}.${clientId}.${rawBody}`).digest('hex')

  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Id': clientId,
    'X-Timestamp': String(timestamp),
    'X-IV': iv,
    'X-Tag': tag,
    'X-Checksum': checksum,
    'X-Request-Id': crypto.randomUUID(),
  }
  if (method === 'GET') headers['X-Body'] = rawBody

  const res = await send(method, `${base}/process/${path}`, headers, rawBody)
  if (res.status >= 400) {
    throw Object.assign(new Error(res.data?.message || `BucksBox request failed (${res.status})`), {
      code: `HTTP_${res.status}`,
      response: res.data,
    })
  }

  const respIv = res.headers['x-iv']
  const respTag = res.headers['x-tag']
  if (!respIv || !respTag || !res.data?.payload) return res.data
  return decrypt(res.data.payload, respIv, respTag, key, `${clientId}.${res.headers['x-timestamp']}`)
}

// PaymentGatewayConfig row -> gateway credentials (mode test = staging).
function credentialsFrom(config) {
  return { environment: config.mode === 'live' ? 'production' : 'staging', clientId: config.keyId, key: config.keySecret }
}

/**
 * Cheap signed call used to validate a clientId/key pair before saving it.
 * Any decrypted response means the gateway accepted the signature.
 */
async function testCredentials(creds) {
  try {
    await callGateway(creds, 'GET', 'merchant/payment/transactions/status-summary')
    return { ok: true, message: `Connected to BucksBox ${creds.environment}` }
  } catch (err) {
    if (err.code === 'NETWORK') return { ok: false, message: 'Could not reach BucksBox - check the server\'s internet connection' }
    if (err.code === 'HTTP_401') return { ok: false, message: 'Client ID and Key do not match, or they belong to the other environment' }
    return { ok: false, message: err.message || 'Connection test failed' }
  }
}

/**
 * Dynamic QR (with amount) or static QR (without). Resolves
 * { qrImage, qrString, transId } - qrImage is a ready PNG data URL.
 */
async function generateQr(creds, { amount, orderId } = {}) {
  let res
  try {
    res = await callGateway(creds, 'POST', 'upi/txn/v1/GenerateQR', {
      amount: amount ? Number(amount.toFixed(2)) : undefined,
      order_id: orderId,
    })
  } catch (err) {
    throw httpError(err.code === 'NETWORK' ? 'Could not reach BucksBox' : `BucksBox: ${err.message}`, 502)
  }
  if (res?.statusCode !== '00' || !res.data?.qr_image) {
    throw httpError(`BucksBox could not generate the QR: ${res?.message || 'unknown error'}`, 502)
  }
  return { qrImage: res.data.qr_image, qrString: res.data.qrString || null, transId: res.data.txn_ref_no || null }
}

/**
 * UPI status for a dynamic QR's trans_id, classified as
 * { state: 'paid' | 'pending' | 'failed', rrn, amount, payerVpa, message, raw }.
 * Only an explicit trans_status SUCCESS counts as paid - a '00' without
 * transaction data stays pending rather than trusting it.
 */
async function upiStatus(creds, transId) {
  let res
  try {
    res = await callGateway(creds, 'POST', 'upi/txn/v1/UpiStatus', { trans_id: transId })
  } catch (err) {
    // Transient - the POS keeps polling.
    return { state: 'pending', message: err.code === 'NETWORK' ? 'Could not reach BucksBox' : err.message }
  }
  const data = res?.data || {}
  const txnStatus = String(data.status || '').toUpperCase()
  const base = { rrn: data.rrn || null, amount: data.amount != null ? Number(data.amount) : null, payerVpa: data.payer_vpa || null, message: res?.message, raw: res }

  if (res?.statusCode === '00' && txnStatus === 'SUCCESS') return { state: 'paid', ...base }
  if (res?.statusCode === '03' || ['FAILED', 'FAILURE', 'REJECTED', 'EXPIRED'].includes(txnStatus)) return { state: 'failed', ...base }
  return { state: 'pending', ...base }
}

module.exports = { GATEWAY_URLS, isValidKey, credentialsFrom, testCredentials, generateQr, upiStatus }
