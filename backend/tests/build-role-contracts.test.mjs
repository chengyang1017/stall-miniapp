// Works on the checked-in build manifest; no builds, network, runtime or DB required.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const manifest = JSON.parse(readFileSync(new URL('../../apps/build-targets.json', import.meta.url), 'utf8'))

const ownership = manifest.pages
const owned = role => Object.keys(ownership).filter(page => ownership[page] === role)

test('customer and merchant pages each have a declared owner', () => {
  assert.ok(owned('customer').length > 0)
  assert.ok(owned('merchant').length > 0)
  assert.ok(owned('combined').length > 0)
  for (const [page, role] of Object.entries(ownership)) {
    assert.match(page, /^pages\/[a-z0-9-/]+$/)
    assert.ok(['customer', 'merchant', 'combined'].includes(role), `${page}: unknown role`)
  }
})

test('GPS and review pages remain role-specific', () => {
  for (const name of ['tracking', 'reviews', 'support-chat', 'delivery-proof']) {
    assert.equal(ownership[`pages/customer-${name}/customer-${name}`], 'customer')
    assert.equal(ownership[`pages/merchant-${name}/merchant-${name}`], 'merchant')
  }
})

test('checkout and basket are customer-only, administration merchant-only', () => {
  assert.equal(ownership['pages/checkout/checkout'], 'customer')
  assert.equal(ownership['pages/cart/cart'], 'customer')
  assert.equal(ownership['pages/admin/admin'], 'merchant')
  assert.equal(ownership['pages/admin-orders/admin-orders'], 'merchant')
})
