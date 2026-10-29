// Shared payment-provider contract. No endpoint activation or checkout mutation.
// A provider must verify its own signed server-to-server notifications before
// returning a normalized settlement; browser/client claims are never trusted.
const modes=new Set(['sandbox','live'])
const money=/^[A-Z]{3}$/
const id=/^[a-z0-9][a-z0-9._:-]{0,127}$/i
const must=(v,reason)=>{if(!v)throw Error(reason)}
export function paymentRequest({orderId,amountCents,currency,requestKey}){
 must(typeof orderId==='string'&&id.test(orderId),'invalid_order_id')
 must(Number.isSafeInteger(amountCents)&&amountCents>0,'invalid_amount')
 must(typeof currency==='string'&&money.test(currency),'invalid_currency')
 must(typeof requestKey==='string'&&id.test(requestKey),'invalid_request_key')
 return Object.freeze({orderId,amountCents,currency,requestKey})
}
export function verifiedPaymentEvent(event,request,{provider,mode}){
 must(event?.verifiedByProvider===true,'unverified_payment_notification')
 must(event.provider===provider&&event.mode===mode,'payment_environment_mismatch')
 must(event.orderId===request.orderId,'payment_order_mismatch')
 must(event.amountCents===request.amountCents&&event.currency===request.currency,'payment_amount_mismatch')
 must(typeof event.transactionId==='string'&&id.test(event.transactionId),'invalid_transaction_id')
 must(event.status==='succeeded','payment_not_succeeded')
 return Object.freeze({provider,mode,orderId:request.orderId,transactionId:event.transactionId,amountCents:request.amountCents,currency:request.currency,status:'succeeded'})
}
export function createPaymentGateway({provider,mode,createPayment,verifyNotification}){
 must(typeof provider==='string'&&id.test(provider),'invalid_provider')
 must(modes.has(mode),'invalid_payment_mode')
 must(typeof createPayment==='function'&&typeof verifyNotification==='function','payment_provider_implementation_required')
 return Object.freeze({
  provider,mode,
  async create(request){
   const validated=paymentRequest(request)
   return createPayment(validated)
  },
  async verifyNotification(raw,{request,headers}){
   // verifyNotification MUST authenticate the provider's signature using its
   // official algorithm, then look up the expected order on our server.
   const verified=await verifyNotification(raw,headers)
   return verifiedPaymentEvent(verified,paymentRequest(request),{provider,mode})
  }
 })
}
// Test-only fake provider: deliberately never exported for use by server.mjs.
// Actual WeChat Pay adapter will call the appropriate official merchant API.
