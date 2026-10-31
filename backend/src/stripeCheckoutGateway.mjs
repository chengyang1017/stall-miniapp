// Stripe hosted Checkout adapter. Not mounted on a production HTTP route.
// The checkout URL is for an external browser, NOT wx.requestPayment.
import {createHmac,timingSafeEqual} from 'node:crypto'
import {createPaymentGateway} from './paymentGateway.mjs'
const fail=code=>{throw Error(code)}
const validUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password}catch{return false}}
export function verifyStripeSignature(raw,header,secret,now=Math.floor(Date.now()/1000)){
 if(typeof raw!=='string'&&!Buffer.isBuffer(raw))fail('stripe_raw_body_required')
 if(typeof header!=='string'||!header||!secret)fail('stripe_signature_missing')
 const pairs=header.split(',').map(x=>x.trim().split('='))
 const ts=pairs.find(x=>x[0]==='t')?.[1]
 const signatures=pairs.filter(x=>x[0]==='v1').map(x=>x[1])
 if(!/^\d+$/.test(ts||'')||Math.abs(now-Number(ts))>300||signatures.length===0)fail('stripe_signature_invalid')
 const digest=createHmac('sha256',secret).update(ts+'.').update(raw).digest()
 const matches=signatures.some(s=>{
  if(!/^[0-9a-f]{64}$/i.test(s||''))return false
  return timingSafeEqual(Buffer.from(s,'hex'),digest)
 })
 if(!matches)fail('stripe_signature_invalid')
 return JSON.parse(raw.toString('utf8'))
}
export function createStripeCheckoutGateway({secretKey,webhookSecret,successUrl,cancelUrl,fetchImpl=fetch,now,channel='card',paymentMethodConfiguration}){
 if(!['card','alipay','wechat_pay'].includes(channel))fail('stripe_invalid_channel')
 if(paymentMethodConfiguration!==undefined&&!/^pmc_[A-Za-z0-9]+$/.test(paymentMethodConfiguration))fail('stripe_invalid_method_configuration')
 if(channel!=='card'&&!paymentMethodConfiguration)fail('stripe_channel_configuration_required')
 // Test-only until a merchant account is explicitly configured and reviewed.
 if(!/^sk_test_[A-Za-z0-9]+$/.test(secretKey||''))fail('stripe_test_key_required')
 if(!/^whsec_[A-Za-z0-9]+$/.test(webhookSecret||''))fail('stripe_webhook_secret_required')
 if(!validUrl(successUrl)||!validUrl(cancelUrl))fail('stripe_https_return_urls_required')
 return createPaymentGateway({provider:'stripe',mode:'sandbox',
  async createPayment(request){
   // Amount and currency have already been obtained from the server order.
   const body=new URLSearchParams({
    mode:'payment',
    'line_items[0][price_data][currency]':request.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]':String(request.amountCents),
    'line_items[0][price_data][product_data][name]':'Order '+request.orderId,
    'line_items[0][quantity]':'1',
    client_reference_id:request.orderId,
    'metadata[orderId]':request.orderId,
    'metadata[channel]':channel,
    expires_at:String(Math.floor(Date.now()/1000)+1800),
    success_url:successUrl,cancel_url:cancelUrl
   })
   if(paymentMethodConfiguration)body.set('payment_method_configuration',paymentMethodConfiguration)
   const response=await fetchImpl('https://api.stripe.com/v1/checkout/sessions',{
    method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+secretKey,'Idempotency-Key':'checkout:'+request.orderId+':'+channel+':'+request.requestKey,
     'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()
   })
   if(!response.ok)fail('stripe_checkout_creation_failed')
   const session=await response.json()
   if(!session||!/^cs_test_/.test(session.id||'')||!validUrl(session.url)||new URL(session.url).hostname!=='checkout.stripe.com')fail('stripe_invalid_checkout_session')
   return Object.freeze({provider:'stripe',mode:'sandbox',channel,sessionId:session.id,url:session.url})
  },
  async verifyNotification(raw,headers={}){
   const sig=headers['stripe-signature']||headers['Stripe-Signature']
   const payload=verifyStripeSignature(raw,sig,webhookSecret,now)
   if(payload.livemode!==false)fail('stripe_live_event_rejected')
   if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(payload.type))fail('stripe_event_not_supported')
   const session=payload.data?.object
   if(!session||session.object!=='checkout.session'||!/^cs_test_/.test(session.id||'')||
    session.payment_status!=='paid'||session.status!=='complete'||
    session.client_reference_id!==session.metadata?.orderId)fail('stripe_session_not_paid')
   if(!Number.isSafeInteger(session.amount_total)||session.amount_total<=0||!/^[a-z]{3}$/.test(session.currency||''))fail('stripe_invalid_amount')
   return {verifiedByProvider:true,provider:'stripe',mode:'sandbox',orderId:session.client_reference_id,
    amountCents:session.amount_total,currency:session.currency.toUpperCase(),transactionId:session.id,status:'succeeded'}
  }
 })
}
