// Phase 33 / batch 2: execute the real orderWorkflowRoute with a stateful,
// isolated DB fake. No server import, workers, network, or production writes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/orderWorkflow.mjs', import.meta.url), 'utf8')
// Only replace the dependency imports; the route's implementation is not edited.
const imports = source.match(/^import .*$/gm) || []
assert.ok(imports.some(line => line.includes("'./auth.mjs'")), 'auth import changed; update test adapter')
const injected = `
let actor = 'merchant';
const authenticate = async () => actor;
const permittedStore = async (_db, who, slug) => who === 'merchant' && slug === 'stall-demo'
  ? { id: 'store-1', role: 'owner' } : null;
const pageScope = () => ''; const pageQuery = () => ({}); const pageResult = () => ({});
const cursorTime = () => ''; const resolveOrderInventory = async () => {};
const randomUUID = () => ''; const registerImage = () => {};
const privateProofBucket = () => null; const headImage = () => {};
const merchantOrderCounts = () => {}; const merchantOrderQuery = () => {};
class S3Client {}; class PutObjectCommand {}; class HeadObjectCommand {}; class GetObjectCommand {};
const getSignedUrl = () => {};
export function setActor(value) { actor = value; }
`
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(injected + source.replace(/^import .*$/gm, '')).toString('base64')
const { orderWorkflowRoute, setActor } = await import(moduleUrl)

const ORDER = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'
function fakeDb() {
  const order = {
    id: ORDER, store_id: 'store-1', customer_subject: 'alice',
    fulfillment_status: 'accepted', payment_status: 'unpaid',
    estimated_arrival: '19:00', merchant_note: '', merchant_note_version: 1,
    total_cents: 1800, inventory_state: 'none', delivery_proof_key: null,
    contact_snapshot: { receiverName: 'A', phone: '10000' },
    delivery_slot_snapshot: { id: 'slot-1' }
  }
  const calls = []
  return {
    order, calls,
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params })
      if (sql.includes('UPDATE orders SET estimated_arrival=')) {
        if (params[0] !== 'store-1' || params[1] !== ORDER || !['accepted','preparing','delivering'].includes(order.fulfillment_status)) return { rows: [] }
        order.estimated_arrival = params[2]
        return { rows: [{ id: ORDER, estimatedArrival: order.estimated_arrival }] }
      }
      if (sql.includes('UPDATE orders SET merchant_note=')) {
        if (params[0] !== 'store-1' || params[1] !== ORDER || params[3] !== order.merchant_note_version) return { rows: [] }
        order.merchant_note = params[2]
        order.merchant_note_version++
        return { rows: [{ note: order.merchant_note, version: order.merchant_note_version }] }
      }
      if (sql.includes('FROM orders o JOIN stores s') && sql.includes('o.customer_subject=$3')) {
        return { rows: params[0] === 'stall-demo' && params[1] === ORDER && params[2] === order.customer_subject
          ? [{ id: ORDER, paymentStatus: order.payment_status, fulfillmentStatus: order.fulfillment_status,
               estimatedArrival: order.estimated_arrival, totalCents: order.total_cents,
               contactSnapshot: order.contact_snapshot, deliverySlotSnapshot: order.delivery_slot_snapshot }]
          : [] }
      }
      if (sql.includes('FROM order_items oi WHERE oi.order_id=$1')) {
        return { rows: params[0] === ORDER ? [{ orderItemId: ITEM, productId: ITEM, name: 'Rice', quantity: 1, lineTotalCents: 1800 }] : [] }
      }
      throw Error('Unexpected query in contract fake: ' + sql.slice(0, 130))
    }
  }
}
function request(method, body) {
  const raw = body ? JSON.stringify(body) : ''
  return { method, headers: { 'content-length': String(Buffer.byteLength(raw)) }, async *[Symbol.asyncIterator]() { if (raw) yield Buffer.from(raw) } }
}
async function call(db, actor, method, path, body) {
  setActor(actor)
  const res = { status: 0, body: null, writeHead(code) { this.status = code }, end(raw) { this.body = JSON.parse(raw) } }
  assert.equal(await orderWorkflowRoute(request(method,body),res,new URL('http://localhost'+path),db),true)
  return res
}
const merchant = suffix => `/v1/merchant/stores/stall-demo/orders/${ORDER}${suffix}`
const customer = () => `/v1/stores/stall-demo/orders/${ORDER}`

test('merchant ETA change is visible in the same customer order (no duplicated order state)', async () => {
  const db = fakeDb()
  const update = await call(db,'merchant','PUT',merchant('/eta'),{estimatedArrival:'19:45'})
  assert.equal(update.status,200)
  const seen = await call(db,'alice','GET',customer())
  assert.equal(seen.status,200)
  assert.equal(seen.body.order.estimatedArrival,'19:45')
  assert.equal(seen.body.items[0].name,'Rice')
  assert.equal(seen.body.order.totalCents,1800)
})

test('another customer cannot read order detail or item snapshots', async () => {
  const db = fakeDb()
  const res = await call(db,'bob','GET',customer())
  assert.equal(res.status,404)
  assert.equal(db.calls.filter(c=>c.sql.includes('FROM order_items oi')).length,0)
})

test('merchant internal note is not exposed in customer detail or overwritten by ETA', async () => {
  const db = fakeDb()
  const note = await call(db,'merchant','PUT',merchant('/note'),{note:'Internal only',expectedVersion:1})
  assert.equal(note.status,200)
  const eta = await call(db,'merchant','PUT',merchant('/eta'),{estimatedArrival:'20:10'})
  assert.equal(eta.status,200)
  const seen = await call(db,'alice','GET',customer())
  assert.equal(seen.status,200)
  assert.equal(db.order.merchant_note,'Internal only')
  assert.equal(JSON.stringify(seen.body).includes('Internal only'),false)
})

test('stale merchant note version conflicts without changing customer order', async () => {
  const db = fakeDb()
  assert.equal((await call(db,'merchant','PUT',merchant('/note'),{note:'First',expectedVersion:1})).status,200)
  const stale = await call(db,'merchant','PUT',merchant('/note'),{note:'Stale',expectedVersion:1})
  assert.equal(stale.status,409)
  assert.equal(db.order.merchant_note,'First')
  assert.equal((await call(db,'alice','GET',customer())).status,200)
})

test('ordinary customer cannot call merchant ETA or note routes', async () => {
  const db = fakeDb()
  assert.equal((await call(db,'alice','PUT',merchant('/eta'),{estimatedArrival:'now'})).status,403)
  assert.equal((await call(db,'alice','PUT',merchant('/note'),{note:'tamper',expectedVersion:1})).status,403)
  assert.equal(db.calls.length,0)
})
