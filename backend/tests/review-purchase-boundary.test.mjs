import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewPurchase, inspectReviewContent } from '../src/reviewPolicy.mjs'

const STORE = '11111111-1111-4111-8111-111111111111'
const SUBJECT = 'wx:app:customer-a'
const ITEM = '22222222-2222-4222-8222-222222222222'
const ORDER = '33333333-3333-4333-8333-333333333333'
function record(overrides = {}) {
  return { id: ORDER, store_id: STORE, customer_subject: SUBJECT,
    currency: 'CNY', payment_status: 'unpaid', fulfillment_status: 'new',
    total_cents: 2500, item_id: ITEM, product_id: 'product-1', product_name: 'Rice', ...overrides }
}
function db(row) {
  const calls = []
  return { calls, async query(sql, args) {
    calls.push({ sql: String(sql), args })
    return { rows: row ? [row] : [] }
  } }
}

test('a customer cannot review a missing or foreign order line', async () => {
  const database = db(null)
  await assert.rejects(() => reviewPurchase(database, STORE, SUBJECT, ITEM),
    e => e.status === 404 && e.message === 'order_item_not_found')
  assert.deepEqual(database.calls[0].args, [STORE, SUBJECT, ITEM])
  assert.match(database.calls[0].sql, /o\.customer_subject=\$2/)
  assert.match(database.calls[0].sql, /o\.store_id=\$1/)
})

test('delivery alone never enables reviews without payment', async () => {
  const result = await reviewPurchase(db(record({ fulfillment_status: 'delivered' })), STORE, SUBJECT, ITEM)
  assert.equal(result.eligible, false)
  assert.equal(result.receiptRef, undefined)
})

test('paid status alone is not trusted proof, even for delivered orders', async () => {
  const result = await reviewPurchase(db(record({ fulfillment_status: 'delivered', payment_status: 'paid' })), STORE, SUBJECT, ITEM)
  assert.equal(result.eligible, false)
  assert.equal(result.receiptRef, null)
})

test('payment without delivery does not enable a review', async () => {
  const result = await reviewPurchase(db(record({ fulfillment_status: 'preparing', payment_status: 'paid' })), STORE, SUBJECT, ITEM)
  assert.equal(result.eligible, false)
})

test('unconfigured content moderation stays pending', async () => {
  const result = await inspectReviewContent({ rating: 5, content: 'great' })
  assert.equal(result.state, 'pending')
})
