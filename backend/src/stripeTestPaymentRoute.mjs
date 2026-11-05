// Disabled-by-default isolated Stripe lifecycle. No production fallback.
import {createHash} from 'node:crypto'
import {authenticate,permittedStore} from './auth.mjs'
import {verifyStripeSignature} from './stripeCheckoutGateway.mjs'
import {createStripeSandboxClient} from './stripeSandboxClient.mjs'
import {createStripeTestRefundClient} from './stripeTestRefund.mjs'
import {sandboxEnabled,assertSandboxDatabase,observeSandboxSession} from './sandboxPaymentWorker.mjs'
import {reserveSandboxAttempt,materializeSandboxAttempt,applySandboxObservation,requestSandboxRefund,readSandboxPayment,releaseExpiredSandboxReview,queueSandboxMismatchRefund,releaseRefundedSandboxReview} from './sandboxPaymentStore.mjs'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const key=/^[A-Za-z0-9_-]{10,100}$/
export const sandboxCancellationPending=observation=>observation.session.status==='complete'&&!observation.event
export const sandboxCancellationConflict=observation=>observation.event?'payment_already_collected':sandboxCancellationPending(observation)?'payment_cancellation_pending':observation.session.status!=='expired'?'payment_cancellation_unconfirmed':null
export const sandboxCheckoutStillOpen=(attempt,persisted)=>persisted?.status==='open'&&persisted.session_id===attempt.session_id&&persisted.checkout_url===attempt.checkout_url
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body))}
async function read(req){let n=0;const parts=[];for await(const part of req){n+=part.length;if(n>262144)throw Error('too_large');parts.push(Buffer.from(part))}return Buffer.concat(parts)}
async function json(req){try{const b=await read(req);return b.length?JSON.parse(b):{}}catch(e){if(e.message==='too_large')throw e;throw Error('invalid_json')}}
export async function stripeTestPaymentRoute(req,res,url,pool,env=process.env,deps={}){
 const match=/^\/v1\/(merchant\/)?stores\/([a-z0-9][a-z0-9-]{1,62})\/orders\/([a-f0-9-]{36})\/(stripe-test-checkout|sandbox-payment|sandbox-refund|sandbox-cancel|sandbox-review|sandbox-review-verify|sandbox-review-release|sandbox-review-refund|sandbox-review-refund-release)$/.exec(url.pathname)
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
   // A review hold must remain immutable even if a signed event is delivered again.
   // Audit the event by its already-bound Session without retrying a provider lookup
   // that may repeatedly fail on the known channel mismatch.
   if(attempt.status==='review'&&(s.client_reference_id!==attempt.order_id||s.metadata?.orderId!==attempt.order_id))throw Error('invalid_order_reference')
   const observation=attempt.status==='review'?{session:{id:attempt.session_id}}:await observeSandboxSession(pool,client,attempt)
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
  if(action==='sandbox-review-refund-release'){
   if(req.method!=='POST'){reply(res,405,{error:'method_not_allowed'});return true}
   if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
   if(env.STRIPE_TEST_REFUNDS_ENABLED!=='true'){reply(res,503,{error:'sandbox_refunds_disabled'});return true}
   const body=await json(req)
   if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)throw Error('invalid_review_refund_release')
   const {rows:[attempt]}=await pool.query(`SELECT * FROM sandbox_payment_attempts
    WHERE order_id=$1 AND status='review' ORDER BY created_at DESC LIMIT 1`,[orderId])
   if(!attempt){reply(res,404,{error:'payment_review_not_found'});return true}
   const {rows:[refund]}=await pool.query(`SELECT * FROM stripe_test_refund_jobs
    WHERE checkout_session_id=$1 AND order_id=$2 AND kind='review_compensation'
    ORDER BY created_at DESC LIMIT 1`,[attempt.session_id,orderId])
   if(!refund||refund.status!=='succeeded'||!refund.refund_id){reply(res,409,{error:'payment_refund_not_confirmed'});return true}
   const refundClient=deps.refundClient||createStripeTestRefundClient({secretKey:env.STRIPE_TEST_SECRET_KEY})
   const status=await refundClient.getRefundStatus(refund.refund_id)
   const result=await releaseRefundedSandboxReview(pool,{attempt,refund,status,subject})
   reply(res,200,{sandbox:true,action:result.action,auditId:result.auditId,paymentConfirmed:false});return true
  }
  if(action==='sandbox-review-refund'){
   if(req.method!=='POST'){reply(res,405,{error:'method_not_allowed'});return true}
   if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
   if(env.STRIPE_TEST_REFUNDS_ENABLED!=='true'){reply(res,503,{error:'sandbox_refunds_disabled'});return true}
   const body=await json(req)
   if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)throw Error('invalid_review_refund')
   const {rows:[attempt]}=await pool.query(`SELECT * FROM sandbox_payment_attempts WHERE order_id=$1
    AND status='review' ORDER BY created_at DESC LIMIT 1`,[orderId])
   if(!attempt){reply(res,404,{error:'payment_review_not_found'});return true}
   if(!attempt.session_id)throw Error('payment_manual_review_required')
   const evidence=await client.inspectReview(attempt)
   const result=await queueSandboxMismatchRefund(pool,{attempt,evidence,subject})
   reply(res,202,{sandbox:true,action:result.action,jobId:result.jobId,
    refundStatus:result.status,auditId:result.auditId||null,paymentConfirmed:false});return true
  }
  if(action==='sandbox-review-release'){
   if(req.method!=='POST'){reply(res,405,{error:'method_not_allowed'});return true}
   if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
   const payload=await json(req)
   if(!payload||Array.isArray(payload)||typeof payload!=='object'||Object.keys(payload).length!==0)throw Error('invalid_review_release')
   const {rows:[attempt]}=await pool.query(`SELECT * FROM sandbox_payment_attempts
    WHERE order_id=$1 AND status='review' ORDER BY created_at DESC LIMIT 1`,[orderId])
   if(!attempt){reply(res,404,{error:'payment_review_not_found'});return true}
   if(!attempt.session_id)throw Error('payment_manual_review_required')
   const evidence=await client.inspectReview(attempt)
   const result=await releaseExpiredSandboxReview(pool,{attempt,evidence,subject})
   reply(res,200,{sandbox:true,readOnly:false,action:result.action,auditId:result.auditId,paymentConfirmed:false});return true
  }
  if(action==='sandbox-review-verify'){
   if(req.method!=='GET'){reply(res,405,{error:'method_not_allowed'});return true}
   if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
   const {rows:[attempt]}=await pool.query(`SELECT * FROM sandbox_payment_attempts
    WHERE order_id=$1 AND status='review' ORDER BY created_at DESC LIMIT 1`,[orderId])
   if(!attempt){reply(res,404,{error:'payment_review_not_found'});return true}
   if(!attempt.session_id){reply(res,200,{sandbox:true,readOnly:true,requiresManualReview:true,
    providerVerified:false,verificationUnavailable:'session_not_recorded',resolutionAllowed:false});return true}
   const evidence=await client.inspectReview(attempt)
   // Store only identity-validated, provider-retrieved evidence. No browser claims.
   if(evidence.providerVerified!==true||evidence.readOnly!==true||evidence.sessionId!==attempt.session_id||
    evidence.amountCents!==Number(attempt.amount_cents)||evidence.currency!=='CNY')throw Error('stripe_review_evidence_invalid')
   const document=JSON.stringify(evidence)
   const saved=await pool.query(`INSERT INTO sandbox_payment_review_evidence(
    attempt_id,order_id,reviewed_by,session_id,document_text,sha256)
    SELECT id,order_id,$3,session_id,$4,$5 FROM sandbox_payment_attempts
    WHERE id=$1 AND order_id=$2 AND status='review' AND session_id=$6 RETURNING id,created_at AS "createdAt"`,
    [attempt.id,orderId,subject,document,createHash('sha256').update(document).digest('hex'),attempt.session_id])
   if(saved.rows.length!==1)throw Error('payment_review_state_changed')
   reply(res,200,{sandbox:true,readOnly:true,requiresManualReview:true,
    evidence,auditId:saved.rows[0].id,auditedAt:saved.rows[0].createdAt,resolutionAllowed:false});return true
  }
  if(action==='sandbox-review'){
   // Read-only operator evidence; never manually assert collection or release a hold.
   if(req.method!=='GET'){reply(res,405,{error:'method_not_allowed'});return true}
   if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
   const {rows:[attempt]}=await pool.query(`SELECT id,order_id AS "orderId",channel,actual_channel AS "actualChannel",
    amount_cents AS "amountCents",currency,status,session_id AS "sessionId",payment_intent_id AS "paymentIntentId",
    created_at AS "createdAt",updated_at AS "updatedAt" FROM sandbox_payment_attempts
    WHERE order_id=$1 AND status='review' ORDER BY created_at DESC LIMIT 1`,[orderId])
   if(!attempt){reply(res,404,{error:'payment_review_not_found'});return true}
   const {rows:[audit]}=await pool.query(`SELECT COUNT(*)::integer AS "notificationCount",
    MAX(received_at) AS "lastNotificationAt" FROM sandbox_payment_notifications
    WHERE order_id=$1 AND session_id=$2`,[orderId,attempt.sessionId||''])
   const {rows:[latest]}=await pool.query(`SELECT id,created_at AS "createdAt",reviewed_by AS "reviewedBy",document_text AS "documentText",sha256
    FROM sandbox_payment_review_evidence WHERE attempt_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`,[attempt.id])
   if(latest&&createHash('sha256').update(latest.documentText).digest('hex')!==latest.sha256)throw Error('review_evidence_integrity_failed')
   reply(res,200,{sandbox:true,readOnly:true,requiresManualReview:true,attempt,
    notificationCount:audit?.notificationCount||0,lastNotificationAt:audit?.lastNotificationAt||null,
    latestVerification:latest?{id:latest.id,createdAt:latest.createdAt,reviewedBy:latest.reviewedBy,evidence:JSON.parse(latest.documentText)}:null,
    resolutionAllowed:false});return true
  }
  if(action==='sandbox-payment'&&req.method==='GET'){
   let stale=false
   const {rows}=await pool.query(`SELECT * FROM sandbox_payment_attempts WHERE order_id=$1 AND status IN ('creating','open','processing','review') ORDER BY created_at DESC LIMIT 1`,[orderId])
   if(rows[0]?.status==='review')stale=true
   else if(rows[0])try{const a=await materializeSandboxAttempt(pool,client,rows[0]);await applySandboxObservation(pool,a,await observeSandboxSession(pool,client,a))}catch{stale=true}
   reply(res,200,{...await readSandboxPayment(pool,orderId),stale,canRefund:env.STRIPE_TEST_REFUNDS_ENABLED==='true'&&!!store&&['owner','manager'].includes(store.role)});return true
  }
  if(req.method!=='POST'){reply(res,405,{error:'method_not_allowed'});return true}
  if(action==='sandbox-refund'){
   if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
   if(env.STRIPE_TEST_REFUNDS_ENABLED!=='true'){reply(res,503,{error:'sandbox_refunds_disabled'});return true}
   const body=await json(req)
   if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>k!=='amountCents')||
    !Number.isSafeInteger(body.amountCents)||body.amountCents<=0||!key.test(req.headers['idempotency-key']||''))throw Error('invalid_refund_request')
   const job=await requestSandboxRefund(pool,{orderId,subject,amountCents:body.amountCents,requestKey:req.headers['idempotency-key']})
   reply(res,202,{sandbox:true,refund:{id:job.id,status:job.status,amountCents:Number(job.amount_cents)}});return true
  }
  if(merchant){reply(res,403,{error:'customer_payment_only'});return true}
  if(action==='sandbox-cancel'){
   const {rows:[a]}=await pool.query(`SELECT * FROM sandbox_payment_attempts WHERE order_id=$1 AND status IN ('creating','open','processing','review') ORDER BY created_at DESC LIMIT 1`,[orderId])
   // A creating/review attempt may have reached Stripe without a persisted Session ID.
   // Never claim cancellation before that provider outcome can be verified.
   if(a?.status==='creating'||a?.status==='review'||a&&!a.session_id)throw Error('payment_cancellation_requires_review')
   if(a){
    const current=await observeSandboxSession(pool,client,a)
    const observation=current.session.status==='open'?await client.expire(a):current
    await applySandboxObservation(pool,a,observation)
    // A confirmed collection must settle, but cancellation must not return success.
    // An asynchronous method can complete Checkout while payment is still pending.
    // Do not let the customer switch channels until provider settlement is resolved.
    const conflict=sandboxCancellationConflict(observation)
    if(conflict)throw Error(conflict)
    const changed=await pool.query("UPDATE sandbox_payment_attempts SET status='cancelled' WHERE id=$1 AND status='expired' RETURNING id",[a.id])
    if(changed.rows.length!==1)throw Error('payment_cancellation_state_changed')
   }else{
    // A paid attempt is no longer active; do not mistake its absence for a successful cancel.
    const {rows:[collected]}=await pool.query("SELECT 1 FROM sandbox_payment_attempts WHERE order_id=$1 AND status IN ('succeeded','refund_required') LIMIT 1",[orderId])
    if(collected)throw Error('payment_already_collected')
   }
   reply(res,200,await readSandboxPayment(pool,orderId));return true
  }
  if(action!=='stripe-test-checkout'){reply(res,405,{error:'method_not_allowed'});return true}
  if(!key.test(req.headers['idempotency-key']||''))throw Error('invalid_idempotency_key')
  const input=await json(req)
  if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>k!=='channel'))throw Error('invalid_payment_channel')
  const channel=input.channel===undefined?'card':input.channel
  if(!['card','alipay','wechat_pay'].includes(channel))throw Error('invalid_payment_channel')
  if(!env['STRIPE_TEST_'+channel.toUpperCase()+'_CONFIGURATION'])throw Error('stripe_channel_configuration_required')
  let a=await reserveSandboxAttempt(pool,{orderId,subject,channel,providerOptions:{
   methodConfiguration:env['STRIPE_TEST_'+String(channel).toUpperCase()+'_CONFIGURATION'],successUrl:env.STRIPE_TEST_SUCCESS_URL,cancelUrl:env.STRIPE_TEST_CANCEL_URL}})
  a=await materializeSandboxAttempt(pool,client,a)
  const observation=await observeSandboxSession(pool,client,a)
  await applySandboxObservation(pool,a,observation)
  if(observation.session.status!=='open'||observation.event)throw Error('payment_not_open_refresh')
  const {rows:[persisted]}=await pool.query("SELECT status,session_id,checkout_url FROM sandbox_payment_attempts WHERE id=$1",[a.id])
  if(!sandboxCheckoutStillOpen(a,persisted))throw Error('payment_not_open_refresh')
  reply(res,200,{sessionId:a.session_id,url:a.checkout_url,channel:a.channel,provider:'stripe',testMode:true,nativePayment:false})
 }catch(e){
  const invalid=new Set(['invalid_json','invalid_payment_channel','invalid_refund_request','invalid_idempotency_key','stripe_signature_missing','stripe_signature_invalid','invalid_test_event','invalid_order_reference','invalid_review_release','invalid_review_refund','invalid_review_refund_release','stripe_session_mismatch','stripe_paid_intent_mismatch'])
  const conflict=new Set(['active_payment_channel_conflict','payment_not_open_refresh','refund_amount_exceeds_remaining','refund_idempotency_conflict','payment_order_not_payable','payment_manual_review_required','payment_cancellation_requires_review','payment_cancellation_pending','payment_already_collected','payment_cancellation_unconfirmed','payment_cancellation_state_changed','payment_review_state_changed','payment_review_not_expired_unpaid','payment_review_refund_not_verified','payment_refund_not_confirmed','payment_review_refund_conflict','trusted_payment_required'])
  const status=e.message==='too_large'?413:invalid.has(e.message)?400:conflict.has(e.message)?409:503
  reply(res,status,{error:status===503?'payment_test_unavailable':e.message})
 }
 return true
}
