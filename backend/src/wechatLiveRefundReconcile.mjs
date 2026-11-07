// Optional read-only remote WeChat refund status reconciliation.
// NEVER issues a new refund/payment request; one merchant / one store only.
// Start only after the live refund integration has been approved and enabled.
import {wechatPayLiveConfig,wechatPayV3} from './wechatPayV3.mjs'
import {applyVerifiedRefund} from './wechatLiveRefundRoute.mjs'
import {randomUUID} from 'node:crypto'
const fail=code=>Object.assign(Error(code),{code})
export const reconcileEnabled=(env=process.env)=>env.APP_ENV==='production'&&
 env.WECHAT_PAY_LIVE_ENABLED==='true'&&env.WECHAT_PAY_LIVE_REFUNDS_ENABLED==='true'&&
 env.WECHAT_PAY_REFUND_RECONCILE_ENABLED==='true'&&env.PAYMENT_DB_ENV!=='isolated-test'
export const nextDelaySeconds=(attempt,status)=>{
 if(['succeeded','closed'].includes(status))return 0
 if(['abnormal','review'].includes(status))return 21600 // 6h; merchant must review
 const schedule=[60,120,300,600,1200,1800,3600,7200,14400,21600]
 return schedule[Math.min(Math.max(attempt,0),schedule.length-1)]
}
export async function runWechatRefundReconciliation(pool,env=process.env,deps={}){
 if(!reconcileEnabled(env))return {enabled:false,claimed:0,checked:0,failed:0}
 const cfg=wechatPayLiveConfig(env)
 if(!cfg?.refundsEnabled)throw fail('refund_reconcile_not_configured')
 const pay=deps.pay||wechatPayV3(cfg),batch=Number(env.WECHAT_PAY_REFUND_RECONCILE_BATCH||8)
 if(!Number.isInteger(batch)||batch<1||batch>20)throw fail('refund_reconcile_invalid_batch')
 const token=randomUUID()
 const q=await pool.query(
  "WITH eligible AS ( "+
  "SELECT r.id FROM wechat_live_refunds r JOIN stores s ON s.id=r.store_id "+
  "WHERE s.slug=$1 AND r.status IN ('pending','submitting','unknown','processing','review','abnormal') "+
  "AND r.reconcile_next_at<=clock_timestamp() "+
  "AND (r.reconcile_lease_until IS NULL OR r.reconcile_lease_until<clock_timestamp()) "+
  "ORDER BY r.reconcile_next_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT $2 "+
  ") UPDATE wechat_live_refunds r "+
  "SET reconcile_lease_token=$3::uuid,reconcile_lease_until=clock_timestamp()+interval '2 minutes' "+
  "FROM eligible e WHERE r.id=e.id "+
  "RETURNING r.id,r.store_id,r.out_refund_no,r.status,r.reconcile_attempts",
  [cfg.storeSlug,batch,token])
 let checked=0,failed=0
 for(const row of q.rows){
  let outcome=null,error=null
  try{
   // A refund was already requested (possibly before a crash).
   // GET its original refund number; NEVER retry a refund POST.
   const remote=await pay.queryRefund(row.out_refund_no)
   const update=await applyVerifiedRefund(pool,{refundId:row.id,storeId:row.store_id,
    observation:remote,config:cfg})
   outcome=update.status;checked++
  }catch(e){
   // Sanitize for database telemetry; never persist response bodies or secrets.
   const raw=String(e?.code||e?.message||'unknown')
   error=/^(wechatpay_[a-z0-9_]{1,80}|invalid_[a-z0-9_]{1,80})$/.test(raw)?raw:'refund_reconcile_unknown'
   failed++
  }
  const attempt=Number(row.reconcile_attempts)
  const delay=nextDelaySeconds(Number.isSafeInteger(attempt)?attempt:9,outcome||row.status)
  // Lease-token check prevents stale workers from releasing a newer owner's lease.
  await pool.query("UPDATE wechat_live_refunds SET reconcile_lease_token=NULL,reconcile_lease_until=NULL, "+
   "reconcile_next_at=clock_timestamp()+($3::int*interval '1 second'), "+
   "reconcile_attempts=reconcile_attempts+1, "+
   "last_error=CASE WHEN $4::text IS NULL THEN last_error ELSE $4::text END "+
   "WHERE id=$1 AND reconcile_lease_token=$2::uuid",[row.id,token,delay,error])
 }
 return {enabled:true,claimed:q.rows.length,checked,failed}
}
export function startWechatRefundReconciliation(pool,env=process.env,deps={}){
 if(!reconcileEnabled(env))return async()=>{}
 let stopped=false,busy=false,work=Promise.resolve()
 // First tick is delayed until the database and merchant configuration are ready.
 const tick=()=>{
  if(stopped||busy)return
  busy=true
  work=runWechatRefundReconciliation(pool,env,deps)
   .catch(e=>{console.error('WeChat refund reconciliation failed',typeof e?.code==='string'?e.code:'unknown')})
   .finally(()=>{busy=false})
 }
 const timer=setInterval(tick,60000)
 timer.unref?.()
 return async()=>{stopped=true;clearInterval(timer);await work}
}
