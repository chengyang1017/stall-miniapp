import test from 'node:test'
import assert from 'node:assert/strict'
import {createPaymentGateway} from '../src/paymentGateway.mjs'
import {settleVerifiedOrderPayment} from '../src/paymentSettlementTransaction.mjs'
const id='11111111-1111-4111-8111-111111111111'
const request={orderId:id,amountCents:1599,currency:'CNY',requestKey:'attempt-1'}
const baseOrder={id,store_id:'shop-1',total_cents:'1599',currency:'CNY',payment_status:'unpaid',
 fulfillment_status:'new',inventory_state:'none',payment_window_open:true}
const event=async(mode='sandbox')=>{
 const gateway=createPaymentGateway({provider:'gateway',mode,createPayment:async()=>({}),
 verifyNotification:async()=>({verifiedByProvider:true,provider:'gateway',mode,
 orderId:id,amountCents:1599,currency:'CNY',transactionId:'txn-1',status:'succeeded'})})
 return gateway.verifyNotification('signed',{request,headers:{}})
}
function mock(order=baseOrder,events=[],options={}){
 const calls=[]
 const db={async query(sql,args){calls.push(sql)
  if(sql.startsWith('SELECT *, (created_at'))return {rows:[order]}
  if(sql.includes('FROM payment_events'))return {rows:events}
  if(sql.includes("UPDATE orders SET payment_status='paid'"))return options.failUpdate?{rows:[],rowCount:0}:{rows:[{id:order.id}],rowCount:1}
  return {rows:[],rowCount:1}
 },release(){calls.push('RELEASE')}}
 return {pool:{connect:async()=>db},calls}
}
test('commits an authenticated payment and records provider transaction',async()=>{
 const m=mock();const result=await settleVerifiedOrderPayment(m.pool,{event:await event(),expectedProvider:'gateway',expectedMode:'sandbox'})
 assert.equal(result.action,'settle')
 assert.ok(m.calls.some(s=>s.includes("INSERT INTO payment_events")))
 assert.ok(m.calls.some(s=>s.includes("UPDATE orders SET payment_status='paid'")))
 assert.ok(m.calls.includes('COMMIT'));assert.ok(!m.calls.includes('ROLLBACK'))
})
test('rejects forged payment before opening a transaction',async()=>{
 const m=mock();await assert.rejects(settleVerifiedOrderPayment(m.pool,{event:{...await event()},expectedProvider:'gateway',expectedMode:'sandbox'}),/unverified_payment_notification/)
 assert.deepEqual(m.calls,[])
})
test('sandbox transaction cannot be settled in live environment',async()=>{
 const m=mock();await assert.rejects(settleVerifiedOrderPayment(m.pool,{event:await event(),expectedProvider:'gateway',expectedMode:'live'}),/payment_environment_mismatch/)
 assert.deepEqual(m.calls,[])
})
test('rejects expired order and rolls back',async()=>{
 const m=mock({...baseOrder,payment_window_open:false})
 await assert.rejects(settleVerifiedOrderPayment(m.pool,{event:await event(),expectedProvider:'gateway',expectedMode:'sandbox'}),/payment_window_expired/)
 assert.ok(m.calls.includes('ROLLBACK'));assert.ok(!m.calls.some(s=>s.includes('INSERT INTO payment_events')))
})
test('deduplicates identical transaction on paid order',async()=>{
 const m=mock({...baseOrder,payment_status:'paid'},[{order_id:id,amount_cents:'1599',event_type:'payment_succeeded'}])
 const result=await settleVerifiedOrderPayment(m.pool,{event:await event(),expectedProvider:'gateway',expectedMode:'sandbox'})
 assert.equal(result.action,'already_settled');assert.ok(!m.calls.some(s=>s.includes('INSERT INTO payment_events')))
})
test('different transaction on paid order is rejected',async()=>{
 const m=mock({...baseOrder,payment_status:'paid'})
 await assert.rejects(settleVerifiedOrderPayment(m.pool,{event:await event(),expectedProvider:'gateway',expectedMode:'sandbox'}),/paid_order_different_transaction/)
 assert.ok(m.calls.includes('ROLLBACK'))
})
test('provider transaction already used rejects and rolls back',async()=>{
 const m=mock(baseOrder,[{order_id:'different'}])
 await assert.rejects(settleVerifiedOrderPayment(m.pool,{event:await event(),expectedProvider:'gateway',expectedMode:'sandbox'}),/provider_transaction_reused/)
 assert.ok(m.calls.includes('ROLLBACK'))
})

test('rolls back event insert when order update affects zero rows',async()=>{
 const m=mock(baseOrder,[],{failUpdate:true})
 await assert.rejects(settleVerifiedOrderPayment(m.pool,{event:await event(),expectedProvider:'gateway',expectedMode:'sandbox'}),/payment_order_update_failed/)
 assert.ok(m.calls.some(s=>s.includes('INSERT INTO payment_events')))
 assert.ok(m.calls.includes('ROLLBACK'));assert.ok(!m.calls.includes('COMMIT'))
})
