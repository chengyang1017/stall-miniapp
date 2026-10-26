// Navigation regression checks against the committed miniprogram source.
// No WeChat calls, database, filesystem writes or remote requests.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const config = JSON.parse(read('miniprogram/app.json'))
const builds = JSON.parse(read('apps/build-targets.json'))
const registered = new Set(config.pages)
const customer = new Set(builds.targets.customer.pages)
const merchant = new Set(builds.targets.merchant.pages)
const combined = new Set(builds.targets.combined.pages)
const tabs = new Set(config.tabBar.list.map(x => x.pagePath))

function target(url) { return url.split('?')[0].replace(/^\//, '') }
function pageSource(page) {
  const base = `miniprogram/${page}`
  return { ts: read(`${base}.ts`), wxml: read(`${base}.wxml`) }
}

test('combined registration and three build target page sets agree', () => {
  assert.deepEqual([...combined].sort(), [...registered].sort())
  assert.equal(customer.size, builds.targets.customer.pages.length)
  assert.equal(merchant.size, builds.targets.merchant.pages.length)
  for (const page of [...customer, ...merchant]) assert.ok(registered.has(page), page)
  for (const page of customer) assert.ok(!merchant.has(page), `cross-role page: ${page}`)
})

test('all tabBar targets are registered and present in customer build', () => {
  assert.equal(tabs.size, 4)
  for (const page of tabs) {
    assert.ok(registered.has(page), `missing tab ${page}`)
    assert.ok(customer.has(page), `customer tab missing ${page}`)
  }
})

test('every literal navigator URL on registered pages has a valid page target', () => {
  let count = 0
  for (const page of registered) {
    const {wxml} = pageSource(page)
    for (const match of wxml.matchAll(/<navigator\b[^>]*\burl\s*=\s*["'](\/pages\/[^"'{}]+)["']/g)) {
      const dest = target(match[1])
      assert.ok(registered.has(dest), `${page} points to unregistered ${dest}`)
      count++
    }
  }
  assert.ok(count >= 12, `suspiciously few static navigator links: ${count}`)
})

test('customer profile static links stay in customer build', () => {
  const {wxml,ts} = pageSource('pages/profile/profile')
  for (const match of wxml.matchAll(/<navigator\b[^>]*\burl\s*=\s*["'](\/pages\/[^"'{}]+)["']/g)) {
    assert.ok(customer.has(target(match[1])), match[1])
  }
  assert.match(wxml, /bindtap="openOrders"/)
  assert.match(ts, /wx\.switchTab\(\{\s*url:\s*'\/pages\/orders\/orders'/)
  assert.ok(tabs.has('pages/orders/orders'))
})

test('merchant workbench static links stay in merchant build', () => {
  const {wxml} = pageSource('pages/admin/admin')
  for (const match of wxml.matchAll(/<navigator\b[^>]*\burl\s*=\s*["'](\/pages\/[^"'{}]+)["']/g)) {
    assert.ok(merchant.has(target(match[1])), match[1])
  }
})

test('switching from merchant workspace to customer uses the home tab', () => {
  const {ts,wxml} = pageSource('pages/admin/admin')
  assert.match(wxml, /bindtap="openCustomerShop"/)
  assert.match(ts, /openCustomerShop\(\)/)
  assert.match(ts, /wx\.switchTab\(\{url:'\/pages\/index\/index'\}\)/)
  assert.ok(tabs.has('pages/index/index'))
})

test('profile merchant shortcut is gated by verified authorization', () => {
  const {ts,wxml} = pageSource('pages/profile/profile')
  assert.match(wxml, /wx:if="\{\{merchantAuthorized\}\}"[^>]*bindtap="openMerchant"/)
  assert.match(ts, /if\(!this\.data\.merchantAuthorized\|\|this\.merchantOpening\)return/)
  assert.match(ts, /await authorizedGet\(/)
  assert.match(ts, /Array\.isArray\(result\.items\)/)
  assert.match(ts, /wx\.navigateTo\(\{url:'\/pages\/admin\/admin'\}\)/)
  assert.ok(merchant.has('pages/admin/admin'))
})

test('passive merchant session check cannot automatically navigate', () => {
  const {ts} = pageSource('pages/merchant-login/merchant-login')
  assert.match(ts, /this\.verifyExisting\(\)/)
  assert.match(ts, /async verifyExisting\(openWorkspace = false\)/)
  assert.match(ts, /if \(openWorkspace\)\s*\{[\s\S]*?wx\.navigateTo\(\{url:'\/pages\/admin\/admin'\}\)/)
  assert.match(ts, /await this\.verifyExisting\(true\)/)
})

test('customer-only build disables merchant workspace navigation', () => {
  const host = read('miniprogram/modules/customer/navigation.ts')
  const combinedHost = read('miniprogram/modules/integration/singleAppHost.ts')
  assert.match(host, /CAN_OPEN_MERCHANT=false/)
  assert.doesNotMatch(host, /wx\.navigateTo/)
  assert.match(combinedHost, /CAN_OPEN_MERCHANT=true/)
  assert.equal(builds.targets.customer.aliases['miniprogram/modules/integration/singleAppHost.ts'], 'miniprogram/modules/customer/navigation.ts')
})

test('role-specific chat, proof, reviews and tracking destinations are registered', () => {
  for (const feature of ['support-chat', 'delivery-proof', 'reviews', 'tracking']) {
    for (const [prefix, pages] of [['customer', customer], ['merchant', merchant]]) {
      const path = `pages/${prefix}-${feature}/${prefix}-${feature}`
      assert.ok(pages.has(path), path)
      assert.ok(registered.has(path), path)
      assert.ok(existsSync(resolve(root, `miniprogram/${path}.ts`)), path)
    }
  }
})
