import test from 'node:test'
import assert from 'node:assert/strict'
import {authorizePaymentSettlement as decide} from '../src/paymentSettlement.mjs'
const id='11111111-1111-4111-8111-111111111111'
const order={id,total_cents:'1599',currency:'CNY',payment_status:'unpaid',fulfillment_status:'new',inventory_state:'held',payment_window_open:true}
const event={orderId:id,amountCents:1599,currency:'CNY',provider:'gateway',mode:'sandbox',transactionId:'txn-123',status:'succeeded'}
const check=(o=order,e=event,mode='sandbox')=>decide({order:o,event:e,expectedMode:mode,expectedProvider:'gateway'})
test('verified provider result is eligible for future settlement',()=>assert.equal(check().action,'settle'))
test('live cannot accept sandbox result',()=>assert.throws(()=>check(order,event,'live'),/untrusted_payment_result/))
test('wrong amount rejected',()=>assert.throws(()=>check(order,{...event,amountCents:1}),/payment_reconciliation_mismatch/))
test('wrong currency rejected',()=>assert.throws(()=>check(order,{...event,currency:'USD'}),/payment_reconciliation_mismatch/))
test('wrong order rejected',()=>assert.throws(()=>check(order,{...event,orderId:'other'}),/payment_reconciliation_mismatch/))
test('pending payment rejected',()=>assert.throws(()=>check(order,{...event,status:'pending'}),/untrusted_payment_result/))
test('expired payment window rejected',()=>assert.throws(()=>check({...order,payment_window_open:false}),/payment_window_expired/))
test('cancelled order rejected',()=>assert.throws(()=>check({...order,fulfillment_status:'cancelled'}),/order_not_payable/))
test('different transaction cannot replay settled order',()=>assert.throws(()=>check({...order,payment_status:'paid',payment_provider:'gateway',payment_mode:'sandbox',provider_transaction_id:'old'}),/paid_order_different_transaction/))
test('identical settled transaction is idempotent',()=>assert.equal(check({...order,payment_status:'paid',payment_provider:'gateway',payment_mode:'sandbox',provider_transaction_id:event.transactionId}).action,'already_settled'))
