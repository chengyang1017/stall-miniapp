// Keep old deployments independent of migration 027 while the lifecycle is off.
import {verifiedFulfillmentPayment as stagingFulfillmentPayment} from './stagingPayments.mjs'
import {sandboxEnabled,assertSandboxDatabase} from './sandboxPaymentWorker.mjs'
export async function verifiedFulfillmentPayment(db,order,env=process.env,profiles){
 if(order?.payment_source!=='stripe:sandbox')return stagingFulfillmentPayment(db,order,env,profiles)
 if(order.payment_status!=='paid'||!sandboxEnabled(env))return false
 try{
  await assertSandboxDatabase(db,env)
  const {rows}=await db.query(`SELECT 1 FROM orders o JOIN sandbox_payment_attempts a ON a.order_id=o.id
   JOIN sandbox_payment_receipts r ON r.attempt_id=a.id
   JOIN payment_events e ON e.order_id=o.id AND e.provider_event_id=a.session_id
   WHERE o.id=$1 AND o.payment_status='paid' AND a.status='succeeded'
    AND e.provider='stripe:sandbox' AND e.event_type='payment_succeeded' AND e.amount_cents=o.total_cents`,[order.id])
  return rows.length===1
 }catch{return false}
}
export function sandboxOrderColumns(alias='o',env=process.env){
 if(env.STRIPE_TEST_PAYMENTS_ENABLED!=='true'||env.SANDBOX_PAYMENT_LIFECYCLE_ENABLED!=='true'||env.PAYMENT_DB_ENV!=='isolated-test'||env.APP_ENV==='production')return ''
 if(alias!=='o')throw Error('invalid_order_alias')
 return `,(SELECT CASE WHEN a.status='open' AND a.failure_code IS NOT NULL THEN 'failed_retryable' ELSE a.status END FROM sandbox_payment_attempts a WHERE a.order_id=o.id ORDER BY a.created_at DESC LIMIT 1) AS "sandboxPaymentStatus",
 (SELECT j.status FROM stripe_test_refund_jobs j WHERE j.order_id=o.id ORDER BY j.created_at DESC LIMIT 1) AS "sandboxRefundStatus"`
}
