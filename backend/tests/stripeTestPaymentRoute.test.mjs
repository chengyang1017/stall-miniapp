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

const isolatedEnv={
 STRIPE_TEST_PAYMENTS_ENABLED:'true',SANDBOX_PAYMENT_LIFECYCLE_ENABLED:'true',
 PAYMENT_DB_ENV:'isolated-test',SANDBOX_PAYMENT_INSTANCE_ID:'11111111-1111-4111-8111-111111111111',
 STRIPE_TEST_CARD_CONFIGURATION:'pmc_test'
}
const mockPool={async query(sql){
 if(sql.includes('sandbox_payment_environment'))return {rows:[{one:1}]}
 if(sql.includes('SELECT o.id FROM orders'))return {rows:[{id:'11111111-1111-4111-8111-111111111111'}]}
 throw Error('unexpected database operation: '+sql)
}}
function requestJson(value){
 const bytes=Buffer.from(JSON.stringify(value))
 return {method:'POST',headers:{'idempotency-key':'sandboxtestkey123'},async *[Symbol.asyncIterator](){yield bytes}}
}
test('rejects unsupported Sandbox channels with 400 before creating an attempt',async()=>{
 for(const channel of ['cash','',null,123,[],{}]){
  const response=res()
  await stripeTestPaymentRoute(requestJson({channel}),response,url,mockPool,isolatedEnv,{
   authenticate:async()=> 'test-customer',client:{create(){throw Error('unexpected provider access')}}
  })
  assert.equal(response.status,400,JSON.stringify(channel))
  assert.equal(response.body.error,'invalid_payment_channel')
 }
})
test('rejects array refund payloads with 400 before reserving a refund',async()=>{
 const response=res()
 const merchantUrl=new URL(url.href.replace('/v1/stores/','/v1/merchant/stores/').replace('/stripe-test-checkout','/sandbox-refund'))
 await stripeTestPaymentRoute(requestJson([]),response,merchantUrl,mockPool,{
  ...isolatedEnv,STRIPE_TEST_REFUNDS_ENABLED:'true'
 },{
  authenticate:async()=> 'test-manager',
  permittedStore:async()=>({role:'manager'}),client:{}
 })
 assert.equal(response.status,400)
 assert.equal(response.body.error,'invalid_refund_request')
})

test('rejects malformed checkout payload shapes before provider or order mutation',async()=>{
 for(const value of [null,[],['card'],'card',123,{channel:'card',amountCents:1}]){
  const response=res()
  await stripeTestPaymentRoute(requestJson(value),response,url,mockPool,isolatedEnv,{
   authenticate:async()=> 'test-customer',client:{}
  })
  assert.equal(response.status,400,JSON.stringify(value))
  assert.equal(response.body.error,'invalid_payment_channel')
 }
})
test('rejects malformed merchant refund request shapes before refund reservation',async()=>{
 const merchantUrl=new URL(url.href.replace('/v1/stores/','/v1/merchant/stores/').replace('/stripe-test-checkout','/sandbox-refund'))
 for(const value of [null,'100',123,[],{amountCents:100,unexpected:true}]){
  const response=res()
  await stripeTestPaymentRoute(requestJson(value),response,merchantUrl,mockPool,{
   ...isolatedEnv,STRIPE_TEST_REFUNDS_ENABLED:'true'
  },{
   authenticate:async()=> 'test-manager',
   permittedStore:async()=>({role:'manager'}),client:{}
  })
  assert.equal(response.status,400,JSON.stringify(value))
  assert.equal(response.body.error,'invalid_refund_request')
 }
})
test('unauthenticated payment creation returns 401 without querying an order',async()=>{
 const response=res()
 await stripeTestPaymentRoute(requestJson({channel:'card'}),response,url,{
  async query(sql){
   if(sql.includes('sandbox_payment_environment'))return {rows:[{one:1}]}
   throw Error('order must not be queried before authentication')
  }
 },isolatedEnv,{authenticate:async()=>null,client:{}})
 assert.equal(response.status,401)
 assert.equal(response.body.error,'login_required')
})
test('merchant staff cannot submit refunds',async()=>{
 const merchantUrl=new URL(url.href.replace('/v1/stores/','/v1/merchant/stores/').replace('/stripe-test-checkout','/sandbox-refund'))
 const response=res()
 await stripeTestPaymentRoute(requestJson({amountCents:100}),response,merchantUrl,mockPool,{
  ...isolatedEnv,STRIPE_TEST_REFUNDS_ENABLED:'true'
 },{
  authenticate:async()=> 'test-staff',permittedStore:async()=>({role:'staff'}),client:{}
 })
 assert.equal(response.status,403)
 assert.equal(response.body.error,'forbidden')
})
