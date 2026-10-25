'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
// Node 24 has native TypeScript type stripping; no compiler package is required.
const { stripTypeScriptTypes } = require('node:module')
if (typeof stripTypeScriptTypes !== 'function') {
  throw new Error('Node 24 or later is required for this Phase 13 test loader')
}
const root = path.resolve(__dirname, '..')
function loadTs(relativePath, deps, wx) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const exported = [...source.matchAll(/^export function (\w+)/gm)].map(m => m[1])
  if (!exported.length) throw new Error('No exported functions in ' + relativePath)
  let runnable = source.replace(/^import \{ DemoOrder, loadDemoOrders \} from '\.\/orders'\s*$/m,
    "const { loadDemoOrders } = require('./orders')")
  runnable = runnable.replace(/^export function /gm, 'function ')
  runnable = stripTypeScriptTypes(runnable, { mode: 'strip' })
  runnable += '\nmodule.exports = { ' + exported.join(', ') + ' }\n'
  const module = { exports: {} }
  const context = { module, exports: module.exports, wx, Date, console, require: name => {
    if (!Object.prototype.hasOwnProperty.call(deps, name)) throw new Error('Unexpected dependency: ' + name)
    return deps[name]
  } }
  vm.runInNewContext(runnable, context, { filename: relativePath, timeout: 2000 })
  return module.exports
}
function memoryWx() {
  const data = new Map()
  return {
    data,
    getStorageSync: key => data.get(key),
    setStorageSync: (key, val) => data.set(key, structuredClone(val))
  }
}

test('minimum-order amount is rounded and shortfall respects cents', () => {
  const wx = memoryWx()
  const min = loadTs('miniprogram/utils/minimumOrder.ts', {}, wx)
  assert.equal(min.getMinimumOrder(), 0)
  min.saveMinimumOrder(20.005)
  assert.equal(min.getMinimumOrder(), 20.01)
  assert.equal(min.minimumOrderShortfall('19.99'), 0.02)
  assert.equal(min.minimumOrderShortfall('20.01'), 0)
  assert.equal(min.minimumOrderShortfall('20.50'), 0)
})

test('invalid minimum orders are rejected without altering saved setting', () => {
  const wx = memoryWx()
  const min = loadTs('miniprogram/utils/minimumOrder.ts', {}, wx)
  min.saveMinimumOrder(30)
  for (const v of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1000000]) {
    assert.throws(() => min.saveMinimumOrder(v))
    assert.equal(min.getMinimumOrder(), 30)
  }
  assert.equal(min.minimumOrderShortfall('not-a-number'), 30)
})

function workflowFixture({ withPhoto = false } = {}) {
  const wx = memoryWx()
  const orders = [{ id: 'order-a', fulfillmentStatus: 'new', ...(withPhoto ? { deliveryPhotoPath: 'wxfile://photo.jpg' } : {}) }]
  wx.setStorageSync('stall_demo_orders_v1', orders)
  const workflow = loadTs('miniprogram/utils/orderWorkflow.ts', {
    './orders': { loadDemoOrders: () => wx.getStorageSync('stall_demo_orders_v1') || [] }
  }, wx)
  const current = () => wx.getStorageSync('stall_demo_orders_v1')[0]
  return { wx, workflow, current }
}

test('orders cannot skip workflow states or update absent orders', () => {
  const { workflow, current } = workflowFixture()
  assert.equal(workflow.updateWorkflowOrder('missing', 'accepted'), false)
  assert.equal(workflow.updateWorkflowOrder('order-a', 'delivered'), false)
  assert.equal(workflow.updateWorkflowOrder('order-a', 'preparing'), false)
  assert.equal(current().fulfillmentStatus, 'new')
  assert.equal(workflow.updateWorkflowOrder('order-a', 'accepted'), true)
  assert.equal(workflow.updateWorkflowOrder('order-a', 'preparing'), true)
  assert.equal(workflow.updateWorkflowOrder('order-a', 'delivering'), true)
  assert.equal(current().fulfillmentStatus, 'delivering')
})

test('ETA is bounded and unavailable for new/delivered orders', () => {
  const { workflow, current } = workflowFixture({ withPhoto: true })
  assert.equal(workflow.updateWorkflowOrder('order-a', 'eta', 'soon'), false)
  assert.equal(workflow.updateWorkflowOrder('order-a', 'accepted'), true)
  assert.equal(workflow.updateWorkflowOrder('order-a', 'eta', 'x'.repeat(61)), false)
  assert.equal(workflow.updateWorkflowOrder('order-a', 'eta', '  15 min  '), true)
  assert.equal(current().estimatedArrival, '15 min')
  assert.equal(workflow.updateWorkflowOrder('order-a', 'preparing'), true)
  assert.equal(workflow.updateWorkflowOrder('order-a', 'delivering'), true)
  assert.equal(workflow.updateWorkflowOrder('order-a', 'delivered'), true)
  assert.ok(current().deliveredAt)
  assert.equal(workflow.updateWorkflowOrder('order-a', 'eta', 'later'), false)
})

test('marking an order delivered requires a saved delivery photo', () => {
  const { workflow, current } = workflowFixture()
  for (const status of ['accepted', 'preparing', 'delivering']) assert.equal(workflow.updateWorkflowOrder('order-a', status), true)
  assert.equal(workflow.updateWorkflowOrder('order-a', 'delivered'), false)
  assert.equal(current().fulfillmentStatus, 'delivering')
  assert.equal(current().deliveredAt, undefined)
})
