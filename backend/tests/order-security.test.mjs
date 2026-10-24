import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutRoute } from '../src/checkout.mjs'
import { orderWorkflowRoute } from '../src/orderWorkflow.mjs'

const STORE = 'demo-store'
const ID = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'A'.repeat(48)

function req(method = 'GET', signed = false, body) {
  const raw = body === undefined ? '' : JSON.stringify(body)
  return {
    method,
    headers: { ...(signed ? { authorization: `Bearer ${TOKEN}` } : {}), 'content-length': String(Buffer.byteLength(raw)) },
    async *[Symbol.asyncIterator]() { if (raw) yield Buffer.from(raw) }
  }
}
function res() {
  return {
    statusCode: null, body: null,
    writeHead(code) { this.statusCode = code },
    end(raw) { this.body = JSON.parse(raw) }
  }
}
function url(path) { return new URL(path, 'http://localhost') }
function pool(queries = []) {
  const calls = []
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql), params })
      if (!queries.length) throw Error(`Unexpected DB query: ${String(sql).slice(0, 100)}`)
      const rule = queries.shift()
      assert.match(String(sql), rule.pattern)
      return { rows: rule.rows || [] }
    }
  }
}
const auth = { pattern: /FROM auth_sessions/, rows: [{ external_subject: 'customer:a' }] }
const merchantAuth = { pattern: /FROM auth_sessions/, rows: [{ external_subject: 'merchant:a' }] }

test('unauthenticated checkout is rejected before touching DB', async () => {
  const db = pool(), response = res()
  const handled = await checkoutRoute(req('POST'), response, url(`/v1/stores/${STORE}/orders`), db)
  assert.equal(handled, true)
  assert.equal(response.statusCode, 401)
  assert.equal(db.calls.length, 0)
})

test('checkout does not support GET', async () => {
  const db = pool(), response = res()
  await checkoutRoute(req('GET'), response, url(`/v1/stores/${STORE}/orders`), db)
  assert.equal(response.statusCode, 405)
  assert.equal(db.calls.length, 0)
})

test('invalid checkout is rejected before transaction', async () => {
  const db = pool([auth]), response = res()
  await checkoutRoute(req('POST', true, { items: [] }), response, url(`/v1/stores/${STORE}/orders`), db)
  assert.equal(response.statusCode, 400)
  assert.equal(db.calls.length, 1)
})

test('unauthenticated merchant orders cannot be read', async () => {
  const db = pool(), response = res()
  await orderWorkflowRoute(req(), response, url(`/v1/merchant/stores/${STORE}/orders`), db)
  assert.equal(response.statusCode, 401)
  assert.equal(db.calls.length, 0)
})

test('merchant not assigned to store cannot read orders', async () => {
  const db = pool([merchantAuth, { pattern: /FROM merchant_members/, rows: [] }]), response = res()
  await orderWorkflowRoute(req('GET', true), response, url(`/v1/merchant/stores/${STORE}/orders`), db)
  assert.equal(response.statusCode, 403)
  assert.equal(db.calls.length, 2)
})

test('customer order detail query must filter by customer subject', async () => {
  const db = pool([auth, {
    pattern: /customer_subject\s*=\s*\$3/,
    rows: []
  }]), response = res()
  await orderWorkflowRoute(req('GET', true), response, url(`/v1/stores/${STORE}/orders/${ID}`), db)
  assert.equal(response.statusCode, 404)
  assert.equal(db.calls[1].params[2], 'customer:a')
})

test('merchant order status endpoint requires authorization', async () => {
  const db = pool(), response = res()
  await orderWorkflowRoute(req('POST', false, { status: 'delivered', proofKey: 'delivery-proofs/fakeproof1' }), response, url(`/v1/merchant/stores/${STORE}/orders/${ID}/status`), db)
  assert.equal(response.statusCode, 401)
  assert.equal(db.calls.length, 0)
})

test('API does not expose another merchant store via status mutation', async () => {
  const db = pool([merchantAuth, { pattern: /FROM merchant_members/, rows: [] }]), response = res()
  await orderWorkflowRoute(req('POST', true, { status: 'accepted' }), response, url(`/v1/merchant/stores/${STORE}/orders/${ID}/status`), db)
  assert.equal(response.statusCode, 403)
  assert.equal(db.calls.length, 2)
})


test('unpaid delivering order cannot be marked delivered', async () => {
  const calls = []
  const client = {
    async query(sql, params) {
      calls.push(String(sql))
      if (/^SELECT fulfillment_status,payment_status FROM orders/.test(String(sql))) return { rows: [{ fulfillment_status: 'delivering', payment_status: 'unpaid' }] }
      if (/^(BEGIN|ROLLBACK)$/.test(String(sql))) return { rows: [] }
      throw Error('Unexpected mutation in unpaid delivery test: ' + sql)
    },
    release() {}
  }
  const db = pool([merchantAuth, {pattern:/FROM merchant_members/,rows:[{id:'store-1',slug:STORE}]}])
  db.connect = async () => client
  const response = res()
  await orderWorkflowRoute(req('POST', true, {status:'delivered',proofKey:'delivery-proofs/validproofkey123'}), response, url(`/v1/merchant/stores/${STORE}/orders/${ID}/status`), db)
  assert.equal(response.statusCode, 409)
  assert.equal(response.body.error, 'payment_not_confirmed')
  assert.equal(calls.some(s => /^UPDATE orders/.test(s)), false)
  assert.ok(calls.includes('ROLLBACK'))
})
