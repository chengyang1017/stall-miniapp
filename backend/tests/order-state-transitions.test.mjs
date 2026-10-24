// Phase 50: isolated order-status transition regression tests.
// These use the actual route implementation with a mock transaction client.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/orderWorkflow.mjs', import.meta.url), 'utf8')
const withoutAuthImport = source.replace(/^import\s+\{\s*authenticate\s*,\s*permittedStore\s*\}\s+from\s+['"]\.\/auth\.mjs['"]\s*;?\s*$/m, '')
assert.notEqual(withoutAuthImport, source, 'Expected route auth import is present')
const moduleText = 'const authenticate = async () => "merchant-1";\nconst permittedStore = async () => ({id:"store-1",role:"owner"});\n' + withoutAuthImport.replace(/^import\s+[^\n]+$/gm, '')
const routeModule = await import('data:text/javascript;base64,' + Buffer.from(moduleText).toString('base64'))
const route = routeModule.orderWorkflowRoute
const ID = '11111111-1111-4111-8111-111111111111'
const BASE = 'http://localhost/v1/merchant/stores/test-shop/orders/' + ID + '/status'

function setup({initial='new',payment='paid',failEvent=false}={}) {
  let state=initial
  const logs=[]
  const pool={
    query: async () => ({rows:[]}),
    connect: async () => ({
      async query(sql, args=[]) {
        logs.push(sql.trim().split(/\s+/).slice(0,4).join(' '))
        if (/^SELECT fulfillment_status,payment_status/i.test(sql)) return {rows:[{fulfillment_status:state,payment_status:payment}]}
        if (/^UPDATE orders SET/i.test(sql)) {state=args[2];return {rowCount:1,rows:[]}}
        if (/^INSERT INTO order_status_events/i.test(sql) && failEvent) throw Error('event_insert_failed')
        return {rows:[],rowCount:1}
      },
      release(){logs.push('RELEASE')}
    })
  }
  async function act(next, reason='', proofKey='') {
    const response={status:0,body:null,writeHead(code){this.status=code},end(text){this.body=JSON.parse(text)}}
    const req={method:'POST',headers:{}, async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({status:next,reason,proofKey}))}}
    await route(req,response,new URL(BASE),pool)
    return response
  }
  return {act, logs, get state(){return state}}
}

test('new -> accepted persists and writes status event within transaction', async () => {
  const s=setup()
  const r=await s.act('accepted')
  assert.equal(r.status,200)
  assert.equal(s.state,'accepted')
  assert.ok(s.logs.some(x=>x.startsWith('INSERT INTO order_status_events')))
  assert.ok(s.logs.includes('COMMIT'))
})

test('a stale action cannot skip the current order state', async () => {
  const s=setup({initial:'new'})
  const r=await s.act('delivering')
  assert.equal(r.status,409)
  assert.equal(s.state,'new')
  assert.ok(s.logs.includes('ROLLBACK'))
})

test('repeated accepted action is refused once state has advanced', async () => {
  const s=setup({initial:'new'})
  assert.equal((await s.act('accepted')).status,200)
  assert.equal((await s.act('accepted')).status,409)
  assert.equal(s.state,'accepted')
})

test('cancellation requires a reason and is not permitted after delivery', async () => {
  const x=setup({initial:'preparing'})
  assert.equal((await x.act('cancelled')).status,400)
  assert.equal((await x.act('cancelled','customer requested')).status,200)
  const y=setup({initial:'delivered'})
  assert.equal((await y.act('cancelled','too late')).status,409)
})

test('unpaid order cannot transition to delivered even with proof key', async () => {
  const s=setup({initial:'delivering',payment:'unpaid'})
  const r=await s.act('delivered','', 'delivery-proofs/12345678')
  assert.equal(r.status,409)
  assert.equal(r.body.error,'payment_not_confirmed')
  assert.equal(s.state,'delivering')
})

test('failed event insertion triggers rollback rather than commit', async () => {
  const s=setup({failEvent:true})
  await assert.rejects(s.act('accepted'), /event_insert_failed/)
  assert.ok(s.logs.includes('ROLLBACK'))
  assert.ok(!s.logs.includes('COMMIT'))
})
