import http from 'node:http'
import { Pool } from 'pg'
import { catalogRoute } from './catalog.mjs'
import { checkoutRoute } from './checkout.mjs'
import { orderWorkflowRoute } from './orderWorkflow.mjs'
import { billingRoute } from './billing.mjs'
import { merchantDeliveryRoute } from './deliveryRules.mjs'
import { authenticate, createSession, revokeSession, exchangeWechatCode, merchantStores, permittedStore } from './auth.mjs'

// Public read-only API. Do not add merchant writes or customer checkout before
// implementing verified WeChat identity, tenant authorization and rate limits.
const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '127.0.0.1'
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
const pool = new Pool({
  connectionString,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  max: 10,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000
})

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(body))
}
const server = http.createServer(async (req, res) => {
  let url
  try { url = new URL(req.url || '/', 'http://localhost') }
  catch { return reply(res, 400, { error: 'invalid_url' }) }
  try {
    if (await catalogRoute(req,res,url,pool)) return
    if (await checkoutRoute(req,res,url,pool)) return
    if (await orderWorkflowRoute(req,res,url,pool)) return
    if (await billingRoute(req,res,url,pool)) return
    if (await merchantDeliveryRoute(req,res,url,pool)) return
    if (url.pathname === '/v1/auth/wechat' && req.method === 'POST') {
      const length = Number(req.headers['content-length'] || 0)
      if (!Number.isFinite(length) || length > 2048) return reply(res, 413, { error: 'too_large' })
      let raw = ''
      for await (const chunk of req) {
        raw += chunk.toString('utf8')
        if (Buffer.byteLength(raw) > 2048) return reply(res, 413, { error: 'too_large' })
      }
      let payload
      try { payload = JSON.parse(raw) } catch { return reply(res, 400, { error: 'invalid_json' }) }
      if (!payload || typeof payload.code !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(payload.code)) return reply(res, 400, { error: 'invalid_code' })
      let subject
      try { subject = await exchangeWechatCode(payload.code) }
      catch (err) {
        if (err.message === 'invalid_code') return reply(res, 400, { error: 'invalid_code' })
        if (err.message === 'wechat_not_configured') return reply(res, 503, { error: 'auth_not_configured' })
        return reply(res, 401, { error: 'wechat_auth_failed' })
      }
      return reply(res, 200, await createSession(pool, subject))
    }
    if (url.pathname === '/v1/auth/me' && req.method === 'GET') {
      const subject = await authenticate(pool, req)
      if (!subject) return reply(res, 401, { error: 'unauthorized' })
      const stores = await merchantStores(pool, subject)
      return reply(res, 200, { stores })
    }
    if (url.pathname === '/v1/auth/logout' && req.method === 'POST') {
      if (!await authenticate(pool, req)) return reply(res, 401, { error: 'unauthorized' })
      await revokeSession(pool, req)
      return reply(res, 200, { ok: true })
    }
    if (req.method !== 'GET') return reply(res, 405, { error: 'method_not_allowed' })
    if (url.pathname === '/health') {
      await pool.query('SELECT 1')
      return reply(res, 200, { status: 'ok' })
    }
    const match = /^\/v1\/stores\/([a-z0-9][a-z0-9-]{1,62})\/products$/.exec(url.pathname)
    if (match) {
      const { rows } = await pool.query(`
        SELECT p.id, p.name, p.price_cents AS "priceCents", p.sold_out AS "soldOut",
               p.category_id AS "categoryId", p.image_object_key AS "imageObjectKey", p.description, p.discount_price_cents AS "discountPriceCents", p.discount_start AS "discountStart", p.discount_end AS "discountEnd", CASE WHEN p.discount_price_cents IS NOT NULL AND (p.discount_start IS NULL OR p.discount_start <= now()) AND (p.discount_end IS NULL OR p.discount_end > now()) THEN p.discount_price_cents ELSE p.price_cents END AS "effectivePriceCents"
        FROM products p JOIN stores s ON s.id = p.store_id
        WHERE s.slug = $1 AND s.is_active = true AND p.active = true
        ORDER BY p.created_at DESC, p.id DESC LIMIT 200
      `, [match[1]])
      const imageBase = (process.env.IMAGE_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
      return reply(res, 200, { products: rows.map(p => ({ ...p,
        imageUrl: p.imageObjectKey && /^https:\/\/[^/]+/.test(imageBase)
          ? `${imageBase}/${p.imageObjectKey.split('/').map(encodeURIComponent).join('/')}` : null
      })) })
    }
    return reply(res, 404, { error: 'not_found' })
  } catch (err) {
    console.error('API request failed', err?.code || err?.name || 'unknown')
    return reply(res, 503, { error: 'service_unavailable' })
  }
})
server.listen(port, host, () => console.log(`Stall API listening on ${host}:${port}`))
async function shutdown() { server.close(); await pool.end() }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
