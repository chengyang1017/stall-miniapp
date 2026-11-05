import {createStripeSandboxClient} from './stripeSandboxClient.mjs'
import {createStripeTestRefundClient} from './stripeTestRefund.mjs'
import {enqueueStripeTestRefunds,processOneStripeTestRefund,reconcileOneSubmittedStripeTestRefund,reconcileOneUncertainStripeTestRefund} from './stripeTestRefundJobs.mjs'
import {materializeSandboxAttempt,applySandboxObservation} from './sandboxPaymentStore.mjs'
export const sandboxEnabled=env=>env.STRIPE_TEST_PAYMENTS_ENABLED==='true'&&env.SANDBOX_PAYMENT_LIFECYCLE_ENABLED==='true'&&env.PAYMENT_DB_ENV==='isolated-test'&&env.APP_ENV!=='production'
export async function assertSandboxDatabase(pool,env){
 if(!/^[0-9a-f-]{36}$/i.test(env.SANDBOX_PAYMENT_INSTANCE_ID||''))throw Error('sandbox_database_not_authorized')
 const {rows}=await pool.query(`SELECT 1 FROM sandbox_payment_environment WHERE singleton=true AND enabled=true
  AND instance_id=$1 AND database_name=current_database() AND application_role=current_user`,[env.SANDBOX_PAYMENT_INSTANCE_ID])
 if(rows.length!==1)throw Error('sandbox_database_not_authorized')
}
export async function syncSandboxRefundOrders(pool){
 // Refunds do not restock goods; receipts remain immutable.
 await pool.query(`UPDATE orders o SET payment_status=CASE WHEN r.total>=o.total_cents THEN 'refunded' ELSE 'partially_refunded' END,
  updated_at=clock_timestamp() FROM (SELECT order_id,SUM(amount_cents) AS total FROM stripe_test_refund_jobs
  WHERE kind='merchant' AND status='succeeded' GROUP BY order_id) r
  WHERE o.id=r.order_id AND o.payment_source='stripe:sandbox' AND o.payment_status IN ('paid','partially_refunded')
  AND o.payment_status IS DISTINCT FROM CASE WHEN r.total>=o.total_cents THEN 'refunded' ELSE 'partially_refunded' END`)
}
// A paid session on an unexpected channel needs operator review, not endless retries.
// Preserve the attempt and its Stripe identifiers for manual reconciliation.
export async function observeSandboxSession(pool,client,attempt){
 try{return await client.getSession(attempt)}
 catch(error){
  if(error?.message==='stripe_paid_channel_mismatch'){
   await pool.query(`UPDATE sandbox_payment_attempts SET status='review',updated_at=clock_timestamp()
    WHERE id=$1 AND session_id=$2 AND status IN ('open','processing')`,[attempt.id,attempt.session_id])
  }
  throw error
 }
}
export async function runSandboxMaintenance(pool,env,{client,refundClient}={}){
 if(!sandboxEnabled(env))return {disabled:true}
 await assertSandboxDatabase(pool,env)
 client||=createStripeSandboxClient(env)
 const {rows}=await pool.query(`SELECT * FROM sandbox_payment_attempts WHERE status IN ('creating','open','processing') ORDER BY updated_at,id LIMIT 10`)
 let recovered=0,unavailable=0
 for(let a of rows)try{
  a=await materializeSandboxAttempt(pool,client,a)
  await applySandboxObservation(pool,a,await observeSandboxSession(pool,client,a));recovered++
 }catch{unavailable++}
 // A terminal-looking Checkout can still acquire a late asynchronous payment,
 // even if Stripe's webhook was lost. Reconcile a bounded recent cohort without
 // reopening unpaid sessions; a verified late collection is settled or refunded
 // through the same idempotent transaction as normal webhooks.
 let lateRecovered=0,lateUnavailable=0
 // Late-checkout reconciliation is best-effort. A read/query failure here must
 // never prevent the independently durable refund queue from being processed.
 try{
  const {rows:late}=await pool.query(`SELECT * FROM sandbox_payment_attempts
   WHERE status IN ('failed','expired','cancelled') AND session_id IS NOT NULL
     AND created_at>clock_timestamp()-interval '48 hours'
     AND updated_at<clock_timestamp()-interval '10 minutes'
   ORDER BY updated_at,id LIMIT 5`)
  for(const a of late){
   try{
    const observation=await observeSandboxSession(pool,client,a)
    const outcome=await applySandboxObservation(pool,a,observation)
    if(outcome.action==='succeeded'||outcome.action==='refund_required'||outcome.action==='already_settled')lateRecovered++
   }catch{lateUnavailable++}
   // A failed scheduling update must not abort other reconciliations or refunds.
   // Never overwrite a state changed concurrently by a webhook.
   try{
    await pool.query(`UPDATE sandbox_payment_attempts SET updated_at=clock_timestamp()
     WHERE id=$1 AND status IN ('failed','expired','cancelled')`,[a.id])
   }catch{lateUnavailable++}
  }
 }catch{lateUnavailable++}
 let refund='disabled',refundFailures=0
 if(env.STRIPE_TEST_REFUNDS_ENABLED==='true'){
  // A database/provider failure in one queue phase must not block reconciliation
  // of other already-submitted or uncertain refunds. Never retry an unknown POST.
  const phase=async fn=>{
   try{return await fn()}
   catch{refundFailures++;return null}
  }
  await phase(()=>enqueueStripeTestRefunds(pool))
  try{refundClient||=createStripeTestRefundClient({secretKey:env.STRIPE_TEST_SECRET_KEY})}
  catch{refundFailures++}
  if(refundClient){
   const submitted=await phase(()=>processOneStripeTestRefund(pool,refundClient))
   refund=submitted?.action||'unavailable'
   await phase(()=>reconcileOneSubmittedStripeTestRefund(pool,refundClient))
   await phase(()=>reconcileOneUncertainStripeTestRefund(pool,refundClient))
  }else refund='unavailable'
  // Keep merchant-facing order status in sync even if a different refund job
  // cannot currently be reconciled with Stripe.
  await phase(()=>syncSandboxRefundOrders(pool))
 }
 return {recovered,unavailable,lateRecovered,lateUnavailable,refund,refundFailures}
}
export function startSandboxPaymentWorker(pool,env=process.env){
 if(!sandboxEnabled(env)||env.SANDBOX_PAYMENT_WORKER_ENABLED!=='true')return async()=>{}
 let stopped=false,timer,job=Promise.resolve()
 const tick=()=>{job=runSandboxMaintenance(pool,env).catch(()=>{console.error('Sandbox payment recovery unavailable')}).finally(()=>{
  if(!stopped){timer=setTimeout(tick,30000);timer.unref()}
 })}
 tick()
 return async()=>{stopped=true;clearTimeout(timer);await job}
}
