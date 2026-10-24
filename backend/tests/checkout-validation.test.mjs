import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutRoute } from '../src/checkout.mjs'

const STORE = 'demo-store'
const PRODUCT = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'A'.repeat(48)
const ORDER_URL = new URL(`/v1/stores/${STORE}/orders`, 'http://localhost')
const valid = () => ({
  items: [{ productId: PRODUCT, quantity: 1 }],
  address: { receiverName: 'Test Customer', phone: '0123456789', areaId: 'area-one', detail: 'Unit 1' },
  slot: { id: 'slot-one', date: '2026-11-01' }
})
function request(body, options = {}) {
  const raw = options.raw ?? JSON.stringify(body)
  return {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-length': String(Buffer.byteLength(raw)),
      ...(options.idempotencyKey === null ? {} : { 'idempotency-key': options.idempotencyKey ?? 'K'.repeat(24) })
    },
    async *[Symbol.asyncIterator]() { yield Buffer.from(raw) }
  }
}
function response() {
  return { statusCode: null, body: null,
    writeHead(code) { this.statusCode = code },
    end(raw) { this.body = JSON.parse(raw) }
  }
}
function authOnlyPool() {
  const calls = []
  return {
    calls,
    async query(sql) {
      calls.push(String(sql))
      assert.match(String(sql), /FROM auth_sessions/)
      return { rows: [{ external_subject: 'customer:valid' }] }
    },
    async connect() { throw new Error('VALIDATION_REGRESSION: transaction started for invalid checkout') }
  }
}
async function rejectCheckout(payload, options = {}) {
  const db = authOnlyPool(), res = response()
  const handled = await checkoutRoute(request(payload, options), res, ORDER_URL, db)
  assert.equal(handled, true)
  assert.equal(res.statusCode, 400)
  assert.equal(db.calls.length, 1, 'Only auth lookup should reach DB')
}

test('rejects duplicate product IDs before transaction', async () => {
  const body = valid(); body.items.push({productId: PRODUCT, quantity: 2})
  await rejectCheckout(body)
})
test('rejects zero or negative quantities before transaction', async () => {
  for (const quantity of [0, -1, 1.5, 100]) {
    const body = valid(); body.items[0].quantity = quantity
    await rejectCheckout(body)
  }
})
test('rejects missing or malformed idempotency keys', async () => {
  for (const idempotencyKey of [null, 'short', 'key with spaces']) {
    await rejectCheckout(valid(), { idempotencyKey })
  }
})
test('rejects invalid delivery address and slot before transaction', async () => {
  const missingAddress = valid(); missingAddress.address.detail = ' '
  await rejectCheckout(missingAddress)
  const malformedSlot = valid(); malformedSlot.slot.date = 'tomorrow'
  await rejectCheckout(malformedSlot)
})
test('rejects malformed JSON before transaction', async () => {
  await rejectCheckout(null, { raw: '{"items":' })
})
test('rejects empty cart and excessive item count', async () => {
  const empty = valid(); empty.items = []
  await rejectCheckout(empty)
  const many = valid(); many.items = Array.from({ length: 41 }, (_, i) => ({productId: PRODUCT, quantity: i + 1}))
  await rejectCheckout(many)
})
