// Read-only comparison of explicitly supplied, normalized WeChat merchant statement rows.
// No provider downloads or money movement. User-supplied rows are never trusted as
// authenticated proof of settlement/refund, even when their amounts match.
import {authenticate,permittedStore} from './auth.mjs'
const route=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/wechat-bill-reconciliation$/
const txId=/^[0-9]{10,32}$/
const refundId=/^wr[a-f0-9]{32}$/
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))}
const validMoney=value=>Number.isSafeInteger(value)&&value>0&&value<=100000000000
export function validateStatementRows(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
  Object.keys(input).some(k=>!['transactions','refunds'].includes(k)))throw Error('invalid_statement')
 const {transactions,refunds}=input
 if(!Array.isArray(transactions)||!Array.isArray(refunds)||
  transactions.length+refunds.length<1||transactions.length+refunds.length>200)throw Error('invalid_statement')
 const seen=new Set()
 for(const [items,kind] of [[transactions,'transaction'],[refunds,'refund']]){
  for(const row of items){
   if(!row||typeof row!=='object'||Array.isArray(row)||
    Object.keys(row).some(k=>!['id','amountCents'].includes(k))||
    typeof row.id!=='string'||!(kind==='transaction'?txId:refundId).test(row.id)||
    !validMoney(row.amountCents)||seen.has(kind+':'+row.id))throw Error('invalid_statement')
   seen.add(kind+':'+row.id)
  }
 }
 return {transactions,refunds}
}
function readBody(req){
 return (async()=>{
  let length=0,chunks=[]
  for await(const part of req){length+=part.length;if(length>65536)throw Error('invalid_statement');chunks.push(Buffer.from(part))}
  try{return validateStatementRows(JSON.parse(Buffer.concat(chunks).toString('utf8')))}
  catch{throw Error('invalid_statement')}
 })()
}
export function compareStatementRows(statement,local){
 const payments=new Map(local.payments.map(r=>[r.id,r]))
 const refunds=new Map(local.refunds.map(r=>[r.id,r]))
 const transactions=statement.transactions.map(row=>{
  const found=payments.get(row.id)
  const localAmount=found?Number(found.amountCents):null
  const outcome=!found?'missing_local':!Number.isSafeInteger(localAmount)||localAmount!==row.amountCents?'amount_mismatch':
   found.type==='refund_required'?'abnormal_collection':'matched_local'
  return {id:row.id,statementAmountCents:row.amountCents,localAmountCents:localAmount,
   localEventType:found?.type||null,outcome}
 })
 const refundRows=statement.refunds.map(row=>{
  const found=refunds.get(row.id),localAmount=found?Number(found.amountCents):null
  const outcome=!found?'missing_local':!Number.isSafeInteger(localAmount)||localAmount!==row.amountCents?'amount_mismatch':
   found.status!=='succeeded'?'refund_not_locally_confirmed':'matched_local'
  return {id:row.id,statementAmountCents:row.amountCents,localAmountCents:localAmount,
   localRefundStatus:found?.status||null,outcome}
 })
 const all=[...transactions,...refundRows]
 return {transactions,refunds:refundRows,summary:{
  rowsCompared:all.length,matchedLocal:all.filter(r=>r.outcome==='matched_local').length,
  reviewRequired:all.filter(r=>r.outcome!=='matched_local').length
 },source:'merchant_supplied_normalized_rows',officiallyVerified:false,
  scope:'submitted_rows_only',moneyMoved:false,
  warning:'人工提供的账单明细与本地记录比对，不证明账单来源、退款已到账或官方结算金额；仍须核对微信商户平台原始账单。'}
}
export async function wechatBillReconciliationRoute(req,res,url,pool,env=process.env){
 const match=route.exec(url.pathname)
 if(!match)return false
 if(req.method!=='POST'||url.search){send(res,405,{error:'method_not_allowed'});return true}
 if(env.APP_ENV!=='production'||env.WECHAT_PAY_LIVE_ENABLED!=='true'||env.PAYMENT_DB_ENV==='isolated-test'){
  send(res,404,{error:'not_found'});return true
 }
 try{
  const actor=await authenticate(pool,req)
  if(!actor){send(res,401,{error:'login_required'});return true}
  const store=await permittedStore(pool,actor,match[1])
  if(!store||!['owner','manager'].includes(store.role)){send(res,403,{error:'forbidden'});return true}
  const statement=await readBody(req)
  const db=await pool.connect()
  let open=false
  try{
   await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true
   await db.query("SET LOCAL statement_timeout='5000ms'")
   const txIds=statement.transactions.map(r=>r.id),refundIds=statement.refunds.map(r=>r.id)
   const payments=txIds.length?(await db.query(`SELECT e.provider_event_id AS id,
    e.amount_cents::text AS "amountCents",e.event_type AS type
    FROM payment_events e JOIN orders o ON o.id=e.order_id
    WHERE o.store_id=$1 AND o.currency='CNY' AND e.provider='wechatpay:live'
    AND e.event_type IN ('payment_succeeded','refund_required')
    AND e.provider_event_id=ANY($2::text[])`,[store.id,txIds])).rows:[]
   const refunds=refundIds.length?(await db.query(`SELECT r.out_refund_no AS id,
    r.amount_cents::text AS "amountCents",r.status FROM wechat_live_refunds r
    JOIN orders o ON o.id=r.order_id WHERE r.store_id=$1 AND o.store_id=$1
    AND o.currency='CNY' AND r.out_refund_no=ANY($2::text[])`,[store.id,refundIds])).rows:[]
   await db.query('COMMIT');open=false
   send(res,200,compareStatementRows(statement,{payments,refunds}))
  }finally{if(open)await db.query('ROLLBACK').catch(()=>{});db.release()}
 }catch(error){
  const invalid=error?.message==='invalid_statement'
  send(res,invalid?400:503,{error:invalid?'invalid_statement':'reconciliation_temporarily_unavailable'})
 }
 return true
}
