// Stripe test-only HTTP integration. Off by default.
import {authenticate} from './auth.mjs'
import {prepareOrderPayment} from './orderPaymentPreparation.mjs'
import {createStripeCheckoutGateway,verifyStripeSignature} from './stripeCheckoutGateway.mjs'
import {settleVerifiedOrderPayment} from './paymentSettlementTransaction.mjs'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const key=/^[A-Za-z0-9_-]{10,100}$/
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body))}
async function read(req){let n=0;const parts=[];for await(const part of req){n+=part.length;if(n>262144)throw Error('too_large');parts.push(part)}return Buffer.concat(parts)}
export async function stripeTestPaymentRoute(req,res,url,pool,env=process.env){
 const checkout=/^\/v1\/stores\/([a-z0-9][a-z0-9-]{1,62})\/orders\/([a-f0-9-]{36})\/stripe-test-checkout$/.exec(url.pathname)
 const webhook=url.pathname==='/v1/payments/stripe-test/webhook'
 if(!checkout&&!webhook)return false
 if(env.STRIPE_TEST_PAYMENTS_ENABLED!=='true'){reply(res,404,{error:'not_found'});return true}
 if(req.method!=='POST'||url.search){reply(res,405,{error:'method_not_allowed'});return true}
 if(env.PAYMENT_DB_ENV!=='isolated-test'){reply(res,503,{error:'isolated_test_database_required'});return true}
 let gateway
 try{gateway=createStripeCheckoutGateway({secretKey:env.STRIPE_TEST_SECRET_KEY,webhookSecret:env.STRIPE_TEST_WEBHOOK_SECRET,successUrl:env.STRIPE_TEST_SUCCESS_URL,cancelUrl:env.STRIPE_TEST_CANCEL_URL})}
 catch{reply(res,503,{error:'stripe_test_configuration_missing'});return true}
 try{
  if(checkout){
   if(!uuid.test(checkout[2])){reply(res,400,{error:'invalid_order'});return true}
   const subject=await authenticate(pool,req)
   if(!subject){reply(res,401,{error:'login_required'});return true}
   const requestKey=req.headers['idempotency-key']
   if(typeof requestKey!=='string'||!key.test(requestKey)){reply(res,400,{error:'invalid_idempotency_key'});return true}
   const scoped=await pool.query('SELECT 1 FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.slug=$1 AND s.is_active=true AND o.id=$2 AND o.customer_subject=$3',[checkout[1],checkout[2],subject])
   if(!scoped.rows.length){reply(res,404,{error:'order_not_found'});return true}
   const payment=await prepareOrderPayment(pool,{orderId:checkout[2],subject,requestKey})
   const result=await gateway.create(payment)
   reply(res,200,{sessionId:result.sessionId,url:result.url,testMode:true});return true
  }
  const raw=await read(req)
  const signed=verifyStripeSignature(raw,req.headers['stripe-signature'],env.STRIPE_TEST_WEBHOOK_SECRET)
  if(signed.livemode!==false){reply(res,400,{error:'invalid_test_event'});return true}
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(signed.type)){reply(res,200,{received:true,ignored:true});return true}
  const id=signed.data?.object?.client_reference_id
  if(typeof id!=='string'||!uuid.test(id)){reply(res,400,{error:'invalid_order_reference'});return true}
  const q=await pool.query('SELECT id,total_cents,currency FROM orders WHERE id=$1',[id])
  if(q.rows.length!==1){reply(res,404,{error:'order_not_found'});return true}
  const o=q.rows[0]
  const event=await gateway.verifyNotification(raw,{request:{orderId:o.id,amountCents:Number(o.total_cents),currency:o.currency,requestKey:'verified-webhook'},headers:req.headers})
  const result=await settleVerifiedOrderPayment(pool,{event,expectedProvider:'stripe',expectedMode:'sandbox'})
  reply(res,200,{received:true,action:result.action})
 }catch(e){
  const safe=new Set(['stripe_signature_invalid','stripe_signature_missing','payment_amount_mismatch','payment_order_mismatch','stripe_session_not_paid','payment_window_expired','order_not_payable'])
  const code=e.message==='too_large'?413:safe.has(e.message)?400:503
  reply(res,code,{error:code===503?'payment_test_unavailable':e.message})
 }
 return true
}
