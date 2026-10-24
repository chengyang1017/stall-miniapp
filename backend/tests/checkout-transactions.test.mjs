import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutRoute } from '../src/checkout.mjs'

const TOKEN = 'A'.repeat(48)
const PRODUCT = '11111111-1111-4111-8111-111111111111'
const STORE_ID = '22222222-2222-4222-8222-222222222222'
const ORDER_ID = '33333333-3333-4333-8333-333333333333'
const URL = new URL('http://localhost/v1/stores/demo-store/orders')
const KEY = 'K'.repeat(24)
const payload = () => {
  const d = new Date(Date.now() + 86400000)
  const local = new Date(d.getTime() + 8 * 3600000)
  return {
    items: [{ productId: PRODUCT, quantity: 2 }],
    address: { receiverName: 'Test', phone: '0123456789', areaId: 'area1', detail: 'Unit 1' },
    slot: { id: 'slot1', date: local.toISOString().slice(0, 10) }
  }
}
function req(body, key = KEY) {
  const raw = JSON.stringify(body)
  return { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'idempotency-key': key, 'content-length': String(Buffer.byteLength(raw)) }, async *[Symbol.asyncIterator]() { yield Buffer.from(raw) } }
}
function response() { return { code: null, body: null, writeHead(code) { this.code = code }, end(raw) { this.body = JSON.parse(raw) } } }
function mockDb({ existing = null, failAt = null } = {}) {
  const calls = [], params = []
  const client = {
    async query(sql, args = []) {
      const statement = String(sql)
      calls.push(statement); params.push(args)
      if (failAt && statement.includes(failAt)) throw Error('simulated_database_failure')
      if (statement.includes('SELECT external_subject FROM auth_sessions')) return { rows: [{ external_subject: 'customer-one' }] }
      if (statement.includes('SELECT id FROM stores')) return { rows: [{ id: STORE_ID }] }
      if (statement.includes('SELECT id,total_cents,checkout_fingerprint FROM orders')) return { rows: existing ? [existing] : [] }
      if (statement.includes('SELECT configuration FROM store_delivery_rules')) {
        const days = Array.from({length: 7}, () => ({ enabled: true, start: '00:00', end: '23:59' }))
        return { rows: [{ configuration: { accepting: true, days, areas: [{ id: 'area1', name: 'Area', enabled: true, latitude: null, longitude: null, radiusMeters: null }], slots: [{ id: 'slot1', label: 'All day', enabled: true, start: '00:00', end: '23:59' }] } }] }
      }
      if (statement.includes('FROM products WHERE store_id')) return { rows: [{ id: PRODUCT, name: 'Rice', price_cents: 1250, discount_price_cents: null, discount_start: null, discount_end: null, active: true, sold_out: false }] }
      if (statement.includes('INSERT INTO orders(')) return { rows: [{ id: ORDER_ID }] }
      return { rows: [] }
    }, release() { calls.push('RELEASE') }
  }
  return { calls, params, async query(sql, args) { return client.query(sql, args) }, async connect() { return client } }
}
async function run(db, body = payload(), key = KEY) {
  const res = response()
  const handled = await checkoutRoute(req(body, key), res, URL, db)
  assert.equal(handled, true)
  return res
}

test('server calculates order amount from database price, not client-supplied total', async () => {
  const db = mockDb(), order = payload()
  order.totalCents = 1
  order.items[0].priceCents = 1
  const res = await run(db, order)
  assert.equal(res.code, 201)
  assert.equal(res.body.totalCents, 2500)
  const insertIndex = db.calls.findIndex(s => s.includes('INSERT INTO orders('))
  assert.ok(insertIndex >= 0)
  assert.equal(db.params[insertIndex][2], 2500)
  assert.ok(db.calls.some(s => s.includes('COMMIT')))
})

test('a successful checkout inserts exactly one order and its item', async () => {
  const db = mockDb(), res = await run(db)
  assert.equal(res.code, 201)
  assert.equal(db.calls.filter(s => s.includes('INSERT INTO orders(')).length, 1)
  assert.equal(db.calls.filter(s => s.includes('INSERT INTO order_items(')).length, 1)
})

test('retry with same key and identical payload replays the original order without inserting', async () => {
  const first = payload(), db1 = mockDb()
  const firstRes = await run(db1, first)
  assert.equal(firstRes.code, 201)
  const fingerprintIndex = db1.calls.findIndex(s => s.includes('INSERT INTO orders('))
  const fp = db1.params[fingerprintIndex][4]
  const db2 = mockDb({ existing: { id: ORDER_ID, total_cents: 2500, checkout_fingerprint: fp } })
  const replay = await run(db2, first)
  assert.equal(replay.code, 200)
  assert.equal(replay.body.replayed, true)
  assert.equal(replay.body.orderId, ORDER_ID)
  assert.equal(db2.calls.filter(s => s.includes('INSERT INTO orders(')).length, 0)
})

test('same key with different payload returns conflict and does not create another order', async () => {
  const db = mockDb({ existing: { id: ORDER_ID, total_cents: 2500, checkout_fingerprint: 'unrelated-hash' } })
  const res = await run(db)
  assert.equal(res.code, 409)
  assert.equal(res.body.error, 'idempotency_key_reused')
  assert.equal(db.calls.filter(s => s.includes('INSERT INTO orders(')).length, 0)
})

test('database insert failure rolls back, releases connection, and never commits', async () => {
  const db = mockDb({ failAt: 'INSERT INTO order_items(' })
  await assert.rejects(() => run(db), /simulated_database_failure/)
  assert.ok(db.calls.some(s => s.includes('ROLLBACK')))
  assert.ok(!db.calls.some(s => s === 'COMMIT'))
  assert.equal(db.calls.at(-1), 'RELEASE')
})
