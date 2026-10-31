// Official Stripe server API only; never accepts browser payment claims.
import {createPaymentGateway} from './paymentGateway.mjs'
import {createStripeCheckoutGateway} from './stripeCheckoutGateway.mjs'
const fail=code=>{throw Error(code)}
export function createStripeSandboxClient(env,fetchImpl=fetch){
 if(!/^sk_test_[A-Za-z0-9]+$/.test(env.STRIPE_TEST_SECRET_KEY||''))fail('stripe_test_key_required')
 async function call(path,options={}){
  const response=await fetchImpl('https://api.stripe.com/v1/'+path,{...options,signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.STRIPE_TEST_SECRET_KEY,...options.headers}})
  if(!response.ok)fail('stripe_sandbox_unavailable')
  return response.json()
 }
 async function getSession(attempt){
  if(!/^cs_test_[A-Za-z0-9_]+$/.test(attempt.session_id||''))fail('invalid_sandbox_session')
  const s=await call('checkout/sessions/'+encodeURIComponent(attempt.session_id)+'?expand[]=payment_intent.latest_charge')
  if(s.id!==attempt.session_id||s.object!=='checkout.session'||s.livemode!==false||s.mode!=='payment'||
   s.client_reference_id!==attempt.order_id||s.metadata?.orderId!==attempt.order_id||
   s.currency!=='cny'||s.amount_total!==Number(attempt.amount_cents)||
   !['open','complete','expired'].includes(s.status)||!['paid','unpaid','no_payment_required'].includes(s.payment_status))fail('stripe_session_mismatch')
  let event=null
  const pi=s.payment_intent
  const actualChannel=pi?.latest_charge?.payment_method_details?.type||null
  if(s.payment_status==='paid'){
   if(s.status!=='complete'||pi?.livemode!==false||pi?.status!=='succeeded'||!/^pi_/.test(pi?.id||'')||
    pi.amount!==s.amount_total||pi.currency!=='cny'||!Number.isSafeInteger(pi.latest_charge?.created)||!['card','alipay','wechat_pay'].includes(actualChannel))fail('stripe_paid_intent_mismatch')
   // Brand only the result obtained using authenticated Stripe retrieval.
   const gateway=createPaymentGateway({provider:'stripe',mode:'sandbox',createPayment:async()=>{},verifyNotification:async()=>({
    verifiedByProvider:true,provider:'stripe',mode:'sandbox',orderId:attempt.order_id,amountCents:s.amount_total,
    currency:'CNY',transactionId:s.id,status:'succeeded'
   })})
   event=await gateway.verifyNotification(null,{request:{orderId:attempt.order_id,amountCents:Number(attempt.amount_cents),currency:'CNY',requestKey:attempt.request_key},headers:{}})
  }
  return {session:s,event,actualChannel,paymentIntentId:typeof pi==='string'?pi:pi?.id||null,
   failureCode:s.payment_status!=='paid'&&pi?.last_payment_error?'payment_failed':null}
 }
 return {
  async create(attempt){
   const options=attempt.provider_options||{}
   const pmc=options.methodConfiguration||env['STRIPE_TEST_'+attempt.channel.toUpperCase()+'_CONFIGURATION']
   if(!pmc)fail('stripe_channel_configuration_required')
   return createStripeCheckoutGateway({secretKey:env.STRIPE_TEST_SECRET_KEY,webhookSecret:env.STRIPE_TEST_WEBHOOK_SECRET,
    successUrl:options.successUrl||env.STRIPE_TEST_SUCCESS_URL,cancelUrl:options.cancelUrl||env.STRIPE_TEST_CANCEL_URL,fetchImpl,channel:attempt.channel,paymentMethodConfiguration:pmc,
    expiresAt:Math.floor(new Date(attempt.expires_at).getTime()/1000)}).create({orderId:attempt.order_id,amountCents:Number(attempt.amount_cents),currency:'CNY',requestKey:attempt.request_key})
  },
  getSession,
  async expire(attempt){
   await call('checkout/sessions/'+encodeURIComponent(attempt.session_id)+'/expire',{method:'POST',headers:{'Idempotency-Key':'expire:'+attempt.id}})
   return getSession(attempt)
  }
 }
}
