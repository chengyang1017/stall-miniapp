import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {createStripeCheckoutGateway} from '../src/stripeCheckoutGateway.mjs'
const key='sk_test_123456789',secret='whsec_123456789'
const orderId='11111111-1111-4111-8111-111111111111'
const request={orderId,amountCents:1999,currency:'MYR',requestKey:'request-001'}
const make=(settings={})=>createStripeCheckoutGateway({secretKey:key,webhookSecret:secret,
 successUrl:'https://example.com/success',cancelUrl:'https://example.com/cancel',now:1700000000,...settings})
const checkout={id:'cs_test_abc',url:'https://checkout.stripe.com/c/pay/cs_test_abc'}
const payload={livemode:false,type:'checkout.session.completed',data:{object:{object:'checkout.session',id:'cs_test_abc',
 payment_status:'paid',status:'complete',client_reference_id:orderId,metadata:{orderId},amount_total:1999,currency:'myr'}}}
const signed=(obj=payload,ts=1700000000)=>{const raw=JSON.stringify(obj);return {raw,headers:{'stripe-signature':'t='+ts+',v1='+createHmac('sha256',secret).update(ts+'.'+raw).digest('hex')}}}
test('test mode only; production key rejected',()=>assert.throws(()=>make({secretKey:'sk_live_abcd'}),/stripe_test_key_required/))
test('creates real Stripe Checkout request with server amount and idempotency',async()=>{
 let args;const gateway=make({fetchImpl:async (url,options)=>(args={url,options},{ok:true,json:async()=>checkout})})
 const result=await gateway.create(request)
 assert.equal(result.sessionId,checkout.id)
 assert.equal(args.url,'https://api.stripe.com/v1/checkout/sessions')
 const data=new URLSearchParams(args.options.body)
 assert.equal(data.get('line_items[0][price_data][unit_amount]'),'1999')
 assert.equal(data.get('line_items[0][price_data][currency]'),'myr')
 assert.equal(data.get('client_reference_id'),orderId)
 assert.ok(Number(data.get('expires_at'))>Math.floor(Date.now()/1000)+1700)
 assert.ok(Number(data.get('expires_at'))<=Math.floor(Date.now()/1000)+1805)
 assert.match(args.options.headers['Idempotency-Key'],/request-001/)
})
test('valid signed Stripe test webhook is normalized',async()=>{
 const gateway=make();const msg=signed()
 const result=await gateway.verifyNotification(msg.raw,{request,headers:msg.headers})
 assert.equal(result.provider,'stripe');assert.equal(result.transactionId,'cs_test_abc')
})
test('tampered webhook rejected',async()=>{
 const gateway=make();const msg=signed()
 await assert.rejects(gateway.verifyNotification(msg.raw+' ',{request,headers:msg.headers}),/stripe_signature_invalid/)
})
test('live webhook rejected even when signed',async()=>{
 const gateway=make();const msg=signed({...payload,livemode:true})
 await assert.rejects(gateway.verifyNotification(msg.raw,{request,headers:msg.headers}),/stripe_live_event_rejected/)
})
test('unpaid session rejected even when signed',async()=>{
 const gateway=make();const msg=signed({...payload,data:{object:{...payload.data.object,payment_status:'unpaid'}}})
 await assert.rejects(gateway.verifyNotification(msg.raw,{request,headers:msg.headers}),/stripe_session_not_paid/)
})
test('timestamp outside 5 minute window rejected',async()=>{
 const gateway=make();const msg=signed(payload,1699999000)
 await assert.rejects(gateway.verifyNotification(msg.raw,{request,headers:msg.headers}),/stripe_signature_invalid/)
})

for(const channel of ['card','alipay','wechat_pay']){
 test(channel+' uses configured hosted Checkout and isolated idempotency',async()=>{
  let options
  const gateway=make({channel,paymentMethodConfiguration:'pmc_Test123',fetchImpl:async(_,o)=>{
   options=o;return {ok:true,json:async()=>checkout}
  }})
  const result=await gateway.create({...request,currency:'CNY'})
  const body=new URLSearchParams(options.body)
  assert.equal(body.get('payment_method_configuration'),'pmc_Test123')
  assert.equal(body.get('metadata[channel]'),channel)
  assert.equal(body.get('line_items[0][price_data][currency]'),'cny')
  assert.equal(body.has('payment_method_types[0]'),false)
  assert.ok(options.headers['Idempotency-Key'].includes(':'+channel+':'))
  assert.equal(result.channel,channel)
 })
 test(channel+' async signed success settles through common verified contract',async()=>{
  const gateway=make({channel,paymentMethodConfiguration:'pmc_Test123'})
  const msg=signed({...payload,type:'checkout.session.async_payment_succeeded'})
  const result=await gateway.verifyNotification(msg.raw,{request,headers:msg.headers})
  assert.equal(result.status,'succeeded')
 })
}
test('wallets require explicit configuration and invalid channels fail closed',()=>{
 assert.throws(()=>make({channel:'alipay'}),/stripe_channel_configuration_required/)
 assert.throws(()=>make({channel:'wechat_pay'}),/stripe_channel_configuration_required/)
 assert.throws(()=>make({channel:'fake'}),/stripe_invalid_channel/)
 assert.throws(()=>make({paymentMethodConfiguration:'not-a-config'}),/stripe_invalid_method_configuration/)
})
test('untrusted hosted URL rejected before returning to client',async()=>{
 const gateway=make({fetchImpl:async()=>({ok:true,json:async()=>({...checkout,url:'https://example.com/phishing'})})})
 await assert.rejects(gateway.create(request),/stripe_invalid_checkout_session/)
})
