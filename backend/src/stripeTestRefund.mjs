// Test-mode refund adapter for audited, late-paid Stripe Checkout Sessions.
// NOT mounted as an HTTP route, scheduled job, or automatic webhook action.
const fail=code=>{throw Error(code)}
const sessionId=/^cs_test_[A-Za-z0-9_]+$/
const intentId=/^pi_[A-Za-z0-9_]+$/
const refundId=/^re_[A-Za-z0-9_]+$/
const orderId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function createStripeTestRefundClient({secretKey,fetchImpl=fetch}){
 if(!/^sk_test_[A-Za-z0-9]+$/.test(secretKey||''))fail('stripe_test_key_required')
 async function call(path,options={}){
  const response=await fetchImpl('https://api.stripe.com/v1/'+path,{
   ...options,headers:{Authorization:'Bearer '+secretKey,...options.headers}
  })
  if(!response.ok)fail('stripe_refund_api_failed')
  return response.json()
 }
 return Object.freeze({
  async getRefundStatus(refundId){
   if(typeof refundId!=='string'||!/^re_[A-Za-z0-9_]+$/.test(refundId))fail('invalid_stripe_refund_id')
   const refund=await call('refunds/'+encodeURIComponent(refundId))
   if(refund.id!==refundId||!['succeeded','pending','requires_action','failed','canceled'].includes(refund.status)||!intentId.test(refund.payment_intent||''))
    fail('stripe_refund_status_invalid')
   return Object.freeze({refundId,status:refund.status,paymentIntentId:refund.payment_intent,
    amountCents:refund.amount,completed:refund.status==='succeeded'})
  },
  // Database audit row must be supplied by a trusted backend operation.
  // For now this method is deliberately NOT automatically invoked.
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
