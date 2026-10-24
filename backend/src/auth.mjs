import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const sha256 = value => createHash('sha256').update(value).digest('hex')
const expiryMs = 7 * 24 * 60 * 60 * 1000

export function bearerToken(req) {
  const h = req.headers.authorization
  if (typeof h !== 'string' || !/^Bearer [A-Za-z0-9_-]{40,100}$/.test(h)) return null
  return h.slice(7)
}

export async function authenticate(pool, req) {
  const token = bearerToken(req)
  if (!token) return null
  const { rows } = await pool.query(`SELECT external_subject FROM auth_sessions
    WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`, [sha256(token)])
  return rows[0]?.external_subject || null
}

export async function createSession(pool, subject) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + expiryMs).toISOString()
  await pool.query('INSERT INTO auth_sessions(token_hash, external_subject, expires_at) VALUES ($1,$2,$3)', [sha256(token), subject, expiresAt])
  return { token, expiresAt }
}

export async function revokeSession(pool, req) {
  const token = bearerToken(req)
  if (!token) return
  await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1', [sha256(token)])
}

export async function exchangeWechatCode(code) {
  const appId = process.env.WX_APPID
  const secret = process.env.WX_APPSECRET
  if (!appId || !secret) throw new Error('wechat_not_configured')
  if (!/^[a-zA-Z0-9_-]{1,256}$/.test(code)) throw new Error('invalid_code')
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.searchParams.set('appid', appId)
  url.searchParams.set('secret', secret)
  url.searchParams.set('js_code', code)
  url.searchParams.set('grant_type', 'authorization_code')
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!response.ok) throw new Error('wechat_unavailable')
  const body = await response.json()
  if (typeof body.openid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.openid)) throw new Error('wechat_auth_failed')
  // Never send session_key to clients or log it.
  return `wx:${appId}:${body.openid}`
}

export async function merchantStores(pool, subject) {
  const { rows } = await pool.query(`SELECT s.id, s.slug, s.name, mm.role
    FROM merchant_members mm JOIN stores s ON s.merchant_id = mm.merchant_id
    WHERE mm.external_subject = $1 ORDER BY s.name, s.id`, [subject])
  return rows
}

export async function permittedStore(pool, subject, slug) {
  const { rows } = await pool.query(`SELECT s.id, s.slug, s.name, mm.role
    FROM merchant_members mm JOIN stores s ON s.merchant_id = mm.merchant_id
    WHERE mm.external_subject = $1 AND s.slug = $2 LIMIT 1`, [subject, slug])
  return rows[0] || null
}
