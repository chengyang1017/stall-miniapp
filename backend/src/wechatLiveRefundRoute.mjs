// Production WeChat Pay V3 refund ledger for one direct merchant and one store.
// No payout or refund is enabled unless production payment AND refund gates are set.
import {randomUUID} from 'node:crypto'
import {authenticate,permittedStore} from './auth.mjs'
import {wechatPayLiveConfig,wechatPayV3,tradeNo,decodeWechatNotification} from './wechatPayV3.mjs'

const orderPath=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/orders\/([0-9a-fA-F-]{36})\/wechat-refunds(?:\/([0-9a-fA-F-]{36}))?$/
const notificationPath='/v1/payments/wechat-pay/refund-notify'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const requestKey=/^[A-Za-z0-9_-]{20,100}$/
const fail=code=>Object.assign(Error(code),{code})
const reply=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))}
export const refundNeedsReview=status=>['unknown','review','abnormal'].includes(status)
const exposed=row=>({id:row.id,orderId:row.order_id,amountCents:Number(row.amount_cents),
 status:row.status,outRefundNo:row.out_refund_no,createdAt:row.created_at,
 updatedAt:row.updated_at,reviewRequired:refundNeedsReview(row.status)})
async function readBody(req){
 let parts=[],size=0
 for await (const p of req){size+=p.length;if(size>65536)throw fail('too_large');parts.push(Buffer.from(p))}
 return Buffer.concat(parts).toString('utf8')
}
async function tx(pool,callback){
 const db=await pool.connect()
 try{
  await db.query('BEGIN')
  await db.query("SET LOCAL statement_timeout='5000ms'")
  const result=await callback(db)
  await db.query('COMMIT')
  return result
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
}
function providerState(data,refund,config){
 if(!data||typeof data!=='object'||Array.isArray(data)||data.out_trade_no!==tradeNo(refund.order_id)||
  data.out_refund_no!==refund.out_refund_no||
  data.mchid&&data.mchid!==config.mchid||
  typeof data.refund_id!=='string'||!/^[0-9]{10,32}$/.test(data.refund_id)||
  refund.provider_refund_id&&data.refund_id!==refund.provider_refund_id||
  data.transaction_id!==refund.transaction_id||
  data.amount?.total!==Number(refund.original_total_cents)||
  data.amount?.refund!==Number(refund.amount_cents)||
  (data.amount?.currency!==undefined&&data.amount.currency!==refund.currency))
   throw fail('wechatpay_refund_mismatch')
 const code=data.refund_status||data.status
 if(!['SUCCESS','PROCESSING','ABNORMAL','CLOSED'].includes(code))throw fail('wechatpay_unknown_refund_status')
 return {state:{SUCCESS:'succeeded',PROCESSING:'processing',ABNORMAL:'abnormal',CLOSED:'closed'}[code],
  providerStatus:code,providerId:data.refund_id}
}
async function lockedRefund(db,refundId,storeId){
 const {rows}=await db.query(
  "SELECT r.*,o.total_cents,o.payment_status,o.payment_source,o.currency,"+
  "(SELECT provider_event_id FROM payment_events e WHERE e.order_id=o.id AND "+
  "e.provider='wechatpay:live' AND e.event_type='payment_succeeded' AND e.amount_cents=o.total_cents "+
  "LIMIT 1) AS transaction_id "+
  "FROM wechat_live_refunds r JOIN orders o ON o.id=r.order_id "+
  "WHERE r.id=$1 AND r.store_id=$2 FOR UPDATE OF r,o",[refundId,storeId])
 return rows[0]||null
}
export async function applyVerifiedRefund(pool,{refundId,storeId,observation,config,eventId=null,eventType=null}){
 return tx(pool,async db=>{
  const refund=await lockedRefund(db,refundId,storeId)
  if(!refund)throw fail('wechatpay_refund_not_found')
  if(refund.payment_source!=='wechatpay:live'||!refund.transaction_id||refund.currency!=='CNY')throw fail('wechatpay_refund_untrusted_order')
  const {state,providerId,providerStatus}=providerState(observation,refund,config)
  if(eventId){
   if(typeof eventId!=='string'||eventId.length>128||!['REFUND.SUCCESS','REFUND.CLOSED','REFUND.ABNORMAL'].includes(eventType)||
    eventType.split('.')[1]!==providerStatus)throw fail('wechatpay_refund_event_mismatch')
   const prior=await db.query('SELECT refund_id,event_type,observed_status FROM wechat_live_refund_events WHERE provider_event_id=$1',[eventId])
   if(prior.rows.length){
    if(prior.rows[0].refund_id!==refund.id||prior.rows[0].event_type!==eventType||
      prior.rows[0].observed_status!==providerStatus)throw fail('wechatpay_event_reused')
    return exposed(refund)
   }
   await db.query('INSERT INTO wechat_live_refund_events(provider_event_id,refund_id,event_type,observed_status) VALUES($1,$2,$3,$4)',
    [eventId,refund.id,eventType,providerStatus])
  }
  let next=state,error=null
  if(refund.status==='succeeded'){
   next='succeeded'
   if(state!=='succeeded')error='terminal_state_conflict_manual_review'
  }else if(refund.status==='closed'&&state!=='closed'){
   // Preserve a newly verified SUCCESS fact, but flag contradictory final states.
   next=state==='succeeded'?'succeeded':'review'
   error='terminal_state_conflict_manual_review'
  }else if(refund.status==='review'){next='review';error='manual_review_required'}
  if(refund.status==='abnormal'&&state==='processing'){next='abnormal'}
  await db.query("UPDATE wechat_live_refunds SET status=$2,provider_refund_id=COALESCE(provider_refund_id,$3),"+
   "provider_status=$4,last_error=$5,updated_at=clock_timestamp() WHERE id=$1",
   [refund.id,next,providerId,providerStatus,error])
  // Refunds never change the delivery state or restock goods.
  if(next==='succeeded'){
   const result=await db.query("SELECT COALESCE(SUM(amount_cents),0)::text AS total "+
    "FROM wechat_live_refunds WHERE order_id=$1 AND status='succeeded'",[refund.order_id])
   const refunded=Number(result.rows[0].total),total=Number(refund.original_total_cents)
   if(!Number.isSafeInteger(refunded)||refunded>total)throw fail('wechatpay_refund_total_mismatch')
   await db.query("UPDATE orders SET payment_status=$2,updated_at=clock_timestamp() "+
    "WHERE id=$1 AND payment_source='wechatpay:live' AND payment_status IN ('paid','partially_refunded','refunded')",
    [refund.order_id,refunded===total?'refunded':'partially_refunded'])
  }
  return {...exposed(refund),status:next,reviewRequired:refundNeedsReview(next)}
 })
}
async function reserveRefund(pool,store,orderId,subject,data){
 if(!data||typeof data!=='object'||Array.isArray(data)||
  Object.keys(data).some(k=>!['requestKey','amountCents','reason'].includes(k))||
  typeof data.requestKey!=='string'||!requestKey.test(data.requestKey)||
  !Number.isSafeInteger(data.amountCents)||data.amountCents<=0||
  typeof data.reason!=='string'||!data.reason.trim()||
  Buffer.byteLength(data.reason)>80)throw fail('invalid_refund_request')
 return tx(pool,async db=>{
  const {rows:[order]}=await db.query(
   "SELECT id,total_cents,payment_status,payment_source,currency FROM orders WHERE id=$1 AND store_id=$2 FOR UPDATE",
   [orderId,store.id])
  if(!order)throw fail('wechatpay_refund_not_found')
  const existing=await db.query('SELECT * FROM wechat_live_refunds WHERE store_id=$1 AND request_key=$2',
   [store.id,data.requestKey])
  if(existing.rows.length){
   const row=existing.rows[0]
   if(row.order_id!==orderId||Number(row.amount_cents)!==data.amountCents||row.reason!==data.reason.trim())
    throw fail('refund_idempotency_conflict')
   return {refund:row,created:false}
  }
  if(order.currency!=='CNY'||order.payment_source!=='wechatpay:live'||
   !['paid','partially_refunded'].includes(order.payment_status))throw fail('refund_order_not_paid')
  const payment=await db.query("SELECT provider_event_id FROM payment_events WHERE order_id=$1 AND provider='wechatpay:live' "+
   "AND event_type='payment_succeeded' AND amount_cents=$2",[orderId,order.total_cents])
  if(payment.rows.length!==1)throw fail('refund_payment_not_verified')
  const duplicate=await db.query("SELECT 1 FROM payment_events WHERE order_id=$1 AND provider='wechatpay:live' AND event_type='refund_required' LIMIT 1",[orderId])
  if(duplicate.rows.length)throw fail('refund_requires_manual_review')
  const records=await db.query("SELECT COUNT(*)::int AS count,COALESCE(SUM(amount_cents) FILTER (WHERE status<>'closed'),0)::text AS reserved,"+
   "COUNT(*) FILTER(WHERE status IN ('pending','submitting','unknown','processing','abnormal','review'))::int AS unresolved,"+
   "MAX(created_at) AS latest FROM wechat_live_refunds WHERE order_id=$1",[orderId])
  const current=records.rows[0]
  if(current.count>=50||current.unresolved>0||Number(current.reserved)+data.amountCents>Number(order.total_cents)||
   current.latest&&Date.now()-new Date(current.latest).getTime()<60000)throw fail('refund_not_available')
  const id=randomUUID(),outRefundNo='wr'+id.replace(/-/g,'')
  const {rows:[refund]}=await db.query(
   "INSERT INTO wechat_live_refunds(id,store_id,order_id,request_key,out_refund_no,amount_cents,original_total_cents,reason,requested_by) "+
   "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
   [id,store.id,orderId,data.requestKey,outRefundNo,data.amountCents,order.total_cents,data.reason.trim(),subject])
  return {refund,created:true}
 })
}
async function claimSubmission(pool,id,storeId){
 return tx(pool,async db=>{
  const {rows:[refund]}=await db.query("UPDATE wechat_live_refunds SET status='submitting',claimed_at=clock_timestamp(),"+
   "updated_at=clock_timestamp() WHERE id=$1 AND store_id=$2 AND status='pending' RETURNING *",[id,storeId])
  return refund||null
 })
}
async function markSubmission(pool,id,state,error=null){
 return tx(pool,async db=>{
  await db.query("UPDATE wechat_live_refunds SET status=$2,last_error=$3,updated_at=clock_timestamp() "+
   "WHERE id=$1 AND status='submitting'",[id,state,error])
 })
}
async function findRefund(pool,id,storeId){
 const {rows:[refund]}=await pool.query(
  "SELECT r.*, (SELECT e.provider_event_id FROM payment_events e WHERE e.order_id=r.order_id "+
  "AND e.provider='wechatpay:live' AND e.event_type='payment_succeeded' LIMIT 1) AS transaction_id "+
  "FROM wechat_live_refunds r WHERE r.id=$1 AND r.store_id=$2",[id,storeId])
 return refund||null
}
export async function wechatLiveRefundRoute(req,res,url,pool,env=process.env,deps={}){
 const match=orderPath.exec(url.pathname),notify=url.pathname===notificationPath
 if(!match&&!notify)return false
 const methodOk=notify?req.method==='POST':match[3]?req.method==='GET':['GET','POST'].includes(req.method)
 if(!methodOk||url.search){reply(res,405,{error:'method_not_allowed'});return true}
 let cfg
 try{cfg=wechatPayLiveConfig(env)}catch{reply(res,503,{error:'wechatpay_configuration_incomplete'});return true}
 if(!cfg||!cfg.refundsEnabled){reply(res,404,{error:'not_found'});return true}
 const pay=deps.pay||wechatPayV3(cfg)
 try{
  if(notify){
   const raw=await readBody(req),event=decodeWechatNotification(raw,req.headers,cfg)
   if(!['REFUND.SUCCESS','REFUND.CLOSED','REFUND.ABNORMAL'].includes(event.eventType))throw fail('invalid_refund_event')
   const refundNo=event.transaction?.out_refund_no
   if(typeof refundNo!=='string'||!/^wr[a-f0-9]{32}$/.test(refundNo))throw fail('invalid_refund_event')
   const {rows:[refund]}=await pool.query("SELECT r.id,r.store_id FROM wechat_live_refunds r "+
    "JOIN stores s ON s.id=r.store_id WHERE r.out_refund_no=$1 AND s.slug=$2",[refundNo,cfg.storeSlug])
   if(!refund)throw fail('wechatpay_refund_not_found')
   await applyVerifiedRefund(pool,{refundId:refund.id,storeId:refund.store_id,
    observation:event.transaction,config:cfg,eventId:event.eventId,eventType:event.eventType})
   reply(res,200,{code:'SUCCESS',message:'成功'});return true
  }
  if(match[1]!==cfg.storeSlug||!uuid.test(match[2])||match[3]&&!uuid.test(match[3])){
   reply(res,404,{error:'not_found'});return true
  }
  const subject=await authenticate(pool,req)
  if(!subject){reply(res,401,{error:'login_required'});return true}
  const store=await permittedStore(pool,subject,match[1])
  if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
  const orderId=match[2].toLowerCase()
  if(req.method==='GET'&&!match[3]){
   const {rows}=await pool.query("SELECT r.* FROM wechat_live_refunds r WHERE r.store_id=$1 AND r.order_id=$2 "+
    "ORDER BY created_at DESC LIMIT 50",[store.id,orderId])
   reply(res,200,{refunds:rows.map(exposed)});return true
  }
  if(match[3]){
   const refund=await findRefund(pool,match[3].toLowerCase(),store.id)
   if(!refund||refund.order_id!==orderId){reply(res,404,{error:'refund_not_found'});return true}
   if(['pending','submitting'].includes(refund.status)){reply(res,200,exposed(refund));return true}
   const observed=await pay.queryRefund(refund.out_refund_no)
   const current=await applyVerifiedRefund(pool,{refundId:refund.id,storeId:store.id,observation:observed,config:cfg})
   reply(res,200,current);return true
  }
  let body
  try{body=JSON.parse(await readBody(req))}catch{throw fail('invalid_refund_request')}
  const {refund,created}=await reserveRefund(pool,store,orderId,subject,body)
  if(!created){reply(res,200,exposed(refund));return true}
  const claimed=await claimSubmission(pool,refund.id,store.id)
  if(!claimed){reply(res,202,exposed(refund));return true}
  try{
   const observed=await pay.refund({outTradeNo:tradeNo(orderId),outRefundNo:claimed.out_refund_no,
    refundCents:Number(claimed.amount_cents),totalCents:Number(claimed.original_total_cents),reason:claimed.reason})
   // Even a 200 provider response is only acceptance; query or notification confirms success.
   if(observed?.out_refund_no!==claimed.out_refund_no||observed?.out_trade_no!==tradeNo(orderId)||
    observed.amount?.refund!==Number(claimed.amount_cents)||observed.amount?.total!==Number(claimed.original_total_cents))
    throw fail('wechatpay_refund_mismatch')
   await markSubmission(pool,claimed.id,'processing')
   reply(res,202,{...exposed(claimed),status:'processing'});return true
  }catch(_){
   // The remote outcome may be unknown; NEVER issue a different refund number.
   await markSubmission(pool,claimed.id,'unknown','refund_submit_or_response_unknown')
   reply(res,202,{...exposed(claimed),status:'unknown',reviewRequired:true});return true
  }
 }catch(e){
  const code=String(e.code||e.message||'')
  const invalid=['invalid_refund_request','too_large','invalid_refund_event','wechatpay_invalid_signature','wechatpay_invalid_notification'].includes(code)
  const conflict=['refund_idempotency_conflict','refund_not_available','refund_order_not_paid','refund_payment_not_verified','refund_requires_manual_review'].includes(code)
  reply(res,invalid?400:conflict?409:503,{error:invalid?'invalid_request':conflict?code:'refund_temporarily_unavailable'})
  return true
 }
}
