// Phase 33 mutation audit: prove existing checkout tests detect deliberate regressions.
// Mutations are confined to os.tmpdir(); repository files are never rewritten.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const source = readFileSync(new URL('../src/checkout.mjs', import.meta.url), 'utf8')
const regressionTests = readFileSync(new URL('./merchant-customer-catalog-checkout.test.mjs', import.meta.url), 'utf8')
const mutations = [
  {
    name: 'removing the inactive-product rejection must be caught',
    before: '!p.active||p.sold_out',
    after: 'p.sold_out',
  },
  {
    name: 'removing the sold-out rejection must be caught',
    before: '!p.active||p.sold_out',
    after: '!p.active',
  },
  {
    name: 'ignoring an active merchant discount must be caught',
    before: 'priceCents:(byId.get(i.productId).discount_price_cents !== null &&',
    after: 'priceCents:(false && byId.get(i.productId).discount_price_cents !== null &&',
  },
  {
    name: 'replacing server pricing with one cent must be caught',
    before: 'const total=lines.reduce((sum,i)=>sum+i.priceCents*i.quantity,0)',
    after: 'const total=lines.reduce((sum,i)=>sum+i.quantity,0)',
  },
  {
    name: 'removing the finite-stock precheck must be caught',
    before: "stock_quantity<item.quantity",
    after: 'stock_quantity<0',
  },
  {
    name: 'bypassing checkout idempotency must be caught',
    before: 'if(existing.rows.length){',
    after: 'if(false && existing.rows.length){',
  },
  {
    name: 'falsely returning paid checkout status must be caught',
    before: "paymentStatus:'unpaid',inventoryState:",
    after: "paymentStatus:'paid',inventoryState:",
  },
]

function runIsolated(candidate) {
  const dir = mkdtempSync(join(tmpdir(), 'stall-checkout-mutation-'))
  try {
    mkdirSync(join(dir, 'src'))
    mkdirSync(join(dir, 'tests'))
    writeFileSync(join(dir, 'src', 'checkout.mjs'), candidate)
    writeFileSync(join(dir, 'tests', 'merchant-customer-catalog-checkout.test.mjs'), regressionTests)
    const result = spawnSync(process.execPath, [
      // A nested `node --test` runner is rejected when this file is itself run by node:test.
      // Run the standalone test module directly; node:test still emits TAP summaries.
      '--test-reporter=tap',
      join(dir, 'tests', 'merchant-customer-catalog-checkout.test.mjs'),
    ], { encoding: 'utf8', timeout: 20000, env: { ...process.env, NODE_OPTIONS: '', NODE_TEST_CONTEXT: undefined } })
    const output = (result.stdout || '') + '\n' + (result.stderr || '')
    assert.equal(result.error, undefined, `Test process failed to launch: ${result.error}`)
    // An import error or JS syntax failure is NOT evidence of mutation detection.
    assert.match(output, /^# tests 8$/m, `Regression suite did not execute all eight tests:\n${output.slice(-1400)}`)
    return { code: result.status, output }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function singleReplacement(original, before, after) {
  const occurrences = original.split(before).length - 1
  assert.equal(occurrences, 1,
    `Source changed: expected exactly one matching mutation target (${before}), found ${occurrences}`)
  return original.replace(before, after)
}

test('baseline: eight existing checkout regression tests pass without mutation', () => {
  const r = runIsolated(source)
  assert.equal(r.code, 0, r.output.slice(-1800))
  assert.match(r.output, /^# fail 0$/m)
})

for (const mutation of mutations) {
  test(`mutation killed: ${mutation.name}`, () => {
    const mutated = singleReplacement(source, mutation.before, mutation.after)
    assert.notEqual(mutated, source)
    const r = runIsolated(mutated)
    assert.notEqual(r.code, 0, `Mutant SURVIVED; regression tests still pass:\n${r.output.slice(-2000)}`)
    assert.match(r.output, /^not ok \d+/m,
      `Mutant rejected without a failing test assertion:\n${r.output.slice(-1600)}`)
    assert.match(r.output, /^# fail [1-9]\d*$/m)
  })
}
