import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { bearerToken, authenticate, createSession, revokeSession, merchantStores, permittedStore } from '../src/auth.mjs'

const TOKEN = 'A'.repeat(43)
const request = (token = TOKEN) => ({ headers: { authorization: `Bearer ${token}` } })

function fakePool(handler) {
  const statements = []
  return {
    statements,
    async query(sql, params = []) {
      statements.push({ sql, params })
      return handler(sql, params)
    }
  }
}

test('rejects missing, malformed and short bearer tokens before database access', async () => {
  assert.equal(bearerToken({ headers: {} }), null)
  assert.equal(bearerToken({ headers: { authorization: `Basic ${TOKEN}` } }), null)
  assert.equal(bearerToken(request('short')), null)
  const pool = fakePool(() => { throw Error('query must not occur') })
  assert.equal(await authenticate(pool, { headers: {} }), null)
  assert.equal(pool.statements.length, 0)
})

test('authenticates a valid active session using a token hash rather than the plaintext token', async () => {
  const pool = fakePool(() => ({ rows: [{ external_subject: 'wx:app:customer1' }] }))
  assert.equal(await authenticate(pool, request()), 'wx:app:customer1')
  assert.equal(pool.statements.length, 1)
  assert.match(pool.statements[0].sql, /revoked_at IS NULL/)
  assert.match(pool.statements[0].sql, /expires_at > now\(\)/)
  assert.equal(pool.statements[0].params[0], createHash('sha256').update(TOKEN).digest('hex'))
  assert.notEqual(pool.statements[0].params[0], TOKEN)
})

test('expired and revoked sessions are rejected when no active row exists', async () => {
  const pool = fakePool(() => ({ rows: [] }))
  assert.equal(await authenticate(pool, request()), null)
})

test('new session stores a hash and a future expiry, but returns a usable token', async () => {
  const before = Date.now()
  const pool = fakePool(() => ({ rows: [] }))
  const result = await createSession(pool, 'wx:app:customer1')
  assert.match(result.token, /^[A-Za-z0-9_-]{40,100}$/)
  assert.ok(Date.parse(result.expiresAt) > before)
  assert.match(pool.statements[0].sql, /INSERT INTO auth_sessions/)
  const [hash, subject, expiresAt] = pool.statements[0].params
  assert.equal(hash, createHash('sha256').update(result.token).digest('hex'))
  assert.equal(subject, 'wx:app:customer1')
  assert.equal(expiresAt, result.expiresAt)
})

test('logout revokes the hashed session token, not every session for the subject', async () => {
  const pool = fakePool(() => ({ rows: [] }))
  await revokeSession(pool, request())
  assert.match(pool.statements[0].sql, /UPDATE auth_sessions SET revoked_at = now\(\) WHERE token_hash = \$1/)
  assert.deepEqual(pool.statements[0].params, [createHash('sha256').update(TOKEN).digest('hex')])
})

test('merchant store listing is scoped to the authenticated subject', async () => {
  const pool = fakePool((_sql, params) => {
    assert.deepEqual(params, ['wx:app:merchant-a'])
    return { rows: [{ id: 'store-a', slug: 'shop-a', role: 'manager' }] }
  })
  const result = await merchantStores(pool, 'wx:app:merchant-a')
  assert.equal(result.length, 1)
  assert.match(pool.statements[0].sql, /mm\.external_subject = \$1/)
})

test('merchant store permission checks BOTH subject and requested store slug', async () => {
  const pool = fakePool((_sql, params) => {
    assert.deepEqual(params, ['wx:app:merchant-a', 'shop-b'])
    return { rows: [] }
  })
  assert.equal(await permittedStore(pool, 'wx:app:merchant-a', 'shop-b'), null)
  assert.match(pool.statements[0].sql, /mm\.external_subject = \$1 AND s\.slug = \$2/)
})
