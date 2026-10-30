import test from 'node:test'
import assert from 'node:assert/strict'
import {stripeTestPaymentRoute} from '../src/stripeTestPaymentRoute.mjs'
const url=new URL('http://localhost/v1/stores/demo/orders/11111111-1111-4111-8111-111111111111/stripe-test-checkout')
const callback=new URL('http://localhost/v1/payments/stripe-test/webhook')
const res=()=>({status:null,body:null,writeHead(s){this.status=s},end(s){this.body=JSON.parse(s)}})
test('disabled checkout fails closed without database access',async()=>{const r=res();await stripeTestPaymentRoute({method:'POST',headers:{}},r,url,{query(){throw Error('db accessed')}},{});assert.equal(r.status,404)})
test('disabled webhook fails closed',async()=>{const r=res();await stripeTestPaymentRoute({method:'POST',headers:{}},r,callback,{},{});assert.equal(r.status,404)})
test('test mode requires isolated environment',async()=>{const r=res();await stripeTestPaymentRoute({method:'POST',headers:{}},r,url,{}, {STRIPE_TEST_PAYMENTS_ENABLED:'true',PAYMENT_DB_ENV:'production'});assert.equal(r.status,503)})
test('unrelated URLs are ignored',async()=>{const r=res();assert.equal(await stripeTestPaymentRoute({},r,new URL('http://localhost/health'),{},{}),false)})
