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
 if(session.status==='complete')return session.payment_intent?.status==='canceled'?'failed':'processing'
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
