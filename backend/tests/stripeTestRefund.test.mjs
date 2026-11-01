import test from 'node:test'
import assert from 'node:assert/strict'
import {createStripeTestRefundClient} from '../src/stripeTestRefund.mjs'
const audit={provider:'stripe:sandbox',event_type:'refund_required',
 order_id:'11111111-1111-4111-8111-111111111111',provider_event_id:'cs_test_abc',amount_cents:'1599'}
const session={id:'cs_test_abc',livemode:false,payment_status:'paid',
 payment_intent:'pi_abc123',client_reference_id:audit.order_id,amount_total:1599,currency:'cny'}
const refund={id:'re_abc123',payment_intent:'pi_abc123',amount:1599,status:'succeeded',livemode:false,currency:'cny'}
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

test('rejects non-integer or non-positive refund amounts from Stripe status lookup',async()=>{
 for(const amount of [undefined,null,0,-1,'1599',1.5,Number.MAX_SAFE_INTEGER+1]){
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>({
   ok:true,json:async()=>({...refund,amount})
  })})
  await assert.rejects(client.getRefundStatus('re_abc123'),/stripe_refund_status_invalid/)
 }
})

test('status lookup rejects live-mode or wrong-currency refunds',async()=>{
 for(const change of [{livemode:true},{livemode:undefined},{currency:'usd'},{currency:undefined}]){
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>({
   ok:true,json:async()=>({...refund,...change})
  })})
  await assert.rejects(client.getRefundStatus('re_abc123'),/stripe_refund_status_invalid/)
 }
})

test('late refund creation rejects live-mode or wrong-currency Stripe response',async()=>{
 for(const change of [{livemode:true},{livemode:undefined},{currency:'usd'},{currency:undefined}]){
  const {client,calls}=setup({refund:{...refund,...change}})
  await assert.rejects(client.refundLatePayment(audit),/stripe_refund_unconfirmed/)
  assert.equal(calls.length,2)
 }
})

test('empty Stripe refund creation response is never treated as a retryable network error',async()=>{
 for(const value of [null,undefined]){
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>({
   ok:true,json:async()=>url.endsWith('/refunds')?value:session
  })})
  await assert.rejects(client.refundLatePayment(audit),/stripe_refund_unconfirmed/)
 }
})

test('successful HTTP refund POST with malformed JSON enters review rather than retry',async()=>{
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>({
  ok:true,json:async()=>{
   if(url.endsWith('/refunds'))throw new SyntaxError('Unexpected end of JSON input')
   return session
  }
 })})
 await assert.rejects(client.refundLatePayment(audit),/stripe_refund_unconfirmed/)
})

test('Stripe refund POST server errors require review; preflight GET errors remain retryable',async()=>{
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>
  url.endsWith('/refunds')?{ok:false,status:500}:{ok:true,json:async()=>session}
 })
 await assert.rejects(client.refundLatePayment(audit),/stripe_refund_unconfirmed/)
 const preflight=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>({ok:false,status:503})})
 await assert.rejects(preflight.refundLatePayment(audit),/stripe_refund_api_failed/)
})

test('refund POST timeout is uncertain while preflight timeout remains retryable',async()=>{
 const timeout=Object.assign(new Error('timeout'),{name:'TimeoutError'})
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>{
  if(url.endsWith('/refunds'))throw timeout
  return {ok:true,json:async()=>session}
 }})
 await assert.rejects(client.refundLatePayment(audit),/stripe_refund_unconfirmed/)
 const preflight=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>{throw timeout}})
 await assert.rejects(preflight.refundLatePayment(audit),error=>error===timeout)
})

test('refund POST connection reset requires review but GET connection reset propagates',async()=>{
 const reset=Object.assign(new Error('socket hang up'),{code:'ECONNRESET'})
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>{
  if(url.endsWith('/refunds'))throw reset
  return {ok:true,json:async()=>session}
 }})
 await assert.rejects(client.refundLatePayment(audit),/stripe_refund_unconfirmed/)
 const preflight=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>{throw reset}})
 await assert.rejects(preflight.refundLatePayment(audit),error=>error===reset)
})

test('late-payment refund rejects wrong or missing Checkout Session currency before POST',async()=>{
 for(const currency of ['usd',undefined]){
  const {client,calls}=setup({session:{...session,currency}})
  await assert.rejects(client.refundLatePayment(audit),/stripe_refund_session_mismatch/)
  assert.equal(calls.length,1)
 }
})

test('late-payment refund rejects numeric-string or fractional Checkout Session amount before POST',async()=>{
 for(const amount_total of ['1599',1599.5,null]){
  const {client,calls}=setup({session:{...session,amount_total}})
  await assert.rejects(client.refundLatePayment(audit),/stripe_refund_session_mismatch/)
  assert.equal(calls.length,1)
 }
})

test('empty Checkout Session data is rejected before any refund POST',async()=>{
 for(const value of [null,undefined]){
  let calls=0
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>{
   calls++
   return {ok:true,json:async()=>value}
  }})
  await assert.rejects(client.refundLatePayment(audit),/stripe_refund_session_mismatch/)
  assert.equal(calls,1)
 }
})

test('merchant partial refund uses durable job idempotency key and exact amount',async()=>{
 const job={id:'22222222-2222-4222-8222-222222222222',order_id:audit.order_id,
  checkout_session_id:session.id,amount_cents:250,payment_amount_cents:1599}
 const calls=[]
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async(url,options)=>{
  calls.push({url,options})
  return {ok:true,json:async()=>url.endsWith('/refunds')?
   {...refund,amount:250}:session}
 }})
 const result=await client.refundPayment(job)
 assert.equal(result.refundId,refund.id)
 assert.equal(result.amountCents,250)
 assert.equal(calls.length,2)
 assert.equal(calls[1].options.headers['Idempotency-Key'],'sandbox-refund:'+job.id)
 const params=new URLSearchParams(calls[1].options.body)
 assert.equal(params.get('payment_intent'),session.payment_intent)
 assert.equal(params.get('amount'),'250')
 assert.equal(params.get('metadata[orderId]'),job.order_id)
 assert.equal(params.get('metadata[refundJobId]'),job.id)
})
test('merchant refund rejects mismatched paid session before making refund POST',async()=>{
 const job={id:'22222222-2222-4222-8222-222222222222',order_id:audit.order_id,
  checkout_session_id:session.id,amount_cents:250,payment_amount_cents:1599}
 for(const override of [{currency:'usd'},{amount_total:'1599'},{livemode:true},{client_reference_id:'wrong'}]){
  const calls=[]
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>{
   calls.push(url);return {ok:true,json:async()=>({...session,...override})}
  }})
  await assert.rejects(client.refundPayment(job),/stripe_refund_session_mismatch/)
  assert.equal(calls.length,1)
 }
})

test('merchant refund rejects unconfirmed Stripe refund identity and amount',async()=>{
 const job={id:'22222222-2222-4222-8222-222222222222',order_id:audit.order_id,
  checkout_session_id:session.id,amount_cents:250,payment_amount_cents:1599}
 for(const changes of [{id:'invalid'},{payment_intent:'pi_other'},{amount:251},
  {currency:'usd'},{livemode:true},{status:'unknown'},{status:'succeeded',amount:'250'}]){
  const calls=[]
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>{
   calls.push(url)
   return {ok:true,json:async()=>url.endsWith('/refunds')?
    {...refund,amount:250,...changes}:session}
  }})
  await assert.rejects(client.refundPayment(job),/stripe_refund_unconfirmed/)
  assert.equal(calls.length,2)
 }
})

test('merchant refund rejects empty and nonnumeric refund amount before Stripe call',async()=>{
 const valid={id:'22222222-2222-4222-8222-222222222222',order_id:audit.order_id,
  checkout_session_id:session.id,amount_cents:250,payment_amount_cents:1599}
 for(const amount_cents of ['', ' ',null,undefined,false,{},'abc']){
  let calls=0
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>{
   calls++;throw Error('unexpected Stripe request')
  }})
  await assert.rejects(client.refundPayment({...valid,amount_cents}),/invalid_refund_request/)
  assert.equal(calls,0)
 }
})

test('merchant refund rejects invalid payment total before Stripe call',async()=>{
 const valid={id:'22222222-2222-4222-8222-222222222222',order_id:audit.order_id,
  checkout_session_id:session.id,amount_cents:250,payment_amount_cents:1599}
 for(const payment_amount_cents of ['', ' ',null,undefined,false,true,{},'abc',0,-5,1.5]){
  let calls=0
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>{
   calls++;throw Error('unexpected Stripe request')
  }})
  await assert.rejects(client.refundPayment({...valid,payment_amount_cents}),/invalid_refund_request/)
  assert.equal(calls,0)
 }
})

test('late-payment refund rejects malformed audit amount without calling Stripe',async()=>{
 for(const amount_cents of ['', ' ',null,undefined,false,true,{},'abc',0,-1,1.5]){
  let calls=0
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>{
   calls++;throw Error('unexpected Stripe request')
  }})
  await assert.rejects(client.refundLatePayment({...audit,amount_cents}),/invalid_refund_audit/)
  assert.equal(calls,0)
 }
})

test('refund status lookup rejects null or undefined JSON payload',async()=>{
 for(const value of [null,undefined]){
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>({
   ok:true,json:async()=>value
  })})
  await assert.rejects(client.getRefundStatus('re_abc123'),/stripe_refund_status_invalid/)
 }
})

test('refund status lookup rejects malformed provider state and payment intent',async()=>{
 for(const changes of [{status:undefined},{status:'unexpected'},{payment_intent:undefined},
  {payment_intent:'invalid'},{amount:0},{currency:undefined},{livemode:undefined}]){
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>({
   ok:true,json:async()=>({...refund,...changes})
  })})
  await assert.rejects(client.getRefundStatus('re_abc123'),/stripe_refund_status_invalid/)
 }
})

test('missing HTTP response after refund POST is reviewed, while GET fails safely',async()=>{
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>
  url.endsWith('/refunds')?null:{ok:true,json:async()=>session}
 })
 await assert.rejects(client.refundLatePayment(audit),/stripe_refund_unconfirmed/)
 const preflight=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>null})
 await assert.rejects(preflight.refundLatePayment(audit),/stripe_refund_api_failed/)
})

test('refund POST with malformed HTTP failure status is treated as uncertain',async()=>{
 for(const status of [undefined,null,'500',0,200]){
  const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>
   url.endsWith('/refunds')?{ok:false,status}:{ok:true,json:async()=>session}
  })
  await assert.rejects(client.refundLatePayment(audit),/stripe_refund_unconfirmed/)
 }
})

test('late-payment compensation uses stable session idempotency and exact audit amount',async()=>{
 const {client,calls}=setup()
 const result=await client.refundLatePayment(audit)
 assert.equal(result.refundId,refund.id)
 assert.equal(result.amountCents,1599)
 assert.equal(calls.length,2)
 const post=calls[1].options
 assert.equal(post.method,'POST')
 assert.equal(post.headers['Idempotency-Key'],'late-refund:'+session.id)
 const body=new URLSearchParams(post.body)
 assert.equal(body.get('payment_intent'),session.payment_intent)
 assert.equal(body.get('amount'),'1599')
 assert.equal(body.get('reason'),'requested_by_customer')
 assert.equal(body.get('metadata[orderId]'),audit.order_id)
 assert.equal(body.get('metadata[checkoutSessionId]'),session.id)
})

test('refund POST HTTP 429 requires review while preflight GET 429 remains retryable',async()=>{
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>
  url.endsWith('/refunds')?{ok:false,status:429}:{ok:true,json:async()=>session}
 })
 await assert.rejects(client.refundLatePayment(audit),/stripe_refund_unconfirmed/)
 const preflight=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>({ok:false,status:429})})
 await assert.rejects(preflight.refundLatePayment(audit),/stripe_refund_api_failed/)
})

test('refund POST HTTP 408 requires review while preflight GET 408 remains retryable',async()=>{
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>{
  if(url.endsWith('/refunds'))return {ok:false,status:408}
  return {ok:true,json:async()=>session}
 }})
 await assert.rejects(client.refundLatePayment(audit),/stripe_refund_unconfirmed/)
 const preflight=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async()=>({ok:false,status:408})})
 await assert.rejects(preflight.refundLatePayment(audit),/stripe_refund_api_failed/)
})

test('pending merchant refund is not prematurely marked complete',async()=>{
 const job={id:'22222222-2222-4222-8222-222222222222',order_id:audit.order_id,
  checkout_session_id:session.id,amount_cents:250,payment_amount_cents:1599}
 const client=createStripeTestRefundClient({secretKey:'sk_test_123',fetchImpl:async url=>({
  ok:true,json:async()=>url.endsWith('/refunds')?
   {...refund,amount:250,status:'pending'}:session
 })})
 const out=await client.refundPayment(job)
 assert.equal(out.status,'pending')
 assert.equal(out.completed,false)
 assert.equal(out.amountCents,250)
})
test('pending late-payment compensation remains incomplete',async()=>{
 const {client}=setup({refund:{...refund,status:'pending'}})
 const out=await client.refundLatePayment(audit)
 assert.equal(out.status,'pending')
 assert.equal(out.completed,false)
})
