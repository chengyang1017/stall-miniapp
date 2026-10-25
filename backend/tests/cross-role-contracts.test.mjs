// Cross-role contract regression guards. These do NOT prove runtime DB, R2 or WeChat behavior.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const server = source('src/server.mjs')
const order = source('src/orderWorkflow.mjs')
const checkout = source('src/checkout.mjs')
const tracking = source('src/deliveryTracking.mjs')
const reviews = source('src/productReviews.mjs')
const support = source('src/support.mjs')

test('merchant and customer use the same backend order workflow route', () => {
  assert.match(server, /orderWorkflowRoute\(req\s*,\s*res\s*,\s*url\s*,\s*pool\)/)
  assert.match(server, /checkoutRoute\(req\s*,\s*res\s*,\s*url\s*,\s*pool\)/)
  assert.match(checkout, /INSERT INTO orders\s*\(/)
  assert.match(order, /FROM orders o JOIN stores s ON s\.id=o\.store_id/)
  assert.match(order, /o\.customer_subject=\$[0-9]/)
})

test('customer order details are owner scoped and delivery proof requires confirmed payment', () => {
  assert.match(order, /o\.id=\$[0-9] AND o\.customer_subject=\$[0-9]/)
  assert.match(order, /payment_not_confirmed/)
  assert.match(order, /payment_status='paid'/)
})

test('merchant and customer tracking share one route, but customer is read-only', () => {
  assert.match(server, /deliveryTrackingRoute\(req\s*,\s*res\s*,\s*url\s*,\s*pool\)/)
  assert.match(tracking, /authenticate\(pool\s*,\s*req\)/)
  assert.match(tracking, /permittedStore\(pool\s*,\s*subject\s*,\s*slug\)/)
  assert.match(tracking, /!merchant\s*&&\s*action/)
  assert.match(tracking, /customer_subject/)
  assert.match(tracking, /120000/)
})

test('product review publication and private purchase requirements remain server owned', () => {
  assert.match(server, /productReviewRoute\(req\s*,\s*res\s*,\s*url\s*,\s*pool\)/)
  assert.match(reviews, /authenticate\(pool\s*,\s*req\)/)
  assert.match(reviews, /moderation_status='approved'/)
  assert.match(reviews, /customer_subject/)
})

test('support messages are scoped to store and customer, not a global conversation', () => {
  assert.match(server, /supportRoute\(req\s*,\s*res\s*,\s*url\s*,\s*pool\)/)
  assert.match(support, /support_conversations/)
  assert.match(support, /c\.customer_subject=\$3/)
  assert.match(support, /WHERE store_id=\$1/)
})

test('API server is never imported by contract tests (starting it would start workers)', () => {
  assert.match(server, /startInventoryWorker\(pool\)/)
  assert.ok(!/import\s+.*['"]\.\.\/src\/server\.mjs['"]/.test(source('tests/cross-role-contracts.test.mjs')))
})
