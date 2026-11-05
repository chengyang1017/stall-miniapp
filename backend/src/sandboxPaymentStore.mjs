import {createHash,randomUUID} from 'node:crypto'
import {prepareOrderPayment} from './orderPaymentPreparation.mjs'
import {settleVerifiedOrderPayment} from './paymentSettlementTransaction.mjs'
import {enqueueStripeTestRefunds} from './stripeTestRefundJobs.mjs'
const fail=code=>{throw Error(code)}
const sha=value=>createHash('sha256').update(value).digest('hex')
export async function sandboxTransaction(pool,fn){
 const db=await pool.connect();let active=false,broken=false,committing=false
 try{await db.query('BEGIN');active=true;await db.query("SET LOCAL statement_timeout='10000ms'");const value=await fn(db);committing=true;await db.query('COMMIT');active=false;return value}
 catch(e){broken=committing;if(active)try{await db.query('ROLLBACK')}catch{broken=true}throw e}
 finally{db.release(broken)}
}
export async function reserveSandboxAttempt(pool,{orderId,subject,channel,providerOptions=null}){
 if(!['card','alipay','wechat_pay'].includes(channel))fail('invalid_payment_channel')
 return sandboxTransaction(pool,async db=>{
  // Same lock ordering as checkout/cancel/settlement. Unique partial index is a second guard.
  await db.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[orderId])
  const existing=await db.query(`SELECT * FROM sandbox_payment_attempts WHERE order_id=$1
   AND status IN ('creating','open','processing','review') ORDER BY created_at DESC LIMIT 1`,[orderId])
  if(existing.rows.length){
   const own=await db.query('SELECT id FROM orders WHERE id=$1 AND customer_subject=$2',[orderId,subject])
   if(!own.rows.length)fail('payment_order_not_found')
   const a=existing.rows[0]
   if(a.channel!==channel)fail('active_payment_channel_conflict')
   return a
  }
  const payment=await prepareOrderPayment(db,{orderId,subject,requestKey:randomUUID()})
  if(payment.currency!=='CNY')fail('payment_currency_must_be_cny')
  const result=await db.query(`INSERT INTO sandbox_payment_attempts(order_id,channel,amount_cents,currency,request_key,expires_at,provider_options)
   VALUES($1,$2,$3,'CNY',$4,date_trunc('second',clock_timestamp()+interval '35 minutes'),$5::jsonb) RETURNING *`,
   [orderId,channel,payment.amountCents,payment.requestKey,providerOptions?JSON.stringify(providerOptions):null])
  return result.rows[0]
 })
}
export async function materializeSandboxAttempt(pool,client,attempt){
 if(attempt.status==='review')fail('payment_manual_review_required')
 if(attempt.session_id)return attempt
 // Unknown provider creation is retried with exactly the durable key/body. Never
 // retry past Stripe's idempotency retention window; block for manual review.
 if(Date.now()-new Date(attempt.created_at).getTime()>23*3600000){
  await pool.query("UPDATE sandbox_payment_attempts SET status='review',updated_at=clock_timestamp() WHERE id=$1 AND status='creating'",[attempt.id])
  fail('payment_manual_review_required')
 }
 const result=await client.create(attempt)
 const q=await pool.query(`UPDATE sandbox_payment_attempts SET session_id=$2,checkout_url=$3,status='open',updated_at=clock_timestamp()
  WHERE id=$1 AND status='creating' AND session_id IS NULL RETURNING *`,[attempt.id,result.sessionId,result.url])
 if(q.rows.length)return q.rows[0]
 const saved=await pool.query('SELECT * FROM sandbox_payment_attempts WHERE id=$1',[attempt.id])
 if(saved.rows[0]?.session_id!==result.sessionId)fail('payment_attempt_conflict')
 return saved.rows[0]
}
export function sandboxSessionState(session){
 if(session.payment_status==='paid')return 'succeeded'
 if(session.status==='expired')return 'expired'
 if(session.status==='complete')return ['canceled','requires_payment_method'].includes(session.payment_intent?.status)?'failed':'processing'
 if(session.payment_intent?.status==='requires_action')return 'processing'
 return 'open'
}
async function saveReceipt(db,attempt,observation,action){
 const {rows:items}=await db.query(`SELECT product_id AS "productId",product_name AS name,quantity,
 unit_price_cents AS "unitPriceCents",line_total_cents AS "lineTotalCents" FROM order_items WHERE order_id=$1 ORDER BY id`,[attempt.order_id])
 const {rows:[o]}=await db.query('SELECT subtotal_cents,delivery_fee_cents,total_cents FROM orders WHERE id=$1',[attempt.order_id])
 const text=JSON.stringify({version:1,sandbox:true,notice:'Stripe Sandbox 测试交易，不代表真实收款',orderId:attempt.order_id,
  items:items.map(i=>({...i,unitPriceCents:Number(i.unitPriceCents),lineTotalCents:Number(i.lineTotalCents)})),
  subtotalCents:Number(o.subtotal_cents),deliveryFeeCents:Number(o.delivery_fee_cents),totalCents:Number(o.total_cents),currency:'CNY',
  provider:'stripe:sandbox',requestedChannel:attempt.channel,channel:observation.actualChannel,
  transactionId:attempt.session_id,paymentIntentId:observation.paymentIntentId,
  paidAt:new Date((observation.session.payment_intent.latest_charge.created)*1000).toISOString(),settlement:action})
 await db.query(`INSERT INTO sandbox_payment_receipts(attempt_id,order_id,document_text,sha256) VALUES($1,$2,$3,$4)
  ON CONFLICT(attempt_id) DO NOTHING`,[attempt.id,attempt.order_id,text,sha(text)])
}
export async function applySandboxObservation(pool,attempt,observation,notification){
 return sandboxTransaction(pool,async db=>{
  await db.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[attempt.order_id])
  const {rows:[current]}=await db.query('SELECT * FROM sandbox_payment_attempts WHERE id=$1 FOR UPDATE',[attempt.id])
  if(!current||current.session_id!==observation.session.id)fail('payment_attempt_conflict')
  if(notification){
   const prior=await db.query('SELECT payload_sha256 FROM sandbox_payment_notifications WHERE event_id=$1',[notification.id])
   if(prior.rows.length&&prior.rows[0].payload_sha256!==notification.hash)fail('webhook_event_conflict')
   await db.query(`INSERT INTO sandbox_payment_notifications(event_id,event_type,session_id,order_id,payload_sha256,provider_created_at)
    VALUES($1,$2,$3,$4,$5,to_timestamp($6)) ON CONFLICT(event_id) DO NOTHING`,
    [notification.id,notification.type,current.session_id,current.order_id,notification.hash,notification.created])
   const persisted=await db.query('SELECT payload_sha256,order_id,session_id FROM sandbox_payment_notifications WHERE event_id=$1',[notification.id])
   if(persisted.rows[0]?.payload_sha256!==notification.hash||persisted.rows[0]?.order_id!==current.order_id||persisted.rows[0]?.session_id!==current.session_id)fail('webhook_event_conflict')
  }
  // Manual review is a durable safety hold. A delayed/replayed webhook must not
  // clear it, settle the order, generate a paid receipt or release the active slot.
  // Notification identity was audited above; resolution needs a separate reviewed path.
  if(current.status==='review')return {action:'review'}
  let state=sandboxSessionState(observation.session),action=state
  if(observation.event){
   const result=await settleVerifiedOrderPayment(pool,{event:observation.event,expectedProvider:'stripe',expectedMode:'sandbox',transaction:db})
   action=result.action;state=action==='refund_required'?'refund_required':'succeeded'
   if(state==='succeeded')await db.query("UPDATE orders SET payment_source='stripe:sandbox',paid_at=COALESCE(paid_at,clock_timestamp()) WHERE id=$1 AND payment_source IS DISTINCT FROM 'staging_simulated'",[current.order_id])
   await saveReceipt(db,current,observation,action)
   await enqueueStripeTestRefunds(db)
  }else if(['succeeded','refund_required','failed','expired','cancelled'].includes(current.status))return {action:current.status}
  // Failed async events are only terminal when current provider state agrees.
  if(notification?.type==='checkout.session.async_payment_failed'&&observation.session.status==='complete'&&!observation.event&&observation.session.payment_intent?.status==='requires_payment_method')state='failed'
  action=state
  await db.query(`UPDATE sandbox_payment_attempts SET status=$2,actual_channel=COALESCE($3,actual_channel),
   payment_intent_id=COALESCE($4,payment_intent_id),failure_code=$5,updated_at=clock_timestamp() WHERE id=$1`,[current.id,state,observation.actualChannel,observation.paymentIntentId,observation.failureCode||null])
  return {action}
 })
}
export async function requestSandboxRefund(pool,{orderId,subject,amountCents,requestKey}){
 if(!Number.isSafeInteger(amountCents)||amountCents<=0||typeof requestKey!=='string'||! /^[A-Za-z0-9_-]{10,100}$/.test(requestKey))fail('invalid_refund_request')
 return sandboxTransaction(pool,async db=>{
  const {rows:[order]}=await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[orderId])
  if(!order)fail('payment_order_not_found')
  const {rows:[prior]}=await db.query('SELECT * FROM stripe_test_refund_jobs WHERE request_key=$1',[requestKey])
  if(prior){if(prior.order_id!==orderId||Number(prior.amount_cents)!==amountCents||prior.requested_by!==subject)fail('refund_idempotency_conflict');return prior}
  const {rows:[payment]}=await db.query(`SELECT * FROM payment_events WHERE order_id=$1 AND provider='stripe:sandbox' AND event_type='payment_succeeded'`,[orderId])
  if(!payment)fail('trusted_payment_required')
  const {rows:[sum]}=await db.query(`SELECT COALESCE(SUM(amount_cents),0) AS reserved FROM stripe_test_refund_jobs
   WHERE order_id=$1 AND kind='merchant'`,[orderId])
  // Failed/ambiguous requests retain their reservation until a reviewed resolution;
  // creating another key must never cause over-refund after an unknown response.
  if(Number(sum.reserved)+amountCents>Number(payment.amount_cents))fail('refund_amount_exceeds_remaining')
  const {rows:[job]}=await db.query(`INSERT INTO stripe_test_refund_jobs(payment_event_id,order_id,checkout_session_id,amount_cents,kind,request_key,requested_by,payment_amount_cents)
   VALUES($1,$2,$3,$4,'merchant',$5,$6,$7) RETURNING *`,[payment.id,orderId,payment.provider_event_id,amountCents,requestKey,subject,payment.amount_cents])
  return job
 })
}
export async function readSandboxPayment(pool,orderId){
 const {rows:attempts}=await pool.query(`SELECT id,channel,actual_channel AS "actualChannel",amount_cents AS "amountCents",status,failure_code AS "failureCode",
  session_id AS "sessionId",created_at AS "createdAt",updated_at AS "updatedAt" FROM sandbox_payment_attempts WHERE order_id=$1 ORDER BY created_at`,[orderId])
 const {rows:refunds}=await pool.query(`SELECT id,amount_cents AS "amountCents",status,provider_status AS "providerStatus",kind,refund_id AS "refundId",created_at AS "createdAt" FROM stripe_test_refund_jobs WHERE order_id=$1 ORDER BY created_at`,[orderId])
 const {rows:records}=await pool.query('SELECT id,document_text,sha256 FROM sandbox_payment_receipts WHERE order_id=$1 ORDER BY created_at',[orderId])
 const receipts=records.map(r=>{if(sha(r.document_text)!==r.sha256)fail('receipt_integrity_failed');return {id:r.id,sha256:r.sha256,...JSON.parse(r.document_text)}})
 return {sandbox:true,attempts,refunds,receipts}
}

/** Release a review hold only for a provider-verified expired/unpaid Checkout.
 * The provider lookup happens before entering this transaction; expired is terminal.
 * Preserve immutable evidence and never alter order payment or issue a refund. */
export async function releaseExpiredSandboxReview(pool,{attempt,evidence,subject}){
 if(!attempt?.id||!attempt.order_id||!attempt.session_id||typeof subject!=='string'||!subject.length||subject.length>256)fail('invalid_review_release')
 if(evidence?.providerVerified!==true||evidence.readOnly!==true||
    evidence.sessionId!==attempt.session_id||evidence.amountCents!==Number(attempt.amount_cents)||
    evidence.currency!=='CNY'||evidence.sessionStatus!=='expired'||evidence.paymentStatus!=='unpaid'||
    evidence.paymentIntentStatus==='succeeded')fail('payment_review_not_expired_unpaid')
 return sandboxTransaction(pool,async db=>{
  await db.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[attempt.order_id])
  const {rows:[current]}=await db.query('SELECT * FROM sandbox_payment_attempts WHERE id=$1 FOR UPDATE',[attempt.id])
  if(!current||current.status!=='review'||current.order_id!==attempt.order_id||current.session_id!==attempt.session_id||
     current.amount_cents!=attempt.amount_cents||current.channel!==attempt.channel)fail('payment_review_state_changed')
  const {rows:[existing]}=await db.query(`SELECT 1 FROM payment_events
   WHERE order_id=$1 AND provider='stripe:sandbox' AND provider_event_id=$2
    AND event_type IN ('payment_succeeded','refund_required') LIMIT 1`,[attempt.order_id,attempt.session_id])
  if(existing)fail('payment_review_state_changed')
  const document=JSON.stringify({...evidence,resolution:'expired_unpaid_released'})
  const {rows:[audit]}=await db.query(`INSERT INTO sandbox_payment_review_evidence(attempt_id,order_id,reviewed_by,session_id,document_text,sha256)
   VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[current.id,current.order_id,subject,current.session_id,document,sha(document)])
  const changed=await db.query(`UPDATE sandbox_payment_attempts SET status='expired',updated_at=clock_timestamp()
   WHERE id=$1 AND status='review' RETURNING id`,[current.id])
  if(changed.rows.length!==1)fail('payment_review_state_changed')
  return {action:'expired_unpaid_released',auditId:audit.id}
 })
}

export async function queueSandboxMismatchRefund(pool,{attempt,evidence,subject}){
 if(!attempt?.id||!attempt.order_id||!attempt.session_id||typeof subject!=='string'||!subject.length||subject.length>256)throw Error('invalid_review_refund')
 if(evidence?.providerVerified!==true||evidence.readOnly!==true||
  evidence.sessionId!==attempt.session_id||evidence.amountCents!==Number(attempt.amount_cents)||
  evidence.currency!=='CNY'||evidence.sessionStatus!=='complete'||evidence.paymentStatus!=='paid'||
  evidence.paymentIntentStatus!=='succeeded'||evidence.channelMismatch!==true||
  evidence.requestedChannel!==attempt.channel||
  !['card','alipay','wechat_pay'].includes(evidence.actualChannel)||evidence.actualChannel===attempt.channel||
  !/^pi_[A-Za-z0-9_]+$/.test(evidence.paymentIntentId||''))throw Error('payment_review_refund_not_verified')
 return sandboxTransaction(pool,async db=>{
  await db.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[attempt.order_id])
  const {rows:[current]}=await db.query('SELECT * FROM sandbox_payment_attempts WHERE id=$1 FOR UPDATE',[attempt.id])
  if(!current||current.status!=='review'||current.order_id!==attempt.order_id||current.session_id!==attempt.session_id||
   Number(current.amount_cents)!==Number(attempt.amount_cents)||current.channel!==attempt.channel)throw Error('payment_review_state_changed')
  const {rows:[existing]}=await db.query('SELECT id,kind,status FROM stripe_test_refund_jobs WHERE checkout_session_id=$1 ORDER BY created_at LIMIT 1',[current.session_id])
  if(existing){
   if(existing.kind==='review_compensation')return {action:'already_queued',jobId:existing.id,status:existing.status}
   throw Error('payment_review_refund_conflict')
  }
  const {rows:[paid]}=await db.query(`SELECT 1 FROM payment_events WHERE order_id=$1 AND provider='stripe:sandbox'
   AND provider_event_id=$2 AND event_type IN ('payment_succeeded','refund_required') LIMIT 1`,[current.order_id,current.session_id])
  if(paid)throw Error('payment_review_refund_conflict')
  const document=JSON.stringify({...evidence,resolution:'mismatch_refund_queued'})
  const {rows:[audit]}=await db.query(`INSERT INTO sandbox_payment_review_evidence(attempt_id,order_id,reviewed_by,session_id,document_text,sha256)
   VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[current.id,current.order_id,subject,current.session_id,document,sha(document)])
  const {rows:[job]}=await db.query(`INSERT INTO stripe_test_refund_jobs(
   payment_event_id,order_id,checkout_session_id,amount_cents,kind,request_key,requested_by,payment_amount_cents,payment_intent_id)
   VALUES(NULL,$1,$2,$3,'review_compensation',$4,$5,$3,$6) RETURNING id,status`,
   [current.order_id,current.session_id,current.amount_cents,'review-mismatch:'+current.id,subject,evidence.paymentIntentId])
  return {action:'refund_queued',jobId:job.id,status:job.status,auditId:audit.id}
 })
}

/** Release a quarantined channel mismatch only after independently verified full refund.
 * Provider verification must precede this transaction; all local records are
 * rechecked under the order lock. No paid order event or receipt is written. */
export async function releaseRefundedSandboxReview(pool,{attempt,refund,status,subject}){
 if(!attempt?.id||!attempt.order_id||!attempt.session_id||
  typeof subject!=='string'||!subject.length||subject.length>256)fail('invalid_review_refund_release')
 if(refund?.kind!=='review_compensation'||refund.checkout_session_id!==attempt.session_id||
  refund.order_id!==attempt.order_id||refund.status!=='succeeded'||!/^re_[A-Za-z0-9_]+$/.test(refund.refund_id||'')||
  Number(refund.amount_cents)!==Number(attempt.amount_cents)||!/^pi_[A-Za-z0-9_]+$/.test(refund.payment_intent_id||''))fail('payment_refund_not_confirmed')
 if(status?.refundId!==refund.refund_id||status.status!=='succeeded'||status.completed!==true||
  status.paymentIntentId!==refund.payment_intent_id||status.amountCents!==Number(attempt.amount_cents))fail('payment_refund_not_confirmed')
 return sandboxTransaction(pool,async db=>{
  await db.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[attempt.order_id])
  const {rows:[current]}=await db.query('SELECT * FROM sandbox_payment_attempts WHERE id=$1 FOR UPDATE',[attempt.id])
  if(!current||current.status!=='review'||current.order_id!==attempt.order_id||
   current.session_id!==attempt.session_id||current.channel!==attempt.channel||
   Number(current.amount_cents)!==Number(attempt.amount_cents))fail('payment_review_state_changed')
  const {rows:[job]}=await db.query(`SELECT * FROM stripe_test_refund_jobs WHERE id=$1 FOR UPDATE`,[refund.id])
  if(!job||job.kind!=='review_compensation'||job.status!=='succeeded'||job.order_id!==current.order_id||
   job.checkout_session_id!==current.session_id||job.refund_id!==status.refundId||
   job.payment_intent_id!==status.paymentIntentId||Number(job.amount_cents)!==status.amountCents||
   job.provider_status!=='succeeded')fail('payment_refund_not_confirmed')
  const {rows:[other]}=await db.query(`SELECT 1 FROM stripe_test_refund_jobs WHERE checkout_session_id=$1 AND id<>$2 LIMIT 1`,[current.session_id,job.id])
  if(other)fail('payment_review_refund_conflict')
  const {rows:[payment]}=await db.query(`SELECT 1 FROM payment_events WHERE order_id=$1 AND provider='stripe:sandbox'
   AND provider_event_id=$2 AND event_type IN ('payment_succeeded','refund_required') LIMIT 1`,[current.order_id,current.session_id])
  if(payment)fail('payment_review_refund_conflict')
  const evidence=JSON.stringify({resolution:'mismatch_refund_verified',refundJobId:job.id,refundId:job.refund_id,
   paymentIntentId:job.payment_intent_id,amountCents:status.amountCents,currency:'CNY',providerStatus:'succeeded',checkedAt:new Date().toISOString()})
  const {rows:[audit]}=await db.query(`INSERT INTO sandbox_payment_review_evidence(attempt_id,order_id,reviewed_by,session_id,document_text,sha256)
   VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[current.id,current.order_id,subject,current.session_id,evidence,sha(evidence)])
  const changed=await db.query(`UPDATE sandbox_payment_attempts SET status='refunded',updated_at=clock_timestamp()
   WHERE id=$1 AND status='review' RETURNING id`,[current.id])
  if(changed.rows.length!==1)fail('payment_review_state_changed')
  return {action:'refund_verified_released',auditId:audit.id}
 })
}
