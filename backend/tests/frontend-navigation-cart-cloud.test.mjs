// Actual cart Page, cloudCart and cloudCheckout functions in isolated VMs.
// Only WeChat I/O, remote product transport, presentation and demo repository are fake.
// No network, database, real storage, compiler subprocess or production side effects.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = fileURLToPath(new URL('../../', import.meta.url))
const productId = 'bb492b5b-991e-4206-8b8c-8fac59ad07a5'
const product = { id: productId, name: '动画', priceCents: 1500, soldOut: false, active: true, stockMode: 'unlimited' }
const clone = value => JSON.parse(JSON.stringify(value))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
const rules = (extra = {}) => ({ accepting: true,
  days: Array.from({ length: 7 }, () => ({ enabled: true, start: '00:00', end: '23:59' })),
  areas: [{ id: 'area-a', name: '配送区域', enabled: true }],
  slots: [{ id: 'slot-a', label: '下午配送', start: '13:00', end: '18:00', enabled: true }],
  business: { minimumOrderCents: 2000 }, serverNow: '2026-10-27T04:00:00.000Z', ...extra })

// Strip TypeScript before VM evaluation, then adapt only static module syntax.
// This executes source bodies rather than copying checkout or cart algorithms.
function javascript(file) {
  let js = stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'strip', sourceUrl: file })
  const bindings = list => list.split(',').map(s => s.trim()).filter(Boolean)
    .map(s => s.replace(/\s+as\s+/, ': ')).join(', ')
  js = js.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/gm,
    (_, list, spec) => `const {${bindings(list)}} = require(${JSON.stringify(spec)});`)
  js = js.replace(/^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm,
    (_, list, spec) => list.split(',').map(s => {
      const [original, alias = original] = s.trim().split(/\s+as\s+/)
      return `exports.${alias} = require(${JSON.stringify(spec)}).${original};`
    }).join('\n'))
  const exports = []
  js = js.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\s+(\w+))/gm,
    (_, name) => { exports.push(name); return '' })
  assert.doesNotMatch(js, /^\s*(?:import|export)\b/m, 'Unsupported module syntax: ' + file)
  return js + '\n' + exports.map(name => `exports.${name} = ${name};`).join('\n')
}

function fixture() {
  const storage = new Map([
    ['stall_cloud_catalog_config_v1', { apiBase: 'https://cart.invalid', storeSlug: 'store-a' }],
    ['stall_server_session_v1', 'synthetic-customer-a'],
    ['stall_server_cache_scope_v1', 'a'.repeat(64)],
    ['stall_cart_v1', [{ productId: 'demo', quantity: 1 }]]
  ])
  const products = [], requests = [], navigations = [], toasts = [], writes = [], storageWrites = []
  let definition
  const wx = {
    getStorageSync: key => storage.has(key) ? clone(storage.get(key)) : '',
    setStorageSync(key, value) { storageWrites.push(key); storage.set(key, clone(value)) },
    removeStorageSync(key) { storageWrites.push(key); storage.delete(key) },
    setTabBarBadge() {}, removeTabBarBadge() {},
    getSystemInfoSync: () => ({ platform: 'devtools' }),
    request(options) {
      assert.equal(options.method, 'GET')
      assert.ok(options.url.endsWith('/delivery-rules'))
      let settled = false
      requests.push({ options,
        resolve(data) { assert.equal(settled, false); settled = true; options.success({ statusCode: 200, data }) },
        reject() { assert.equal(settled, false); settled = true; options.fail(Error('synthetic offline')) } })
    },
    showToast: value => toasts.push(value.title),
    navigateTo: value => navigations.push(value.url)
  }
  const cache = new Map(), mocks = new Map()
  const mock = (file, value) => mocks.set(path.resolve(root, file), value)
  mock('miniprogram/utils/remoteApi.ts', { getRemoteProducts(apiBase, storeSlug, ids) {
    const gate = deferred(); products.push({ ...gate, apiBase, storeSlug, ids: Array.from(ids) }); return gate.promise
  } })
  mock('miniprogram/modules/shared/runtime/auth.ts', { localDevAllowed: () => false })
  mock('miniprogram/utils/storePresentation.ts', {
    currentPresentation: () => ({ placeholderStyle: 'premium', customPlaceholderUrl: '' }),
    refreshPagePresentation() {},invalidatePagePresentation() {}
  })
  mock('miniprogram/utils/addresses.ts', { getSelectedAddress: () => undefined })
  mock('miniprogram/utils/directPurchase.ts', { clearDirectPurchase() {} })
  mock('miniprogram/modules/customer/demo/settings.ts', { getMinimumOrder: () => 0, minimumOrderShortfall: () => 0 })
  const context = vm.createContext({ wx, Page: value => { definition = value },
    fetch() { assert.fail('Real network is forbidden') } })
  function load(file) {
    file = path.resolve(file)
    if (mocks.has(file)) return mocks.get(file)
    if (cache.has(file)) return cache.get(file)
    assert.ok(file.startsWith(path.join(root, 'miniprogram') + path.sep))
    const exports = {}; cache.set(file, exports)
    const require = spec => { assert.ok(spec.startsWith('.')); return load(path.resolve(path.dirname(file), spec + '.ts')) }
    vm.runInContext(`(function(require,exports){${javascript(file)}\n})`, context, { filename: file, timeout: 1000 })(require, exports)
    return exports
  }
  const catalog = load(path.join(root, 'miniprogram/modules/shared/domain/catalog.ts'))
  const demo = load(path.join(root, 'miniprogram/modules/shared/domain/demoRules.ts'))
  mock('miniprogram/modules/customer/demo/catalog.ts', { ...catalog, ...demo,
    loadStore: () => ({ products: [{ id: 'demo', name: '本地商品', price: 7.5, available: true, discountPrice: null }] }) })
  const api = load(path.join(root, 'miniprogram/utils/cloudCart.ts'))
  const checkout = load(path.join(root, 'miniprogram/utils/cloudCheckout.ts'))
  api.writeCloudCart('store-a', [{ productId, quantity: 2 }])
  storageWrites.length = 0
  load(path.join(root, 'miniprogram/pages/cart/cart.ts'))
  assert.equal(typeof definition.refreshCloud, 'function')
  const p = { ...definition, data: clone(definition.data), setData(patch) { writes.push(clone(patch)); Object.entries(patch).forEach(([key,value])=>{const parts=key.match(/[^.[\]]+/g);let parent=this.data;parts.slice(0,-1).forEach((part,i)=>{if(parent[part]===undefined)parent[part]=/^\d+$/.test(parts[i+1])?[]:{};parent=parent[part]});parent[parts.at(-1)]=value}) } }
  return { p, api, checkout, products, requests, storage, writes, storageWrites, navigations, toasts,
    setConfig(value) { storage.set('stall_cloud_catalog_config_v1', value) },
    identity(value) { storage.set('stall_server_session_v1', value) },
    savedCart: () => clone([...storage].filter(([key]) => key.startsWith('stall_cloud_cart_v1') || key === 'stall_cart_v1')) }
}

test('cart: delivery unconfigured preserves 动画 × 2 / ¥30.00 and blocks checkout without storage deletion', async () => {
  const f = fixture(), saved = f.savedCart(), pending = f.p.refreshCloud()
  f.products[0].resolve([product]); await tick()
  assert.equal(f.p.data.items[0].name, '动画'); assert.equal(f.p.data.items[0].quantity, 2)
  assert.equal(f.p.data.items[0].subtotalText, '30.00'); assert.equal(f.p.data.totalText, '30.00')
  f.requests[0].resolve({ configured: false, rules: null }); await pending
  assert.equal(f.p.data.totalCount, 2); assert.equal(f.p.data.cloudError, '')
  assert.match(f.p.data.deliveryError, /尚未配置云端配送规则/)
  assert.equal(f.p.data.cloudDeliveryReady, false); f.p.checkout()
  assert.deepEqual(f.navigations, []); assert.deepEqual(f.savedCart(), saved); assert.deepEqual(f.storageWrites, [])
})

test('cart: delivery failure arriving first cannot prevent a later catalog from rendering', async () => {
  const f = fixture(), pending = f.p.refreshCloud()
  f.requests[0].resolve({ configured: false }); await tick()
  assert.equal(f.p.data.cloudLoading, true); assert.equal(f.p.data.totalText, '--')
  f.products[0].resolve([product]); await pending
  assert.equal(f.p.data.totalText, '30.00'); assert.equal(f.p.data.items.length, 1)
  assert.match(f.p.data.deliveryError, /尚未配置/)
})

for (const deliveryFirst of [true, false]) test(`cart: configured delivery and real prices enable checkout (delivery first=${deliveryFirst})`, async () => {
  const f = fixture(), pending = f.p.refreshCloud()
  if (deliveryFirst) { f.requests[0].resolve({ configured: true, rules: rules() }); await tick(); f.products[0].resolve([product]) }
  else { f.products[0].resolve([product]); await tick(); f.p.checkout(); assert.deepEqual(f.navigations, []); f.requests[0].resolve({ configured: true, rules: rules() }) }
  await pending
  assert.equal(f.p.data.cloudError, ''); assert.equal(f.p.data.deliveryError, '')
  assert.equal(f.p.data.minimumOrderText, '20.00'); assert.equal(f.p.data.minimumReached, true)
  assert.equal(f.p.data.cloudDeliveryReady, true); assert.equal(f.p.data.cloudLoading, false)
  f.p.checkout(); assert.deepEqual(f.navigations, ['/pages/checkout/checkout'])
})

test('cart: catalog failure has a visible error and unknown total, never demo prices', async () => {
  const f = fixture(), saved = f.savedCart(), pending = f.p.refreshCloud()
  f.products[0].reject(Error('synthetic product failure')); await tick()
  assert.equal(f.p.data.cloudLoading, false); assert.match(f.p.data.cloudError, /云端商品读取失败/)
  f.requests[0].resolve({ configured: true, rules: rules() }); await pending
  assert.equal(f.p.data.totalText, '--'); assert.equal(f.p.data.items.length, 0)
  assert.equal(f.p.data.minimumReached, false); f.p.checkout()
  assert.deepEqual(f.navigations, []); assert.deepEqual(f.savedCart(), saved)
})

test('cart: product and delivery failures keep independent error messages', async () => {
  const f = fixture(), pending = f.p.refreshCloud()
  f.products[0].reject(Error('catalog offline')); f.requests[0].reject(); await pending
  assert.match(f.p.data.cloudError, /商品读取失败/); assert.match(f.p.data.deliveryError, /配送规则读取失败/)
  assert.equal(f.p.data.totalText, '--'); assert.equal(f.p.data.cloudDeliveryReady, false)
})

test('cart: invalid remote prices cannot become NaN or local fallback prices', async () => {
  const f = fixture(), pending = f.p.refreshCloud()
  f.products[0].resolve([{ ...product, priceCents: 'invalid' }]); f.requests[0].resolve({ configured: true, rules: rules() }); await pending
  assert.match(f.p.data.cloudError, /商品读取失败/); assert.equal(f.p.data.totalText, '--')
  assert.equal(f.api.readCloudCart('store-a')[0].quantity, 2)
})

test('cart: store paused retains priced items but denies checkout', async () => {
  const f = fixture(), pending = f.p.refreshCloud()
  f.products[0].resolve([product]); f.requests[0].resolve({ configured: true, rules: rules({ accepting: false }) }); await pending
  assert.equal(f.p.data.totalText, '30.00'); assert.match(f.p.data.deliveryError, /暂停接单/)
  assert.equal(f.p.data.cloudDeliveryReady, false); f.p.checkout(); assert.deepEqual(f.navigations, [])
})

test('cart: invalid delivery minimum is a delivery error, not a catalog error', async () => {
  const f = fixture(), pending = f.p.refreshCloud()
  f.requests[0].resolve({ configured: true, rules: rules({ business: { minimumOrderCents: 'invalid' } }) }); await tick()
  f.products[0].resolve([product]); await pending
  assert.equal(f.p.data.items[0].name, '动画'); assert.equal(f.p.data.totalText, '30.00')
  assert.equal(f.p.data.cloudError, ''); assert.match(f.p.data.deliveryError, /配送规则读取失败/)
  assert.equal(f.p.data.cloudDeliveryReady, false); f.p.checkout(); assert.deepEqual(f.navigations, [])
})

for (const change of ['identity', 'store', 'endpoint']) test(`cart: stale ${change} responses cannot overwrite the new request or its loading state`, async () => {
  const f = fixture(), first = f.p.refreshCloud()
  if (change === 'identity') f.identity('synthetic-customer-b')
  else f.setConfig({ apiBase: change === 'endpoint' ? 'https://other.invalid' : 'https://cart.invalid', storeSlug: change === 'store' ? 'store-b' : 'store-a' })
  f.api.writeCloudCart(change === 'store' ? 'store-b' : 'store-a', [{ productId, quantity: 2 }])
  const second = f.p.refreshCloud(), snapshot = clone(f.p.data), writeCount = f.writes.length
  f.products[0].resolve([{ ...product, name: '过期商品' }]); f.requests[0].reject(); await first
  assert.deepEqual(clone(f.p.data), snapshot); assert.equal(f.writes.length, writeCount)
  assert.equal(f.p.data.cloudLoading, true); assert.equal(f.p.data.deliveryLoading, true)
  f.products[1].resolve([product]); f.requests[1].resolve({ configured: true, rules: rules() }); await second
  assert.equal(f.p.data.items[0].name, '动画'); assert.equal(f.p.data.totalText, '30.00')
})

test('cart: a stale catalog rejection cannot clear newer loaded items', async () => {
  const f = fixture(), first = f.p.refreshCloud(), second = f.p.refreshCloud()
  f.products[1].resolve([product]); f.requests[1].resolve({ configured: true, rules: rules() }); await second
  const snapshot = clone(f.p.data)
  f.products[0].reject(Error('old product failure')); f.requests[0].resolve({ configured: false }); await first
  assert.deepEqual(clone(f.p.data), snapshot)
})

for (const lifecycle of ['onHide', 'onUnload']) test(`cart: ${lifecycle} invalidates both pending branches`, async () => {
  const f = fixture(), pending = f.p.refreshCloud(); f.p[lifecycle]()
  const snapshot = clone(f.p.data), writes = f.writes.length
  f.products[0].resolve([product]); f.requests[0].resolve({ configured: true, rules: rules() }); await pending
  assert.equal(f.writes.length, writes); assert.deepEqual(clone(f.p.data), snapshot)
})

test('cart: cloud-to-demo switch ignores old results and retains both persisted carts', async () => {
  const f = fixture(), saved = f.savedCart(), pending = f.p.refreshCloud(); f.setConfig(null); f.p.refresh()
  const snapshot = clone(f.p.data)
  assert.equal(f.p.data.cloudMode, false); assert.equal(f.p.data.items[0].name, '本地商品')
  f.products[0].resolve([product]); f.requests[0].reject(); await pending
  assert.deepEqual(clone(f.p.data), snapshot); assert.deepEqual(f.savedCart(), saved)
})

test('cart: checkout rejects a loaded view after identity changes even before onShow', async () => {
  const f = fixture(), pending = f.p.refreshCloud()
  f.products[0].resolve([product]); f.requests[0].resolve({ configured: true, rules: rules() }); await pending
  f.identity('synthetic-customer-b'); f.p.checkout(); await tick()
  assert.deepEqual(f.navigations, []); assert.match(f.toasts.at(-1), /账号或店铺已变化/)
  assert.equal(f.p.data.items.length, 0)
  f.requests[1].resolve({ configured: false }); await tick()
})

test('cart: a retry can restore configured delivery without changing stored quantities', async () => {
  const f = fixture(), saved = f.savedCart(), first = f.p.refreshCloud()
  f.products[0].resolve([product]); f.requests[0].resolve({ configured: false }); await first
  const next = f.p.refreshCloud(); f.products[1].resolve([product]); f.requests[1].resolve({ configured: true, rules: rules() }); await next
  assert.equal(f.p.data.deliveryError, ''); assert.equal(f.p.data.cloudDeliveryReady, true)
  assert.equal(f.p.data.totalText, '30.00'); assert.deepEqual(f.savedCart(), saved)
})

test('checkout service still rejects unconfigured delivery independently of cart display', async () => {
  const f = fixture(), pending = assert.rejects(f.checkout.loadCloudCheckout(), /尚未配置云端配送规则/)
  f.products[0].resolve([product]); f.requests[0].resolve({ configured: false }); await pending
  assert.equal(f.api.readCloudCart('store-a')[0].quantity, 2)
})

test('cart template exposes errors and disables checkout when delivery is unavailable', () => {
  const wxml = readFileSync(path.join(root, 'miniprogram/pages/cart/cart.wxml'), 'utf8')
  assert.match(wxml, /\{\{cloudError\}\}/); assert.match(wxml, /\{\{deliveryError\}\}/)
  assert.match(wxml, /disabled="[^"\n]*!cloudDeliveryReady/)
  assert.match(wxml, /items\.length === 0 && !cloudLoading && !cloudError/)
})
