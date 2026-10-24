import test from 'node:test'
import assert from 'node:assert/strict'
import { orderWorkflowRoute } from '../src/orderWorkflow.mjs'

const slug = 'demo-store'
const orderId = '11111111-1111-4111-8111-111111111111'
const token = 'A'.repeat(48)
function request(path, authorized = true) {
  return { method: 'GET', headers: authorized ? { authorization: `Bearer ${token}` } : {}, async *[Symbol.asyncIterator]() {} , path }
}
function response() {
  return { statusCode: 0, data: null, writeHead(code) { this.statusCode = code }, end(body) { this.data = JSON.parse(body) } }
}
function mockDatabase({ authorized = true, merchant = false, customerOrder = true } = {}) {
  const statements = []
  const db = { statements, async query(sql, params = []) {
    const s = String(sql); statements.push({ sql: s, params })
    if (/FROM auth_sessions/.test(s)) return { rows: authorized ? [{ external_subject: 'customer-A' }] : [] }
    if (/FROM merchant_members/.test(s)) return { rows: merchant ? [{ id: 'store-id', slug, role: 'owner' }] : [] }
    if (/FROM orders/.test(s)) return { rows: customerOrder ? [{ id: orderId, customer_subject: 'customer-A', delivery_proof_key: 'delivery-proofs/demo/photo' }] : [] }
    if (/FROM order_items|FROM order_status_events/.test(s)) return { rows: [] }
    throw new Error(`Unexpected SQL: ${s}`)
  } }
  return db
}
async function call(path, db, authorized = true) {
  const res = response()
  const handled = await orderWorkflowRoute(request(path, authorized), res, new URL(path, 'http://localhost'), db)
  return { handled, res, statements: db.statements }
}

test('unauthenticated customer cannot read order or proof metadata', async () => {
  const db = mockDatabase({ authorized: false })
  const result = await call(`/v1/stores/${slug}/orders/${orderId}`, db, false)
  assert.equal(result.handled, true)
  assert.equal(result.res.statusCode, 401)
  assert.equal(db.statements.some(s => /FROM orders/.test(s.sql)), false)
})

test('customer order detail query must bind the authenticated subject', async () => {
  const db = mockDatabase()
  const { res, statements } = await call(`/v1/stores/${slug}/orders/${orderId}`, db)
  assert.equal(res.statusCode, 200)
  const select = statements.find(s => /FROM orders/.test(s.sql))
  assert.ok(select, 'order SELECT must occur')
  assert.match(select.sql, /customer_subject/i, 'order query must restrict customer identity')
  assert.ok(select.params.includes('customer-A'), 'must bind authenticated identity')
  assert.ok(select.params.includes(orderId), 'must bind requested order id')
})

test('unknown customer order returns 404 rather than another customer order', async () => {
  const db = mockDatabase({ customerOrder: false })
  const { res } = await call(`/v1/stores/${slug}/orders/${orderId}`, db)
  assert.equal(res.statusCode, 404)
})

test('unassigned merchant cannot open the merchant order detail', async () => {
  const db = mockDatabase({ merchant: false })
  const { res, statements } = await call(`/v1/merchant/stores/${slug}/orders/${orderId}`, db)
  assert.equal(res.statusCode, 403)
  assert.equal(statements.some(s => /FROM orders/.test(s.sql)), false)
})

test('merchant authorization includes requested store slug', async () => {
  const db = mockDatabase({ merchant: true })
  const { res, statements } = await call(`/v1/merchant/stores/${slug}/orders/${orderId}`, db)
  assert.equal(res.statusCode, 200)
  const authz = statements.find(s => /FROM merchant_members/.test(s.sql))
  assert.ok(authz)
  assert.ok(authz.params.includes(slug))
  assert.ok(authz.params.includes('customer-A'))
})
