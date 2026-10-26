// Round 7: actual business modules, strict transactional SQL adapter, no DB/network.
// These are simulated route/transaction tests, NOT PostgreSQL integration tests.
import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutRoute } from '../src/checkout.mjs'
import { orderWorkflowRoute } from '../src/orderWorkflow.mjs'
import { sweepInventory } from '../src/inventory.mjs'
import { fixture, payload, request, response, STORE_A, STORE_B, PRODUCT_A, PRODUCT_B } from './helpers/business-phase7-db.mjs'

const key = n => 'PHASE7_RETRY_KEY_' + String(n).padStart(10, '0')
async function checkout(db, { subject = 'customer-a', slug = 'alpha', data = payload(), retry = key(1), lost = false } = {}) {
  const res = response({ lost })
  assert.equal(await checkoutRoute(request(db, subject, data, retry), res, new URL(`http://unit.invalid/v1/stores/${slug}/orders`), db), true)
  return res
}
async function status(db, order, next, { subject = 'owner-a', slug = 'alpha', reason = '测试操作' } = {}) {
  const res = response()
  assert.equal(await orderWorkflowRoute(request(db, subject, { status: next, reason }), res, new URL(`http://unit.invalid/v1/merchant/stores/${slug}/orders/${order}/status`), db), true)
  return res
}
async function ownOrder(db, order, subject, slug = 'alpha') {
  const res = response()
  assert.equal(await orderWorkflowRoute(request(db, subject, {}, key(1), 'GET'), res, new URL(`http://unit.invalid/v1/stores/${slug}/orders/${order}`), db), true)
  return res
}
const snapshot = db => Object.fromEntries(['products', 'orders', 'items', 'reservations', 'movements', 'events'].map(t => [t, db.rows(t)]))
function counts(db, { orders, items = orders, reservations = orders, movements = orders }) {
  assert.equal(db.rows('orders').length, orders)
  assert.equal(db.rows('items').length, items)
  assert.equal(db.rows('reservations').length, reservations)
  assert.equal(db.rows('movements').length, movements)
  db.assertClosed()
}
async function heldOrder(db) {
  const res = await checkout(db); assert.equal(res.code, 201)
  return db.tables.orders.get(res.body.orderId)
}
// In-memory paid fixtures exercise state branches only: no payment is performed
// or confirmed by these tests, and no production row is changed.
async function paidOrder(db) { const order = await heldOrder(db); order.payment_status = 'paid'; return order }
const run = (name, fn) => test(name, { timeout: 8000 }, fn) // timeout is a deadlock guard, not scheduling logic

run('P7-01 SQL adapter rejects unknown SQL and discards uncommitted writes', async () => {
  const db = fixture(), c = await db.connect(), before = snapshot(db)
  await c.query('BEGIN')
  await c.query('UPDATE products SET stock_quantity=$3,inventory_version=inventory_version+1 WHERE store_id=$1 AND id=$2', [STORE_A, PRODUCT_A, 0])
  assert.deepEqual(snapshot(db), before, 'dirty writes must be invisible outside transaction')
  await assert.rejects(c.query('SELECT unsupported_test_query'), /phase7_unhandled_sql/)
  await c.query('ROLLBACK'); c.release(); assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-02 first checkout saves server price snapshots, unpaid hold, reservation and matching movement', async () => {
  const db = fixture(), data = payload([{ productId: PRODUCT_A, quantity: 2, unitPriceCents: 1, stockQuantity: 999 }]); data.totalCents = 1
  const res = await checkout(db, { data })
  assert.equal(res.code, 201); assert.equal(res.body.totalCents, 2400); assert.equal(res.body.paymentStatus, 'unpaid'); assert.equal(res.body.inventoryState, 'held')
  const order = db.rows('orders')[0], item = db.rows('items')[0], move = db.rows('movements')[0]
  assert.equal(order.total_cents, 2400); assert.equal(order.payment_status, 'unpaid')
  assert.equal(item.order_id, order.id); assert.equal(item.unit_price_cents, 1200); assert.equal(item.line_total_cents, 2400)
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 8)
  assert.equal(+order.inventory_expires_at - +db.now, 15 * 60000)
  assert.deepEqual([move.before_quantity, move.delta, move.after_quantity, move.source], [10, -2, 8, 'order'])
  assert.equal(db.rows('reservations')[0].order_id, order.id); counts(db, { orders: 1 })
})

run('P7-03 repeated same-key clicks replay one order without another stock deduction', async () => {
  const db = fixture(), first = await checkout(db), before = snapshot(db)
  for (let i = 0; i < 3; i++) {
    const retry = await checkout(db); assert.equal(retry.code, 200); assert.equal(retry.body.replayed, true); assert.equal(retry.body.orderId, first.body.orderId)
  }
  assert.deepEqual(snapshot(db), before); counts(db, { orders: 1 })
})

run('P7-04 response lost after COMMIT can be safely retried with the same key', async () => {
  const db = fixture()
  await assert.rejects(checkout(db, { lost: true }), /phase7_connection_lost_after_commit/)
  const before = snapshot(db); assert.equal(before.orders.length, 1)
  const retry = await checkout(db)
  assert.equal(retry.code, 200); assert.equal(retry.body.orderId, before.orders[0].id)
  assert.equal(retry.body.replayed, true); assert.deepEqual(snapshot(db), before); counts(db, { orders: 1 })
  const sql = db.trace.map(q => q.sql); assert.ok(sql.lastIndexOf('ROLLBACK') > sql.indexOf('COMMIT'))
})

run('P7-05 same key with a changed cart is a conflict and leaves committed state untouched', async () => {
  const db = fixture(); await heldOrder(db); const before = snapshot(db)
  const res = await checkout(db, { data: payload([{ productId: PRODUCT_A, quantity: 2 }]) })
  assert.equal(res.code, 409); assert.equal(res.body.error, 'idempotency_key_reused'); assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-06 concurrent same-key requests serialize and return the same committed order', async () => {
  const db = fixture(), gate = db.pauseOnce(s => s.includes('FROM products p WHERE'))
  const first = checkout(db); await gate.entered
  const second = checkout(db)
  await db.locks.blocked('key:alpha:customer-a:' + key(1)); gate.release()
  const results = await Promise.all([first, second])
  assert.deepEqual(results.map(r => r.code), [201, 200]); assert.equal(results[0].body.orderId, results[1].body.orderId)
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 9); counts(db, { orders: 1 })
})

run('P7-07 concurrent same key with different contents returns one success and one conflict', async () => {
  const db = fixture(), gate = db.pauseOnce(s => s.includes('FROM products p WHERE'))
  const first = checkout(db); await gate.entered
  const second = checkout(db, { data: payload([{ productId: PRODUCT_A, quantity: 3 }]) })
  await db.locks.blocked('key:alpha:customer-a:' + key(1)); gate.release()
  const [a, b] = await Promise.all([first, second]); assert.equal(a.code, 201); assert.equal(b.code, 409); assert.equal(b.body.error, 'idempotency_key_reused')
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 9); counts(db, { orders: 1 })
})

run('P7-08 identical retry keys are scoped by customer and store, not globally shared', async () => {
  const db = fixture()
  const a = await checkout(db), b = await checkout(db, { subject: 'customer-b' }), c = await checkout(db, { slug: 'beta', data: payload([{ productId: db.betaProduct, quantity: 1 }]) })
  assert.deepEqual([a.code, b.code, c.code], [201, 201, 201]); assert.equal(new Set([a.body.orderId, b.body.orderId, c.body.orderId]).size, 3)
  assert.deepEqual(db.rows('orders').map(o => [o.store_id, o.customer_subject]), [[STORE_A, 'customer-a'], [STORE_A, 'customer-b'], [STORE_B, 'customer-a']]); counts(db, { orders: 3 })
})

run('P7-09 distinct retry keys are distinct checkouts (no cart-based deduplication guarantee)', async () => {
  const db = fixture(), a = await checkout(db), b = await checkout(db, { retry: key(2) })
  assert.equal(a.code, 201); assert.equal(b.code, 201); assert.notEqual(a.body.orderId, b.body.orderId)
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 8); counts(db, { orders: 2 })
})

run('P7-10 two customers contending for the final unit produce one order and one stock conflict', async () => {
  const db = fixture({ stock: 1 }), gate = db.pauseOnce(s => s.startsWith('INSERT INTO orders('))
  const a = checkout(db); await gate.entered // A already owns product lock
  const b = checkout(db, { subject: 'customer-b' }); await db.locks.blocked('product:' + PRODUCT_A); gate.release()
  const results = await Promise.all([a, b]); assert.deepEqual(results.map(r => r.code), [201, 409]); assert.equal(results[1].body.error, 'insufficient_stock')
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 0); counts(db, { orders: 1 })
})

run('P7-11 five contending customers cannot reserve more than two available units', async () => {
  const db = fixture({ stock: 2 }), gate = db.pauseOnce(s => s.startsWith('INSERT INTO orders('))
  const first = checkout(db); await gate.entered
  const others = Array.from({ length: 4 }, (_, i) => checkout(db, { subject: 'customer-' + i }))
  await db.locks.blocked('product:' + PRODUCT_A, 4); gate.release()
  const results = await Promise.all([first, ...others])
  assert.equal(results.filter(r => r.code === 201).length, 2); assert.equal(results.filter(r => r.code === 409 && r.body.error === 'insufficient_stock').length, 3)
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 0); counts(db, { orders: 2 })
})

run('P7-12 quantity exceeding available stock rejects before any persisted writes', async () => {
  const db = fixture({ stock: 1 }), before = snapshot(db)
  const res = await checkout(db, { data: payload([{ productId: PRODUCT_A, quantity: 2 }]) })
  assert.equal(res.code, 409); assert.equal(res.body.error, 'insufficient_stock'); assert.deepEqual(snapshot(db), before); db.assertClosed()
})

for (const [field, value, label] of [['active', false, 'unpublished'], ['sold_out', true, 'manually sold out']]) {
  run(`P7-13/${field} product becoming ${label} before locked read is rejected`, async () => {
    const db = fixture(), gate = db.pauseOnce(s => s.includes('FROM products p WHERE'))
    const pending = checkout(db); await gate.entered; db.tables.products.get(PRODUCT_A)[field] = value; gate.release()
    const res = await pending; assert.equal(res.code, 409); assert.equal(res.body.error, 'product_unavailable'); counts(db, { orders: 0 })
    assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 10)
  })
}

run('P7-14 server uses latest locked price/quantity, ignoring stale client inventory version', async () => {
  const db = fixture(), gate = db.pauseOnce(s => s.includes('FROM products p WHERE'))
  const data = payload(); data.items[0].priceCents = 1; data.items[0].inventoryVersion = 1
  const pending = checkout(db, { data }); await gate.entered
  Object.assign(db.tables.products.get(PRODUCT_A), { price_cents: 2300, stock_quantity: 3, inventory_version: 8 }); gate.release()
  const res = await pending; assert.equal(res.code, 201); assert.equal(res.body.totalCents, 2300)
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 2); assert.equal(db.tables.products.get(PRODUCT_A).inventory_version, 9)
  assert.equal(db.rows('items')[0].unit_price_cents, 2300); counts(db, { orders: 1 })
})

run('P7-15 multi-product cart with one insufficient product does not deduct any product', async () => {
  const db = fixture({ secondStock: 0 }), before = snapshot(db)
  const res = await checkout(db, { data: payload([{ productId: PRODUCT_A, quantity: 2 }, { productId: PRODUCT_B, quantity: 1 }]) })
  assert.equal(res.code, 409); assert.equal(res.body.error, 'insufficient_stock'); assert.deepEqual(snapshot(db), before); db.assertClosed()
})

for (const [label, sql, occurrence] of [['second line insert', 'INSERT INTO order_items(', 2], ['second stock movement', 'INSERT INTO inventory_movements(', 2], ['commit before durable apply', 'COMMIT', 2]]) {
  run(`P7-16/${label} DB failure rolls back orders, lines, quantities, reservations and movements`, async () => {
    const db = fixture(), before = snapshot(db); db.failOnce(s => s.startsWith(sql), occurrence)
    await assert.rejects(checkout(db, { data: payload([{ productId: PRODUCT_A, quantity: 2 }, { productId: PRODUCT_B, quantity: 3 }]) }), /phase7_injected_database_failure/)
    assert.deepEqual(snapshot(db), before); assert.ok(db.trace.some(q => q.sql === 'ROLLBACK')); db.assertClosed()
  })
}

run('P7-17 retry after rolled-back DB failure creates exactly one successful order', async () => {
  const db = fixture(); db.failOnce(s => s.startsWith('INSERT INTO inventory_movements('))
  await assert.rejects(checkout(db), /phase7_injected_database_failure/); counts(db, { orders: 0 })
  const res = await checkout(db); assert.equal(res.code, 201); assert.equal(res.body.replayed, false)
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 9); counts(db, { orders: 1 })
})

run('P7-18 cross-store product ID is unavailable and cannot change either store inventory', async () => {
  const db = fixture(), before = snapshot(db)
  const res = await checkout(db, { data: payload([{ productId: db.betaProduct, quantity: 1 }]) })
  assert.equal(res.code, 409); assert.equal(res.body.error, 'product_unavailable'); assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-19 unsigned checkout fails authentication without transactions or writes', async () => {
  const db = fixture(), res = response(), req = request(db, 'customer-a', payload()); delete req.headers.authorization
  assert.equal(await checkoutRoute(req, res, new URL('http://unit.invalid/v1/stores/alpha/orders'), db), true)
  assert.equal(res.code, 401); assert.equal(db.clients.length, 0); counts(db, { orders: 0 })
})

run('P7-20 two authorized merchants concurrently accepting one order record only one transition', async () => {
  const db = fixture(), order = await paidOrder(db), gate = db.pauseOnce(s => s.startsWith('UPDATE orders SET fulfillment_status=$3'))
  const a = status(db, order.id, 'accepted'); await gate.entered
  const b = status(db, order.id, 'accepted', { subject: 'manager-a' }); await db.locks.blocked('order:' + order.id); gate.release()
  const [first, second] = await Promise.all([a, b]); assert.equal(first.code, 200); assert.equal(second.code, 409); assert.equal(second.body.error, 'invalid_transition')
  assert.equal(db.rows('orders')[0].fulfillment_status, 'accepted'); assert.equal(db.rows('events').length, 1)
  assert.equal(db.rows('movements').filter(m => m.source === 'payment').length, 1); db.assertClosed()
})

run('P7-21 repeated accepted transition conflicts without duplicate events or inventory mutations', async () => {
  const db = fixture(), order = await paidOrder(db); assert.equal((await status(db, order.id, 'accepted')).code, 200)
  const before = snapshot(db), retry = await status(db, order.id, 'accepted')
  assert.equal(retry.code, 409); assert.equal(retry.body.current, 'accepted'); assert.deepEqual(snapshot(db), before); db.assertClosed()
})

for (const [from, to] of [['cancelled', 'accepted'], ['delivered', 'preparing'], ['delivered', 'cancelled'], ['new', 'delivering']]) {
  run(`P7-22/${from}->${to} illegal transition preserves order and inventory`, async () => {
    const db = fixture(), order = await paidOrder(db); order.fulfillment_status = from
    const before = snapshot(db), res = await status(db, order.id, to)
    assert.equal(res.code, 409); assert.equal(res.body.error, 'invalid_transition'); assert.deepEqual(snapshot(db), before); db.assertClosed()
  })
}

run('P7-23 held unpaid order cannot be accepted, and paid hold commits without deducting twice', async () => {
  const db = fixture(), order = await heldOrder(db), before = snapshot(db)
  const blocked = await status(db, order.id, 'accepted'); assert.equal(blocked.code, 409); assert.equal(blocked.body.error, 'payment_not_confirmed'); assert.deepEqual(snapshot(db), before)
  order.payment_status = 'paid'; assert.equal((await status(db, order.id, 'accepted')).code, 200)
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 9)
  assert.equal(db.rows('orders')[0].inventory_state, 'committed'); assert.equal(db.rows('reservations')[0].state, 'committed')
  const paidMoves = db.rows('movements').filter(m => m.source === 'payment'); assert.equal(paidMoves.length, 1); assert.equal(paidMoves[0].delta, 0); db.assertClosed()
})

run('P7-24 unauthorized store, foreign order ID and non-managing roles cannot change an order', async () => {
  const db = fixture(), order = await paidOrder(db), before = snapshot(db)
  for (const options of [{ subject: 'owner-b' }, { subject: 'customer-a' }, { subject: 'viewer-a' }]) assert.equal((await status(db, order.id, 'accepted', options)).code, 403)
  const foreign = await status(db, order.id, 'accepted', { subject: 'owner-b', slug: 'beta' }); assert.equal(foreign.code, 404)
  assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-25 another customer or another store cannot read an order by knowing its ID', async () => {
  const db = fixture(), order = await heldOrder(db), before = snapshot(db)
  assert.equal((await ownOrder(db, order.id, 'customer-b')).code, 404)
  assert.equal((await ownOrder(db, order.id, 'customer-a', 'beta')).code, 404)
  assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-26 status event insertion failure rolls back transition and paid hold resolution together', async () => {
  const db = fixture(), order = await paidOrder(db), before = snapshot(db)
  db.failOnce(s => s.startsWith('INSERT INTO order_status_events('))
  await assert.rejects(status(db, order.id, 'accepted'), /phase7_injected_database_failure/)
  assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-27 unpaid cancellation releases stock once and repeated cancellation cannot credit it twice', async () => {
  const db = fixture(), order = await heldOrder(db), res = await status(db, order.id, 'cancelled')
  assert.equal(res.code, 200); assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 10)
  assert.equal(db.rows('orders')[0].inventory_state, 'released'); assert.equal(db.rows('reservations')[0].state, 'released')
  const move = db.rows('movements').find(m => m.source === 'cancel'); assert.equal(move.delta, 1)
  const before = snapshot(db); assert.equal((await status(db, order.id, 'cancelled')).code, 409); assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-28 failed cancellation audit insert rolls back stock release as well as status', async () => {
  const db = fixture(), order = await heldOrder(db), before = snapshot(db)
  db.failOnce(s => s.startsWith('INSERT INTO order_status_events('))
  await assert.rejects(status(db, order.id, 'cancelled'), /phase7_injected_database_failure/)
  assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-29 selected expired unpaid hold is released/cancelled once by real sweep function', async () => {
  const db = fixture(), order = await heldOrder(db); db.now = new Date(+order.inventory_expires_at + 1); db.sweepCandidates.add(order.id)
  assert.equal(await sweepInventory(db), 1)
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 10); assert.equal(db.rows('orders')[0].fulfillment_status, 'cancelled')
  assert.equal(db.rows('movements').find(m => m.source === 'expiry').delta, 1); assert.equal(db.rows('events').length, 1)
  assert.deepEqual(db.rows('events').map(e => [e.actor, e.from_status, e.to_status, e.note]), [
    ['system:inventory', 'new', 'cancelled', '未支付预留超过15分钟，释放库存']
  ])
  const before = snapshot(db); assert.equal(await sweepInventory(db), 0); assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-30 accept at exact hold expiry cancels and releases instead of accepting', async () => {
  const db = fixture(), order = await heldOrder(db); db.now = new Date(order.inventory_expires_at)
  const res = await status(db, order.id, 'accepted')
  assert.equal(res.code, 409); assert.equal(res.body.error, 'inventory_reservation_expired')
  assert.equal(db.rows('orders')[0].fulfillment_status, 'cancelled'); assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 10); db.assertClosed()
  assert.deepEqual(db.rows('events').map(e => [e.store_id, e.order_id, e.actor, e.from_status, e.to_status, e.note]), [
    [STORE_A, order.id, 'system:inventory', 'new', 'cancelled', '未支付预留超时，库存已释放']
  ])
})

run('P7-31 expired-order cancellation excludes sweep in the lock MODEL, not a PostgreSQL SKIP LOCKED verification', async () => {
  const db = fixture(), order = await heldOrder(db), gate = db.pauseOnce(s => s.startsWith('UPDATE inventory_reservations SET state='))
  db.now = new Date(order.inventory_expires_at)
  // This committed row qualifies for the real SQL before either operation:
  // held + unpaid + new + expires_at <= server clock. Candidate selection and
  // lock exclusion are still modeled, NOT executed by PostgreSQL.
  assert.deepEqual([order.inventory_state, order.payment_status, order.fulfillment_status], ['held', 'unpaid', 'new'])
  assert.ok(+order.inventory_expires_at <= +db.now)
  const pending = status(db, order.id, 'cancelled'); await gate.entered
  db.sweepCandidates.add(order.id); assert.equal(await sweepInventory(db), 0); gate.release()
  const cancelled = await pending
  assert.equal(cancelled.code, 409); assert.equal(cancelled.body.error, 'inventory_reservation_expired')
  assert.equal(await sweepInventory(db), 0)
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 10); assert.equal(db.rows('movements').filter(m => m.delta > 0).length, 1); db.assertClosed()
  assert.equal(db.rows('orders')[0].fulfillment_status, 'cancelled'); assert.equal(db.rows('reservations')[0].state, 'released')
  assert.deepEqual(db.rows('events').map(e => [e.actor, e.from_status, e.to_status, e.note]), [
    ['system:inventory', 'new', 'cancelled', '未支付预留超时，库存已释放']
  ])
})

run('P7-32 sweep owning the order lock makes competing cancellation a safe status conflict', async () => {
  const db = fixture(), order = await heldOrder(db); db.now = new Date(+order.inventory_expires_at + 1); db.sweepCandidates.add(order.id)
  const gate = db.pauseOnce(s => s.startsWith('UPDATE inventory_reservations SET state=')), sweep = sweepInventory(db)
  await gate.entered; const cancel = status(db, order.id, 'cancelled'); await db.locks.blocked('order:' + order.id); gate.release()
  assert.equal(await sweep, 1); const res = await cancel; assert.equal(res.code, 409); assert.equal(res.body.error, 'invalid_transition')
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 10); assert.equal(db.rows('movements').filter(m => m.delta > 0).length, 1); assert.equal(db.rows('events').length, 1); db.assertClosed()
})

run('P7-33 partial multi-product release failure rolls back earlier restored products and movements', async () => {
  const db = fixture(), res = await checkout(db, { data: payload([{ productId: PRODUCT_A, quantity: 1 }, { productId: PRODUCT_B, quantity: 2 }]) })
  assert.equal(res.code, 201); const before = snapshot(db)
  db.failOnce(s => s.startsWith('INSERT INTO inventory_movements('), 2)
  await assert.rejects(status(db, res.body.orderId, 'cancelled'), /phase7_injected_database_failure/)
  assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-34 paid cancellation does not fabricate a refund or restore committed sold stock', async () => {
  const db = fixture(), order = await paidOrder(db)
  assert.equal((await status(db, order.id, 'accepted')).code, 200); assert.equal((await status(db, order.id, 'cancelled')).code, 200)
  assert.equal(db.rows('orders')[0].payment_status, 'paid'); assert.equal(db.rows('orders')[0].inventory_state, 'committed')
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 9); assert.equal(db.rows('movements').filter(m => m.delta > 0).length, 0); db.assertClosed()
})

run('P7-35 missing reason and unverified delivered endpoint cannot bypass existing state machine', async () => {
  const db = fixture(), order = await paidOrder(db), before = snapshot(db)
  const noReason = await status(db, order.id, 'cancelled', { reason: '' }); assert.equal(noReason.code, 400); assert.equal(noReason.body.error, 'reason_required')
  const delivered = await status(db, order.id, 'delivered'); assert.equal(delivered.code, 409); assert.equal(delivered.body.error, 'use_verified_proof_completion_endpoint')
  assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-36 rightful customer reads original transaction snapshots after current product changes', async () => {
  const db = fixture(), order = await heldOrder(db), savedItem = db.rows('items')[0]
  Object.assign(db.tables.products.get(PRODUCT_A), { name: '已改名', price_cents: 9900, active: false })
  const own = await ownOrder(db, order.id, 'customer-a')
  assert.equal(own.code, 200); assert.equal(own.body.order.totalCents, 1200)
  assert.equal(own.body.items[0].name, savedItem.product_name); assert.equal(own.body.items[0].unitPriceCents, 1200)
  assert.equal(own.body.items[0].orderItemId, savedItem.id); assert.equal(own.body.order.contactSnapshot.receiverName, '测试顾客')
  assert.equal((await ownOrder(db, order.id, 'customer-b')).code, 404); db.assertClosed()
})

run('P7-37 mixed finite/unlimited multi-product order locks in UUID order and reserves only finite stock', async () => {
  const db = fixture(); db.tables.products.get(PRODUCT_B).stock_mode = 'unlimited'; db.tables.products.get(PRODUCT_B).stock_quantity = 0
  const res = await checkout(db, { data: payload([{ productId: PRODUCT_B, quantity: 20 }, { productId: PRODUCT_A, quantity: 2 }]) })
  assert.equal(res.code, 201); assert.equal(res.body.totalCents, 26400)
  const read = db.trace.find(q => q.sql.includes('FROM products p WHERE'))
  assert.deepEqual(read.args, [STORE_A, [PRODUCT_A, PRODUCT_B]]); assert.match(read.sql, /ORDER BY p.id FOR UPDATE$/)
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 8); assert.equal(db.tables.products.get(PRODUCT_B).stock_quantity, 0)
  assert.equal(db.rows('reservations')[0].product_id, PRODUCT_A); assert.equal(db.rows('movements')[0].product_id, PRODUCT_A)
  counts(db, { orders: 1, items: 2 })
})

run('P7-38 missing or malformed idempotency key is rejected before any transaction', async () => {
  const db = fixture(), before = snapshot(db)
  for (const invalid of [undefined, '', 'short', 'x'.repeat(101), 'invalid key with spaces 12345']) {
    const req = request(db, 'customer-a', payload()), res = response()
    if (invalid === undefined) delete req.headers['idempotency-key']; else req.headers['idempotency-key'] = invalid
    assert.equal(await checkoutRoute(req, res, new URL('http://unit.invalid/v1/stores/alpha/orders'), db), true)
    assert.equal(res.code, 400); assert.equal(res.body.error, 'invalid_checkout')
  }
  assert.equal(db.clients.length, 0); assert.deepEqual(snapshot(db), before)
})

run('P7-39 business closing while waiting for product read is rechecked before inserting order', async () => {
  const db = fixture(), gate = db.pauseOnce(s => s.includes('FROM products p WHERE')), before = snapshot(db)
  const pending = checkout(db); await gate.entered; db.now = new Date('2026-10-26T15:59:00Z'); gate.release()
  const res = await pending; assert.equal(res.code, 409); assert.equal(res.body.error, 'store_closed')
  assert.equal(db.trace.filter(q => q.sql === 'SELECT clock_timestamp() AS now').length, 2)
  assert.deepEqual(snapshot(db), before); db.assertClosed()
})

run('P7-40 replenishing cancelled hold does not clear merchant manual sold-out flag', async () => {
  const db = fixture(), order = await heldOrder(db); db.tables.products.get(PRODUCT_A).sold_out = true
  assert.equal((await status(db, order.id, 'cancelled')).code, 200)
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 10); assert.equal(db.tables.products.get(PRODUCT_A).sold_out, true); db.assertClosed()
})

run('P7-41 worker audit insertion failure rolls back expiry release and can be retried safely', async () => {
  const db = fixture(), order = await heldOrder(db); db.now = new Date(+order.inventory_expires_at + 1); db.sweepCandidates.add(order.id)
  const before = snapshot(db); db.failOnce(s => s.startsWith('INSERT INTO order_status_events('))
  await assert.rejects(sweepInventory(db), /phase7_injected_database_failure/)
  assert.deepEqual(snapshot(db), before); db.assertClosed()
  assert.equal(await sweepInventory(db), 1); assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 10)
  assert.equal(db.rows('movements').filter(m => m.delta > 0).length, 1); db.assertClosed()
})

run('P7-42 selected paid hold is committed by worker without another deduction or auto-refund', async () => {
  const db = fixture(), order = await paidOrder(db); db.sweepCandidates.add(order.id)
  assert.equal(await sweepInventory(db), 1)
  assert.equal(db.rows('orders')[0].inventory_state, 'committed'); assert.equal(db.rows('orders')[0].payment_status, 'paid')
  assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 9); assert.equal(db.rows('movements').find(m => m.source === 'payment').delta, 0)
  assert.equal(await sweepInventory(db), 0); db.assertClosed()
})

run('P7-43 selected failed-payment unpaid hold is released with the correct source, once', async () => {
  const db = fixture(), order = await heldOrder(db)
  // The SQL adapter supplies a selected payment_failed projection. This checks
  // resolution behavior, not the payment_events SQL subquery or payment provider.
  order.payment_failed = true; db.sweepCandidates.add(order.id)
  assert.equal(await sweepInventory(db), 1); assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, 10)
  assert.equal(db.rows('orders')[0].payment_status, 'unpaid'); assert.equal(db.rows('orders')[0].fulfillment_status, 'cancelled')
  assert.equal(db.rows('movements').find(m => m.source === 'payment_failed').delta, 1)
  assert.equal(await sweepInventory(db), 0); db.assertClosed()
})

for (const mode of ['finite', 'unlimited']) {
  for (const [from, next] of [['new', 'accepted'], ['accepted', 'preparing'], ['preparing', 'delivering']]) {
    run(`P7-44/${mode}/${from}->${next} unpaid fulfillment cannot bypass payment through inventory mode`, async () => {
      const db = fixture({ mode }), order = await heldOrder(db)
      // Later states are legacy-state fixtures, not newly authorized unpaid transitions.
      order.fulfillment_status = from
      assert.equal(order.payment_status, 'unpaid'); assert.equal(order.inventory_state, mode === 'finite' ? 'held' : 'none')
      const before = snapshot(db), res = await status(db, order.id, next)
      assert.equal(res.code, 409); assert.equal(res.body.error, 'payment_not_confirmed')
      assert.deepEqual(snapshot(db), before); assert.equal(db.rows('events').length, 0); db.assertClosed()
    })
  }
  run(`P7-45/${mode} paid fixture retains accept, prepare, dispatch and report-abnormal workflow`, async () => {
    const db = fixture({ mode }), order = await paidOrder(db), stock = db.tables.products.get(PRODUCT_A).stock_quantity
    for (const next of ['accepted', 'preparing', 'delivering', 'abnormal']) {
      const res = await status(db, order.id, next, { reason: '道路封闭，暂无法送达' })
      assert.equal(res.code, 200); assert.equal(res.body.status, next)
    }
    assert.equal(db.rows('orders')[0].payment_status, 'paid')
    assert.equal(db.rows('orders')[0].inventory_state, mode === 'finite' ? 'committed' : 'none')
    assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity, stock)
    assert.deepEqual(db.rows('events').map(e => [e.from_status, e.to_status]), [
      ['new', 'accepted'], ['accepted', 'preparing'], ['preparing', 'delivering'], ['delivering', 'abnormal']
    ])
    assert.equal(db.rows('events')[3].note, '道路封闭，暂无法送达'); db.assertClosed()
  })
}

run('P7-46 unlimited unpaid new or legacy accepted/preparing orders retain legal cancellation', async () => {
  for (const from of ['new', 'accepted', 'preparing']) {
    const db = fixture({ mode: 'unlimited' }), order = await heldOrder(db); order.fulfillment_status = from
    const res = await status(db, order.id, 'cancelled', { reason: '顾客要求取消' })
    assert.equal(res.code, 200); assert.equal(db.rows('orders')[0].fulfillment_status, 'cancelled')
    assert.equal(db.rows('orders')[0].payment_status, 'unpaid'); assert.equal(db.rows('orders')[0].inventory_state, 'none')
    assert.equal(db.rows('reservations').length, 0); assert.equal(db.rows('movements').length, 0)
    assert.deepEqual(db.rows('events').map(e => [e.actor, e.from_status, e.to_status, e.note]), [['owner-a', from, 'cancelled', '顾客要求取消']]); db.assertClosed()
  }
})

for (const payment of ['refunded', 'partially_refunded']) {
  run(`P7-47/${payment} is not a paid authorization for unlimited fulfillment`, async () => {
    const db = fixture({ mode: 'unlimited' }), order = await heldOrder(db); order.payment_status = payment
    const before = snapshot(db), res = await status(db, order.id, 'accepted')
    assert.equal(res.code, 409); assert.equal(res.body.error, 'payment_not_confirmed')
    assert.deepEqual(snapshot(db), before); db.assertClosed()
  })
}

run('P7-48 event adapter distinguishes SQL literals, escaped quotes, NULL and parameter positions', async () => {
  const db = fixture(), c = await db.connect()
  await c.query('BEGIN')
  await c.query("INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,'system:inventory','new','cancelled','库存释放, don''t  retry')", [STORE_A, 'literal-event-order'])
  await c.query('INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,$3,$4,$5,$6)', [STORE_A, 'parameter-event-order', 'owner-a', 'new', 'cancelled', '商家取消'])
  await c.query("INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,$3,'delivering','delivered',NULL)", [STORE_A, 'null-event-order', 'owner-a'])
  await c.query('COMMIT'); c.release()
  assert.deepEqual(db.rows('events').map(e => [e.order_id, e.actor, e.from_status, e.to_status, e.note]), [
    ['literal-event-order', 'system:inventory', 'new', 'cancelled', "库存释放, don't  retry"],
    ['parameter-event-order', 'owner-a', 'new', 'cancelled', '商家取消'],
    ['null-event-order', 'owner-a', 'delivering', 'delivered', null]
  ]); db.assertClosed()
})

for (const mode of ['finite', 'unlimited']) {
  run(`P7-49/${mode} unpaid legacy delivery cannot bypass payment to mark abnormal`, async () => {
    const db = fixture({ mode }), order = await heldOrder(db); order.fulfillment_status = 'delivering'
    const before = snapshot(db), res = await status(db, order.id, 'abnormal')
    assert.equal(res.code, 409); assert.equal(res.body.error, 'payment_not_confirmed')
    assert.deepEqual(snapshot(db), before); db.assertClosed()
  })
}
