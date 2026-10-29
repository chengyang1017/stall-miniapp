import test from 'node:test'
import assert from 'node:assert/strict'
import {authorizePaymentSettlement as decide} from '../src/paymentSettlement.mjs'
import {createPaymentGateway} from '../src/paymentGateway.mjs'
const id='11111111-1111-4111-8111-111111111111'
const order={id,total_cents:'1599',currency:'CNY',payment_status:'unpaid',fulfillment_status:'new',inventory_state:'held',payment_window_open:true}
const raw={orderId:id,amountCents:1599,currency:'CNY',provider:'gateway',mode:'sandbox',transactionId:'txn-123',status:'succeeded',verifiedByProvider:true}
async function verified(overrides={}){
 const event={...raw,...overrides}
 const gateway=createPaymentGateway({provider:event.provider,mode:event.mode,createPayment:async()=>({}),verifyNotification:async()=>event})
 return gateway.verifyNotification('signed-test-message',{request:{orderId:event.orderId,amountCents:event.amountCents,currency:event.currency,requestKey:'retry-001'},headers:{}})
}
const check=(o,event,mode='sandbox')=>decide({order:o,event,expectedMode:mode,expectedProvider:'gateway'})
test('verified provider result is eligible for future settlement',async()=>assert.equal(check(order,await verified()).action,'settle'))
test('plain fabricated event cannot settle',()=>assert.throws(()=>check(order,raw),/unverified_payment_notification/))
test('spreading a verified event loses internal verification',async()=>assert.throws(()=>check(order,{...await verified()}),/unverified_payment_notification/))
test('live cannot accept sandbox result',async()=>assert.throws(()=>check(order,await verified(),'live'),/untrusted_payment_result/))
test('wrong amount rejected',async()=>assert.throws(()=>check(order,await verified({amountCents:1})),/payment_reconciliation_mismatch/))
test('wrong currency rejected',async()=>assert.throws(()=>check(order,await verified({currency:'USD'})),/payment_reconciliation_mismatch/))
test('wrong order rejected',async()=>assert.throws(()=>check(order,await verified({orderId:'other'})),/payment_reconciliation_mismatch/))
test('pending payment rejected at gateway verification',async()=>await assert.rejects(verified({status:'pending'}),/payment_not_succeeded/))
test('expired payment window rejected',async()=>assert.throws(()=>check({...order,payment_window_open:false},await verified()),/payment_window_expired/))
test('cancelled order rejected',async()=>assert.throws(()=>check({...order,fulfillment_status:'cancelled'},await verified()),/order_not_payable/))
test('different transaction cannot replay settled order',async()=>assert.throws(()=>check({...order,payment_status:'paid',payment_provider:'gateway',payment_mode:'sandbox',provider_transaction_id:'old'},await verified()),/paid_order_different_transaction/))
test('identical settled transaction is idempotent',async()=>assert.equal(check({...order,payment_status:'paid',payment_provider:'gateway',payment_mode:'sandbox',provider_transaction_id:'txn-123'},await verified()).action,'already_settled'))
