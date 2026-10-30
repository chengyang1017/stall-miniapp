// Phase 50: isolated order-status transition regression tests.
// These use the actual route implementation with a mock transaction client.
import test from 'node:test'
import assert from 'node:assert/strict'

import { orderWorkflowRoute as route } from '../src/orderWorkflow.mjs'
const ID = '11111111-1111-4111-8111-111111111111'
const BASE = 'http://localhost/v1/merchant/stores/test-shop/orders/' + ID + '/status'

function setup({initial='new',payment='paid',failEvent=false}={}) {
  let state=initial, pendingState=initial
  const logs=[]
  const pool={
    query: async sql => { if(String(sql).includes('FROM auth_sessions'))return {rows:[{external_subject:'merchant-1'}]};if(String(sql).includes('FROM merchant_members'))return {rows:[{id:'store-1',role:'owner'}]};throw Error('Unexpected auth SQL') },
    connect: async () => ({
      async query(sql, args=[]) {
        logs.push(sql.trim().split(/\s+/).slice(0,4).join(' '))
        if(sql==='BEGIN'){pendingState=state;return {rows:[]}}
        if(sql==='COMMIT'){state=pendingState;return {rows:[]}}
        if(sql==='ROLLBACK'){pendingState=state;return {rows:[]}}
        if (/^SELECT \*,inventory_expires_at/.test(sql)) return {rows:[{id:ID,store_id:'store-1',fulfillment_status:state,payment_status:payment,inventory_state:'none',inventory_expired:false}]}
        if (/^UPDATE orders SET/i.test(sql)) {pendingState=args[2];return {rowCount:1,rows:[]}}
        if (/^INSERT INTO order_status_events/i.test(sql) && failEvent) throw Error('event_insert_failed')
        if (/^INSERT INTO order_status_events/i.test(sql))return {rows:[],rowCount:1}
        throw Error('Unexpected transaction SQL: '+sql)
      },
      release(){logs.push('RELEASE')}
    })
  }
  async function act(next, reason='', proofKey='') {
    const response={status:0,body:null,writeHead(code){this.status=code},end(text){this.body=JSON.parse(text)}}
    const req={method:'POST',headers:{authorization:'Bearer '+'A'.repeat(48)}, async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({status:next,reason,proofKey}))}}
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
  assert.equal(r.body.error,'use_verified_proof_completion_endpoint')
  assert.ok(!s.logs.some(x=>x.startsWith('UPDATE orders')))
  assert.equal(s.state,'delivering')
})

test('failed event insertion triggers rollback rather than commit', async () => {
  const s=setup({failEvent:true})
  await assert.rejects(s.act('accepted'), /event_insert_failed/)
  assert.ok(s.logs.includes('ROLLBACK'))
  assert.ok(!s.logs.includes('COMMIT'))
  assert.equal(s.state,'new','failed transaction must not publish accepted state')
  assert.ok(s.logs.some(x=>x.startsWith('INSERT INTO order_status_events')),'fault branch actually reached')
})

for(const [initial,next]of [['new','accepted'],['accepted','preparing'],['preparing','delivering'],['delivering','abnormal']])test(`unpaid ${initial} cannot advance to ${next}`,async()=>{
 const s=setup({initial,payment:'unpaid'}),r=await s.act(next,'test reason')
 assert.equal(r.status,409);assert.equal(r.body.error,'payment_not_confirmed');assert.equal(s.state,initial)
 assert.ok(s.logs.includes('ROLLBACK'));assert.ok(!s.logs.some(x=>x.startsWith('UPDATE orders')))
})
