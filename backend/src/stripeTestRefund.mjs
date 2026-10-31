// Test-mode full/partial and compensating refunds, consumed by the gated queue.
const fail=code=>{throw Error(code)}
const sessionId=/^cs_test_[A-Za-z0-9_]+$/
const intentId=/^pi_[A-Za-z0-9_]+$/
const refundId=/^re_[A-Za-z0-9_]+$/
const orderId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function createStripeTestRefundClient({secretKey,fetchImpl=fetch}){
 if(!/^sk_test_[A-Za-z0-9]+$/.test(secretKey||''))fail('stripe_test_key_required')
 async function call(path,options={}){
  const response=await fetchImpl('https://api.stripe.com/v1/'+path,{
   ...options,signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+secretKey,...options.headers}
  })
  if(!response.ok)fail('stripe_refund_api_failed')
  return response.json()
 }
 return Object.freeze({
  async refundPayment(job){
   if(!orderId.test(job?.order_id||'')||!sessionId.test(job?.checkout_session_id||'')||
    !Number.isSafeInteger(Number(job.amount_cents))||Number(job.amount_cents)<=0||
    !Number.isSafeInteger(Number(job.payment_amount_cents))||Number(job.amount_cents)>Number(job.payment_amount_cents)||
    !orderId.test(job.id||''))fail('invalid_refund_request')
   const session=await call('checkout/sessions/'+encodeURIComponent(job.checkout_session_id))
   if(session.id!==job.checkout_session_id||session.livemode!==false||session.payment_status!=='paid'||
    session.currency!=='cny'||session.client_reference_id!==job.order_id||
    Number(session.amount_total)!==Number(job.payment_amount_cents)||!intentId.test(session.payment_intent||''))fail('stripe_refund_session_mismatch')
   const body=new URLSearchParams({payment_intent:session.payment_intent,amount:String(job.amount_cents),
    'metadata[orderId]':job.order_id,'metadata[refundJobId]':job.id})
   const refund=await call('refunds',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',
    'Idempotency-Key':'sandbox-refund:'+job.id},body:body.toString()})
   if(!refundId.test(refund.id||'')||refund.payment_intent!==session.payment_intent||refund.amount!==Number(job.amount_cents)||
    !['pending','requires_action','succeeded','failed','canceled'].includes(refund.status)||refund.currency!=='cny')fail('stripe_refund_unconfirmed')
   return {refundId:refund.id,status:refund.status,paymentIntentId:session.payment_intent,amountCents:refund.amount,completed:refund.status==='succeeded'}
  },
  async getRefundStatus(refundId){
   if(typeof refundId!=='string'||!/^re_[A-Za-z0-9_]+$/.test(refundId))fail('invalid_stripe_refund_id')
   const refund=await call('refunds/'+encodeURIComponent(refundId))
   if(refund.id!==refundId||!['succeeded','pending','requires_action','failed','canceled'].includes(refund.status)||!intentId.test(refund.payment_intent||''))
    fail('stripe_refund_status_invalid')
   return Object.freeze({refundId,status:refund.status,paymentIntentId:refund.payment_intent,
    amountCents:refund.amount,completed:refund.status==='succeeded'})
  },
  // Database audit row must be supplied by a trusted backend operation.
  // The worker supplies only persisted compensation audit rows.
  async refundLatePayment(audit){
   if(!audit||audit.provider!=='stripe:sandbox'||audit.event_type!=='refund_required'||
      !orderId.test(audit.order_id||'')||!sessionId.test(audit.provider_event_id||'')||
      !Number.isSafeInteger(Number(audit.amount_cents))||Number(audit.amount_cents)<=0)fail('invalid_refund_audit')
   const session=await call('checkout/sessions/'+encodeURIComponent(audit.provider_event_id))
   if(session.id!==audit.provider_event_id||session.livemode!==false||
      session.payment_status!=='paid'||!intentId.test(session.payment_intent||'')||
      session.client_reference_id!==audit.order_id||
      Number(session.amount_total)!==Number(audit.amount_cents))fail('stripe_refund_session_mismatch')
   const body=new URLSearchParams({payment_intent:session.payment_intent,
     amount:String(audit.amount_cents),reason:'requested_by_customer',
     'metadata[orderId]':audit.order_id,'metadata[checkoutSessionId]':session.id})
   const refund=await call('refunds',{method:'POST',headers:{
    'Content-Type':'application/x-www-form-urlencoded',
    'Idempotency-Key':'late-refund:'+session.id
   },body:body.toString()})
   if(!refundId.test(refund.id||'')||refund.payment_intent!==session.payment_intent||
      refund.amount!==Number(audit.amount_cents)||refund.status==='failed'||
      !['pending','requires_action','succeeded'].includes(refund.status))
     fail('stripe_refund_unconfirmed')
   return Object.freeze({refundId:refund.id,status:refund.status,sessionId:session.id,
    amountCents:refund.amount,completed:refund.status==='succeeded'})
  }
 })
}
