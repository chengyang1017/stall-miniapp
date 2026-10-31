import {createStripeSandboxClient} from './stripeSandboxClient.mjs'
import {createStripeTestRefundClient} from './stripeTestRefund.mjs'
import {enqueueStripeTestRefunds,processOneStripeTestRefund,reconcileOneSubmittedStripeTestRefund} from './stripeTestRefundJobs.mjs'
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
  WHERE o.id=r.order_id AND o.payment_status IN ('paid','partially_refunded')
  AND o.payment_status IS DISTINCT FROM CASE WHEN r.total>=o.total_cents THEN 'refunded' ELSE 'partially_refunded' END`)
}
export async function runSandboxMaintenance(pool,env,{client,refundClient}={}){
 if(!sandboxEnabled(env))return {disabled:true}
 await assertSandboxDatabase(pool,env)
 client||=createStripeSandboxClient(env)
 const {rows}=await pool.query(`SELECT * FROM sandbox_payment_attempts WHERE status IN ('creating','open','processing') ORDER BY updated_at,id LIMIT 10`)
 let recovered=0,unavailable=0
 for(let a of rows)try{
  a=await materializeSandboxAttempt(pool,client,a)
  await applySandboxObservation(pool,a,await client.getSession(a));recovered++
 }catch{unavailable++}
 let refund='disabled'
 if(env.STRIPE_TEST_REFUNDS_ENABLED==='true'){
  refundClient||=createStripeTestRefundClient({secretKey:env.STRIPE_TEST_SECRET_KEY})
  await enqueueStripeTestRefunds(pool)
  refund=(await processOneStripeTestRefund(pool,refundClient)).action
  await reconcileOneSubmittedStripeTestRefund(pool,refundClient)
  await syncSandboxRefundOrders(pool)
 }
 return {recovered,unavailable,refund}
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
