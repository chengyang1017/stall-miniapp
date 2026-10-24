// Dev-only write-through test. No merchant auth bypass is added to the API.
import { Client } from 'pg'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) || parsed.pathname !== '/stall_dev') {
  throw new Error('Refusing nonlocal or non-stall_dev database')
}
if (process.env.CONFIRM_DEV_CATALOG_TEST !== 'YES') throw new Error('Set CONFIRM_DEV_CATALOG_TEST=YES')
const api = process.env.LOCAL_API_URL || 'http://127.0.0.1:8787'
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):8787$/.test(api)) throw new Error('Only localhost:8787 API is allowed')
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444'
const SLUG = 'stall-demo'
const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 })
const endpoint = `${api}/v1/stores/${SLUG}/products`
async function fromApi(expected) {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), headers: { 'cache-control': 'no-cache' } })
  if (!response.ok) throw new Error(`Public catalog returned HTTP ${response.status}`)
  const json = await response.json()
  const product = json.products?.find(p => p.id === PRODUCT_ID)
  if (!product) throw new Error('Expected test product is not returned by public catalog')
  if (product.priceCents !== expected) throw new Error(`Price mismatch: expected ${expected}, API returned ${product.priceCents}`)
  return product
}
let oldPrice = null
let changed = false
await client.connect()
try {
  const { rows } = await client.query(`SELECT p.price_cents AS price, s.slug FROM products p JOIN stores s ON s.id = p.store_id WHERE p.id=$1`, [PRODUCT_ID])
  if (rows.length !== 1 || rows[0].slug !== SLUG) throw new Error('Test item not found in stall-demo')
  oldPrice = rows[0].price
  if (oldPrice !== 1500) throw new Error(`Expected baseline 1500 cents, got ${oldPrice}; refusing to overwrite it`)
  await fromApi(oldPrice)
  const changedRows = await client.query('UPDATE products SET price_cents=1800,updated_at=now() WHERE id=$1 AND price_cents=$2', [PRODUCT_ID, oldPrice])
  if (changedRows.rowCount !== 1) throw new Error('Test price change was not applied')
  changed = true
  await fromApi(1800)
  console.log('PASS PostgreSQL 1500 -> 1800; public API returned updated price (¥18.00).')
} finally {
  if (changed) {
    try {
      await client.query('UPDATE products SET price_cents=$2,updated_at=now() WHERE id=$1', [PRODUCT_ID, oldPrice])
      console.log('Restored original test price (¥15.00).')
      await fromApi(oldPrice)
      console.log('PASS Public API shows restored price.')
    } catch (err) { console.error('IMPORTANT: Automatic price restore/check failed. Inspect test product:', err); process.exitCode = 1 }
  }
  await client.end()
}
