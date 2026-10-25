// Real HTTP integration tests against an explicitly designated non-production Staging API.
// NO fakes, mocked responses, database writes, session tokens or production credentials.
// Run: STALL_TEST_BASE_URL=https://staging.example.test STALL_TEST_STORE_SLUG=stall-demo
//      node --test backend/tests/staging-api-live.test.mjs
// Fails closed if environment is missing or the host does not look like a staging host.
import test from 'node:test'
import assert from 'node:assert/strict'

const base = process.env.STALL_TEST_BASE_URL
const slug = process.env.STALL_TEST_STORE_SLUG
const timeout = 10000

function target() {
  assert.ok(base, 'Set STALL_TEST_BASE_URL to the deployed STAGING API URL')
  assert.match(slug || '', /^[a-z0-9][a-z0-9-]{1,62}$/, 'Set STALL_TEST_STORE_SLUG')
  const url = new URL(base)
  assert.equal(url.protocol, 'https:', 'Staging API must use HTTPS')
  assert.ok(/(?:^|[.-])(staging|stage|testing|test|dev)(?:[.-]|$)/i.test(url.hostname),
    'Refusing requests: hostname must explicitly identify staging/test/dev, not production')
  assert.equal(url.username, '', 'No credentials in base URL')
  assert.equal(url.password, '', 'No credentials in base URL')
  assert.equal(url.search, '', 'Base URL must not contain query parameters')
  assert.equal(url.hash, '', 'Base URL must not contain fragments')
  assert.equal(url.pathname, '/', 'Use the Staging API origin, without a path')
  return url.origin
}

const origin = target()
const store = '/v1/stores/' + slug
const uuid = '00000000-0000-4000-8000-000000000000'

async function get(route) {
  const response = await fetch(origin + route, {
    method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeout),
    headers: { accept: 'application/json' }
  })
  assert.ok(response.status !== 301 && response.status !== 302 && response.status !== 307 && response.status !== 308,
    'Unexpected redirect for ' + route + ' (status ' + response.status + ')')
  const ct = response.headers.get('content-type') || ''
  assert.match(ct, /application\/json/i, 'Expected JSON for ' + route)
  const data = await response.json()
  assert.ok(data && typeof data === 'object' && !Array.isArray(data), 'JSON object expected: ' + route)
  assert.ok(!JSON.stringify(data).includes('DATABASE_URL'), 'Internal configuration leaked')
  return { status: response.status, data, headers: response.headers }
}

test('live staging health probes real PostgreSQL connectivity', async () => {
  const r = await get('/health')
  assert.equal(r.status, 200, JSON.stringify(r.data))
  assert.equal(r.data.status, 'ok')
})

test('live staging public catalog returns a valid bounded page', async () => {
  const r = await get(store + '/products?limit=5')
  assert.equal(r.status, 200, JSON.stringify(r.data))
  assert.ok(Array.isArray(r.data.products))
  assert.ok(r.data.products.length <= 5)
  assert.equal(typeof r.data.hasMore, 'boolean')
  assert.ok(Array.isArray(r.data.categories))
  for (const p of r.data.products) {
    assert.match(p.id, /^[0-9a-f-]{36}$/i)
    assert.equal(typeof p.name, 'string')
    assert.ok(Number.isInteger(p.priceCents) && p.priceCents >= 0)
  }
})

test('live staging cursor pagination does not repeat products', async () => {
  const first = await get(store + '/products?limit=1')
  assert.equal(first.status, 200)
  assert.ok(first.data.products.length <= 1)
  if (first.data.hasMore) {
    assert.equal(typeof first.data.nextCursor, 'string')
    assert.ok(first.data.nextCursor.length > 0)
    const second = await get(store + '/products?limit=1&cursor=' + encodeURIComponent(first.data.nextCursor))
    assert.equal(second.status, 200, JSON.stringify(second.data))
    assert.ok(second.data.products.length <= 1)
    if (first.data.products.length && second.data.products.length) {
      assert.notEqual(first.data.products[0].id, second.data.products[0].id)
    }
  } else {
    assert.ok(!first.data.nextCursor, 'Terminal page should have no cursor')
  }
})

test('live staging rejects invalid catalog limit', async () => {
  const r = await get(store + '/products?limit=not-a-number')
  assert.equal(r.status, 400, JSON.stringify(r.data))
  assert.equal(typeof r.data.error, 'string')
})

test('live staging rejects malformed product IDs', async () => {
  const r = await get(store + '/products?ids=not-a-uuid')
  assert.equal(r.status, 400, JSON.stringify(r.data))
  assert.equal(r.data.error, 'invalid_product_query')
})

test('live staging rejects duplicate product IDs', async () => {
  const r = await get(store + '/products?ids=' + uuid + ',' + uuid)
  assert.equal(r.status, 400, JSON.stringify(r.data))
  assert.equal(r.data.error, 'invalid_product_query')
})

test('live staging business settings are publicly readable', async () => {
  const r = await get(store + '/business-settings')
  assert.equal(r.status, 200, JSON.stringify(r.data))
})

test('live staging delivery rules are publicly readable', async () => {
  const r = await get(store + '/delivery-rules')
  assert.equal(r.status, 200, JSON.stringify(r.data))
})

test('live staging rejects unauthenticated saved-address reads', async () => {
  const r = await get(store + '/addresses')
  assert.ok([401, 403].includes(r.status), 'Expected unauthenticated rejection; got ' + r.status)
  assert.equal(typeof r.data.error, 'string')
})

test('live staging rejects unauthenticated merchant catalog access', async () => {
  const r = await get('/v1/merchant/stores/' + slug + '/products')
  assert.ok([401, 403].includes(r.status), 'Expected merchant authentication rejection; got ' + r.status)
  assert.equal(typeof r.data.error, 'string')
})

test('live staging does not disclose authentication profile anonymously', async () => {
  const r = await get('/v1/auth/me')
  assert.equal(r.status, 401)
  assert.equal(r.data.error, 'unauthorized')
})

test('live staging returns 404 for a nonexistent endpoint', async () => {
  const r = await get('/v1/this-endpoint-does-not-exist')
  assert.equal(r.status, 404)
  assert.equal(r.data.error, 'not_found')
})

test('live staging rejects invalid discount selector', async () => {
  const r = await get(store + '/products?discount=2')
  assert.equal(r.status, 400, JSON.stringify(r.data))
  assert.equal(r.data.error, 'invalid_product_query')
})

test('live staging rejects an excessively long product search', async () => {
  const r = await get(store + '/products?q=' + encodeURIComponent('a'.repeat(101)))
  assert.equal(r.status, 400, JSON.stringify(r.data))
  assert.equal(r.data.error, 'invalid_product_query')
})

test('live staging rejects invalid product category identifiers', async () => {
  const r = await get(store + '/products?category=not-a-uuid')
  assert.equal(r.status, 400, JSON.stringify(r.data))
  assert.equal(r.data.error, 'invalid_product_query')
})

test('live staging hides merchant billing from unauthenticated visitors', async () => {
  const r = await get('/v1/merchant/stores/' + slug + '/billing')
  assert.equal(r.status, 401, JSON.stringify(r.data))
  assert.equal(typeof r.data.error, 'string')
})

test('live staging hides merchant analytics from unauthenticated visitors', async () => {
  const r = await get('/v1/merchant/stores/' + slug + '/analytics')
  assert.equal(r.status, 401, JSON.stringify(r.data))
  assert.equal(typeof r.data.error, 'string')
})

test('live staging hides merchant categories from unauthenticated visitors', async () => {
  const r = await get('/v1/merchant/stores/' + slug + '/categories')
  assert.equal(r.status, 401, JSON.stringify(r.data))
  assert.equal(r.data.error, 'unauthorized')
})
