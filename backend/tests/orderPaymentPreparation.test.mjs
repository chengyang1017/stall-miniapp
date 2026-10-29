import test from 'node:test'
import assert from 'node:assert/strict'
import {createOrderPayment,prepareOrderPayment} from '../../src/orderPaymentPreparation.mjs'
import {createPaymentGateway} from '../../src/paymentGateway.mjs'
const orderId='11111111-1111-4111-8111-111111111111'
const good={id:orderId,total_cents:'1599',currency:'CNY',payment_status:'unpaid',fulfillment_status:'new',inventory_state:'held',payment_window_open:true}
const db=(rows=[good])=>({query:async (sql,values)=>{assert.match(sql,/customer_subject=\$2/);assert.deepEqual(values,[orderId,'wx:test:customer']);return {rows}}})
const input={orderId,subject:'wx:test:customer',requestKey:'retry-001'}
test('amount and currency come from the database, not customer request',async()=>{
 let passed
 const gateway=createPaymentGateway({provider:'test-provider',mode:'sandbox',createPayment:async value=>(passed=value,{ok:true}),verifyNotification:async()=>({})})
 await createOrderPayment(gateway,db(),{...input,amountCents:1,currency:'USD'})
 assert.equal(passed.amountCents,1599);assert.equal(passed.currency,'CNY')
})
test('missing or foreign order fails closed',async()=>{await assert.rejects(prepareOrderPayment(db([]),input),/payment_order_not_found/)})
for(const [name,override] of [
 ['paid',{payment_status:'paid'}],['cancelled',{fulfillment_status:'cancelled'}],
 ['expired',{payment_window_open:false}],['invalid inventory',{inventory_state:'released'}]
])test('unpayable order rejected: '+name,async()=>{
 await assert.rejects(prepareOrderPayment(db([{...good,...override}]),input),/payment_order_not_payable/)
})
test('zero amount rejected by common payment contract',async()=>{await assert.rejects(prepareOrderPayment(db([{...good,total_cents:'0'}]),input),/invalid_amount/)})
test('invalid ID rejected before DB query',async()=>{await assert.rejects(prepareOrderPayment({query:()=>{throw Error('unexpected query')}},{...input,orderId:'bad'}),/invalid_payment_input/)})
