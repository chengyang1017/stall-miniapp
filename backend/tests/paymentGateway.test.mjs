import test from 'node:test'
import assert from 'node:assert/strict'
import {createPaymentGateway,paymentRequest} from '../../src/paymentGateway.mjs'

const req={orderId:'order-1',amountCents:1299,currency:'CNY',requestKey:'request-1'}
const confirmed={verifiedByProvider:true,provider:'provider-x',mode:'sandbox',orderId:'order-1',amountCents:1299,currency:'CNY',transactionId:'sandbox-123',status:'succeeded'}
const provider=(event=confirmed,mode='sandbox')=>createPaymentGateway({provider:'provider-x',mode,createPayment:async input=>({paymentToken:'test-only',input}),verifyNotification:async()=>event})
test('single interface creates sandbox payment without modifying order',async()=>{const p=provider();assert.equal((await p.create(req)).input.amountCents,1299)})
test('signature verification must be confirmed by provider',async()=>{await assert.rejects(provider({...confirmed,verifiedByProvider:false}).verifyNotification('raw',{request:req}),/unverified_payment_notification/)})
test('sandbox confirmation cannot enter live environment',async()=>{await assert.rejects(provider(confirmed,'live').verifyNotification('raw',{request:req}),/payment_environment_mismatch/)})
test('mismatched amount rejected',async()=>{await assert.rejects(provider({...confirmed,amountCents:1}).verifyNotification('raw',{request:req}),/payment_amount_mismatch/)})
test('wrong order rejected',async()=>{await assert.rejects(provider({...confirmed,orderId:'other'}).verifyNotification('raw',{request:req}),/payment_order_mismatch/)})
test('pending status cannot mark paid',async()=>{await assert.rejects(provider({...confirmed,status:'pending'}).verifyNotification('raw',{request:req}),/payment_not_succeeded/)})
test('verified success produces normalized settlement',async()=>{const event=await provider().verifyNotification('raw',{request:req});assert.equal(event.status,'succeeded');assert.equal(event.mode,'sandbox')})
test('request refuses invalid or zero money',()=>assert.throws(()=>paymentRequest({...req,amountCents:0}),/invalid_amount/))
