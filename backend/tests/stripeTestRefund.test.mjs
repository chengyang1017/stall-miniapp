import test from 'node:test'
import assert from 'node:assert/strict'
import {createStripeTestRefundClient} from '../src/stripeTestRefund.mjs'
const audit={provider:'stripe:sandbox',event_type:'refund_required',
 order_id:'11111111-1111-4111-8111-111111111111',provider_event_id:'cs_test_abc',amount_cents:'1599'}
const session={id:'cs_test_abc',livemode:false,payment_status:'paid',
 payment_intent:'pi_abc123',client_reference_id:audit.order_id,amount_total:1599}
const refund={id:'re_abc123',payment_intent:'pi_abc123',amount:1599,status:'succeeded'}
function setup(overrides={}){
 const calls=[];const client=createStripeTestRefundClient({secretKey:'sk_test_123',
 fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('/refunds')?(overrides.refund||refund):(overrides.session||session)}}})
 return {client,calls}
}
test('refuses production credentials',()=>assert.throws(()=>createStripeTestRefundClient({secretKey:'sk_live_abc'}),/stripe_test_key_required/))
test('refuses anything except a tracked late-payment audit row',async()=>{
 const {client,calls}=setup()
 await assert.rejects(client.refundLatePayment({...audit,event_type:'payment_succeeded'}),/invalid_refund_audit/)
 assert.equal(calls.length,0)
})
test('retrieves paid Checkout Session and sends idempotent full refund',async()=>{
 const {client,calls}=setup();const result=await client.refundLatePayment(audit)
 assert.equal(result.status,'succeeded');assert.equal(result.completed,true)
 assert.equal(calls.length,2)
 assert.equal(calls[0].url,'https://api.stripe.com/v1/checkout/sessions/cs_test_abc')
 assert.equal(calls[1].url,'https://api.stripe.com/v1/refunds')
 assert.equal(calls[1].options.headers['Idempotency-Key'],'late-refund:cs_test_abc')
 const form=new URLSearchParams(calls[1].options.body)
 assert.equal(form.get('payment_intent'),'pi_abc123');assert.equal(form.get('amount'),'1599')
})
test('session amount mismatch fails before refund',async()=>{
 const {client,calls}=setup({session:{...session,amount_total:1600}})
 await assert.rejects(client.refundLatePayment(audit),/stripe_refund_session_mismatch/)
 assert.equal(calls.length,1)
})
test('live session is never refunded',async()=>{
 const {client,calls}=setup({session:{...session,livemode:true}})
 await assert.rejects(client.refundLatePayment(audit),/stripe_refund_session_mismatch/)
 assert.equal(calls.length,1)
})
test('pending refund is not reported as completed',async()=>{
 const {client}=setup({refund:{...refund,status:'pending'}})
 const result=await client.refundLatePayment(audit)
 assert.equal(result.completed,false);assert.equal(result.status,'pending')
})
test('rejected or failed refund is never claimed successful',async()=>{
 const {client}=setup({refund:{...refund,status:'failed'}})
 await assert.rejects(client.refundLatePayment(audit),/stripe_refund_unconfirmed/)
})
test('network failure propagates so refund remains unresolved',async()=>{
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>{throw Error('network_timeout')}})
 await assert.rejects(client.refundLatePayment(audit),/network_timeout/)
})

test('fetches Stripe refund state without issuing another refund',async()=>{
 const calls=[]
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async(url,opts)=>{
  calls.push({url,opts});return {ok:true,json:async()=>({...refund,status:'pending'})}
 }})
 const out=await client.getRefundStatus('re_abc123')
 assert.equal(out.status,'pending');assert.equal(out.completed,false)
 assert.equal(calls.length,1);assert.match(calls[0].url,/\/refunds\/re_abc123$/)
 assert.equal(calls[0].opts.method,undefined)
})
test('rejects mismatching Stripe refund identity',async()=>{
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>({ok:true,json:async()=>({...refund,id:'re_different'})})})
 await assert.rejects(client.getRefundStatus('re_abc123'),/stripe_refund_status_invalid/)
})
