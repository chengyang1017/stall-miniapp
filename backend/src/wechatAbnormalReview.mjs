// Merchant-only human follow-up audit on provider-verified abnormal live collections.
// Deliberately no provider requests, payment mutations, or refund-complete claims.
import {authenticate,permittedStore} from './auth.mjs'
const path=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/wechat-abnormal-collections\/([0-9]{8,32})\/reviews$/
const key=/^[A-Za-z0-9_-]{20,100}$/
const actions=new Set(['provider_checked','support_contacted','refund_requested','escalated'])
const reply=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))}
const exposed=row=>({id:row.id,action:row.action,note:row.note,actor:row.actor_subject,createdAt:row.created_at,
 manualEvidenceOnly:true,refundVerified:false})
export function reviewInput(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['requestKey','action','note'].includes(k))||
  typeof body.requestKey!=='string'||!key.test(body.requestKey)||
  !actions.has(body.action)||typeof body.note!=='string'||
  !body.note.trim()||body.note!==body.note.trim()||body.note.length>500||
  Buffer.byteLength(body.note,'utf8')>2000)throw Error('invalid_review_request')
 return body
}
async function jsonBody(req){
 let n=0,parts=[]
 for await(const chunk of req){n+=chunk.length;if(n>4096)throw Error('invalid_review_request');parts.push(Buffer.from(chunk))}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw Error('invalid_review_request')}
}
export async function wechatAbnormalReviewRoute(req,res,url,pool,env=process.env){
 const m=path.exec(url.pathname)
 if(!m)return false
 if(url.search||!['GET','POST'].includes(req.method)){reply(res,405,{error:'method_not_allowed'});return true}
 if(env.APP_ENV!=='production'||env.WECHAT_PAY_LIVE_ENABLED!=='true'||env.PAYMENT_DB_ENV==='isolated-test'){
  reply(res,404,{error:'not_found'});return true
 }
 try{
  const actor=await authenticate(pool,req)
  if(!actor){reply(res,401,{error:'login_required'});return true}
  const store=await permittedStore(pool,actor,m[1])
  if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
  const transactionId=m[2]
  const evidence=await pool.query(`SELECT e.id FROM payment_events e
   JOIN orders o ON o.id=e.order_id WHERE e.provider='wechatpay:live'
   AND e.event_type='refund_required' AND e.provider_event_id=$1 AND o.store_id=$2
   AND o.currency='CNY'`,[transactionId,store.id])
  const paymentEventId=evidence.rows[0]?.id
  if(!paymentEventId){reply(res,404,{error:'abnormal_collection_not_found'});return true}
  if(req.method==='GET'){
   const {rows}=await pool.query(`SELECT id,action,note,actor_subject,created_at FROM
    wechat_abnormal_collection_reviews WHERE store_id=$1 AND payment_event_id=$2
    ORDER BY created_at DESC,id DESC LIMIT 101`,[store.id,paymentEventId])
   reply(res,200,{reviews:rows.slice(0,100).map(exposed),hasMore:rows.length>100,manualEvidenceOnly:true})
   return true
  }
  const data=reviewInput(await jsonBody(req))
  const db=await pool.connect()
  try{
   await db.query('BEGIN')
   await db.query("SET LOCAL statement_timeout='5000ms'")
   // Unique scoped request key enforces replay safety even with concurrent requests.
   const inserted=await db.query(`INSERT INTO wechat_abnormal_collection_reviews
    (store_id,payment_event_id,request_key,action,note,actor_subject)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(store_id,request_key) DO NOTHING
    RETURNING id,action,note,actor_subject,created_at,payment_event_id`,
    [store.id,paymentEventId,data.requestKey,data.action,data.note,actor])
   let record=inserted.rows[0],created=!!record
   if(!created){
    const prior=await db.query(`SELECT id,action,note,actor_subject,created_at,payment_event_id
     FROM wechat_abnormal_collection_reviews WHERE store_id=$1 AND request_key=$2`,
     [store.id,data.requestKey])
    record=prior.rows[0]
    if(!record||String(record.payment_event_id)!==String(paymentEventId)||
      record.actor_subject!==actor||record.action!==data.action||record.note!==data.note){
     await db.query('ROLLBACK');reply(res,409,{error:'review_idempotency_conflict'});return true
    }
   }
   await db.query('COMMIT')
   reply(res,created?201:200,{review:exposed(record),created})
   return true
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}finally{db.release()}
 }catch(error){
  const invalid=String(error?.message)==='invalid_review_request'
  reply(res,invalid?400:503,{error:invalid?'invalid_review_request':'review_temporarily_unavailable'})
  return true
 }
}
