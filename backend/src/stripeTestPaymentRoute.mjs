// Disabled-by-default isolated Stripe lifecycle. No production fallback.
import {createHash} from 'node:crypto'
import {authenticate,permittedStore} from './auth.mjs'
import {verifyStripeSignature} from './stripeCheckoutGateway.mjs'
import {createStripeSandboxClient} from './stripeSandboxClient.mjs'
import {sandboxEnabled,assertSandboxDatabase} from './sandboxPaymentWorker.mjs'
import {reserveSandboxAttempt,materializeSandboxAttempt,applySandboxObservation,requestSandboxRefund,readSandboxPayment} from './sandboxPaymentStore.mjs'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const key=/^[A-Za-z0-9_-]{10,100}$/
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body))}
async function read(req){let n=0;const parts=[];for await(const part of req){n+=part.length;if(n>262144)throw Error('too_large');parts.push(Buffer.from(part))}return Buffer.concat(parts)}
async function json(req){try{const b=await read(req);return b.length?JSON.parse(b):{}}catch(e){if(e.message==='too_large')throw e;throw Error('invalid_json')}}
export async function stripeTestPaymentRoute(req,res,url,pool,env=process.env,deps={}){
 const match=/^\/v1\/(merchant\/)?stores\/([a-z0-9][a-z0-9-]{1,62})\/orders\/([a-f0-9-]{36})\/(stripe-test-checkout|sandbox-payment|sandbox-refund|sandbox-cancel)$/.exec(url.pathname)
 const webhook=url.pathname==='/v1/payments/stripe-test/webhook'
 if(!match&&!webhook)return false
 if(env.STRIPE_TEST_PAYMENTS_ENABLED!=='true'){reply(res,404,{error:'not_found'});return true}
 if(url.search||!['GET','POST'].includes(req.method)||webhook&&req.method!=='POST'){reply(res,405,{error:'method_not_allowed'});return true}
 if(env.PAYMENT_DB_ENV!=='isolated-test'||env.APP_ENV==='production'){reply(res,503,{error:'isolated_test_database_required'});return true}
 if(!sandboxEnabled(env)){reply(res,503,{error:'sandbox_lifecycle_not_enabled'});return true}
 try{
  await assertSandboxDatabase(pool,env)
  const client=deps.client||createStripeSandboxClient(env)
  if(webhook){
   const raw=await read(req),signed=verifyStripeSignature(raw,req.headers['stripe-signature'],env.STRIPE_TEST_WEBHOOK_SECRET)
   if(signed.livemode!==false||!/^evt_[A-Za-z0-9_]+$/.test(signed.id||'')||!Number.isSafeInteger(signed.created))throw Error('invalid_test_event')
   if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(signed.type)){
    reply(res,200,{received:true,ignored:true});return true
   }
   const s=signed.data?.object
   if(s?.object!=='checkout.session'||!/^cs_test_[A-Za-z0-9_]+$/.test(s.id||'')||!uuid.test(s.client_reference_id||''))throw Error('invalid_order_reference')
   let {rows:[attempt]}=await pool.query('SELECT * FROM sandbox_payment_attempts WHERE session_id=$1',[s.id])
   if(!attempt&&typeof s.metadata?.paymentAttemptKey==='string'){
    const bound=await pool.query(`UPDATE sandbox_payment_attempts SET session_id=$1,status='open',updated_at=clock_timestamp()
     WHERE request_key=$2 AND order_id=$3 AND status='creating' AND session_id IS NULL RETURNING *`,[s.id,s.metadata.paymentAttemptKey,s.client_reference_id])
    attempt=bound.rows[0]
   }
   if(!attempt){
    // Recover pre-ledger SBX-01 collections, including duplicate payments.
    const {rows:[order]}=await pool.query('SELECT id,total_cents,currency FROM orders WHERE id=$1',[s.client_reference_id])
    if(!order||order.currency!=='CNY')throw Error('payment_order_not_found')
    const channel=['card','alipay','wechat_pay'].includes(s.metadata?.channel)?s.metadata.channel:'card'
    const q=await pool.query(`INSERT INTO sandbox_payment_attempts(order_id,channel,amount_cents,currency,request_key,status,session_id,expires_at)
     VALUES($1,$2,$3,'CNY',$4,'expired',$5,clock_timestamp()) ON CONFLICT(session_id) DO UPDATE SET session_id=EXCLUDED.session_id RETURNING *`,
     [order.id,channel,order.total_cents,'legacy:'+s.id,s.id])
    attempt=q.rows[0]
   }
   const observation=await client.getSession(attempt)
   const result=await applySandboxObservation(pool,attempt,observation,{id:signed.id,type:signed.type,created:signed.created,hash:createHash('sha256').update(raw).digest('hex')})
   reply(res,200,{received:true,action:result.action});return true
  }
  const [,merchant,slug,orderId,action]=match
  if(!uuid.test(orderId))throw Error('invalid_order_reference')
  const subject=await (deps.authenticate||authenticate)(pool,req)
  if(!subject){reply(res,401,{error:'login_required'});return true}
  let store
  if(merchant){store=await (deps.permittedStore||permittedStore)(pool,subject,slug);if(!store){reply(res,403,{error:'forbidden'});return true}}
  const scoped=await pool.query(`SELECT o.id FROM orders o JOIN stores s ON s.id=o.store_id
   WHERE s.slug=$1 AND s.is_active=true AND o.id=$2 AND ($3::boolean OR o.customer_subject=$4)`,[slug,orderId,!!merchant,subject])
  if(!scoped.rows.length){reply(res,404,{error:'order_not_found'});return true}
  if(action==='sandbox-payment'&&req.method==='GET'){
   let stale=false
   const {rows}=await pool.query(`SELECT * FROM sandbox_payment_attempts WHERE order_id=$1 AND status IN ('creating','open','processing') ORDER BY created_at DESC LIMIT 1`,[orderId])
   if(rows[0])try{const a=await materializeSandboxAttempt(pool,client,rows[0]);await applySandboxObservation(pool,a,await client.getSession(a))}catch{stale=true}
   reply(res,200,{...await readSandboxPayment(pool,orderId),stale,canRefund:!!store&&['owner','manager'].includes(store.role)});return true
  }
  if(req.method!=='POST'){reply(res,405,{error:'method_not_allowed'});return true}
  if(action==='sandbox-refund'){
   if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
   if(env.STRIPE_TEST_REFUNDS_ENABLED!=='true'){reply(res,503,{error:'sandbox_refunds_disabled'});return true}
   const body=await json(req)
   if(!body||Object.keys(body).some(k=>k!=='amountCents'))throw Error('invalid_refund_request')
   const job=await requestSandboxRefund(pool,{orderId,subject,amountCents:body.amountCents,requestKey:req.headers['idempotency-key']})
   reply(res,202,{sandbox:true,refund:{id:job.id,status:job.status,amountCents:Number(job.amount_cents)}});return true
  }
  if(merchant){reply(res,403,{error:'customer_payment_only'});return true}
  if(action==='sandbox-cancel'){
   const {rows:[a]}=await pool.query(`SELECT * FROM sandbox_payment_attempts WHERE order_id=$1 AND status IN ('open','processing') ORDER BY created_at DESC LIMIT 1`,[orderId])
   if(a){
    const current=await client.getSession(a)
    const observation=current.session.status==='open'?await client.expire(a):current
    await applySandboxObservation(pool,a,observation)
    if(observation.session.status==='expired')await pool.query("UPDATE sandbox_payment_attempts SET status='cancelled' WHERE id=$1 AND status='expired'",[a.id])
   }
   reply(res,200,await readSandboxPayment(pool,orderId));return true
  }
  if(action!=='stripe-test-checkout'){reply(res,405,{error:'method_not_allowed'});return true}
  if(!key.test(req.headers['idempotency-key']||''))throw Error('invalid_idempotency_key')
  const input=await json(req)
  if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>k!=='channel'))throw Error('invalid_payment_channel')
  const channel=input.channel||'card'
  if(!env['STRIPE_TEST_'+String(channel).toUpperCase()+'_CONFIGURATION'])throw Error('stripe_channel_configuration_required')
  let a=await reserveSandboxAttempt(pool,{orderId,subject,channel,providerOptions:{
   methodConfiguration:env['STRIPE_TEST_'+String(channel).toUpperCase()+'_CONFIGURATION'],successUrl:env.STRIPE_TEST_SUCCESS_URL,cancelUrl:env.STRIPE_TEST_CANCEL_URL}})
  a=await materializeSandboxAttempt(pool,client,a)
  const observation=await client.getSession(a)
  await applySandboxObservation(pool,a,observation)
  if(observation.session.status!=='open'||observation.event)throw Error('payment_not_open_refresh')
  reply(res,200,{sessionId:a.session_id,url:a.checkout_url,channel:a.channel,provider:'stripe',testMode:true,nativePayment:false})
 }catch(e){
  const invalid=new Set(['invalid_json','invalid_payment_channel','invalid_refund_request','invalid_idempotency_key','stripe_signature_missing','stripe_signature_invalid','invalid_test_event','invalid_order_reference','stripe_session_mismatch','stripe_paid_intent_mismatch'])
  const conflict=new Set(['active_payment_channel_conflict','payment_not_open_refresh','refund_amount_exceeds_remaining','refund_idempotency_conflict','payment_order_not_payable','payment_manual_review_required','trusted_payment_required'])
  const status=e.message==='too_large'?413:invalid.has(e.message)?400:conflict.has(e.message)?409:503
  reply(res,status,{error:status===503?'payment_test_unavailable':e.message})
 }
 return true
}
