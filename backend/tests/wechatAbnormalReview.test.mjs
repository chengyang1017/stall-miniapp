import test from 'node:test'
import assert from 'node:assert/strict'
import {wechatAbnormalReviewRoute,reviewInput} from '../src/wechatAbnormalReview.mjs'

const env={APP_ENV:'production',PAYMENT_DB_ENV:'production',WECHAT_PAY_LIVE_ENABLED:'true'}
const path='https://example.test/v1/merchant/stores/store-1/wechat-abnormal-collections/4200001234567890123456789012/reviews'
const store='99999999-9999-4999-8999-999999999999'
const event='88888888-8888-4888-8888-888888888888'
const requestKey='example-idempotency-key-1234567'
const payload={requestKey,action:'provider_checked',note:'已核对商户平台交易明细，等待进一步处理'}
const req=(method,body,authorized=true)=>({
 method,headers:authorized?{authorization:'Bearer '+'a'.repeat(40)}:{},
 async *[Symbol.asyncIterator](){if(body!==undefined)yield Buffer.from(JSON.stringify(body))}
})
const res=()=>({status:null,body:null,writeHead(code){this.status=code},end(v){this.body=JSON.parse(v)}})
function poolFactory(role='owner',evidence=true){
 const queries=[],records=new Map()
 const client={query:async(sql,args=[])=>{
  queries.push({sql,args})
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL'))return {rows:[]}
  if(sql.includes('INSERT INTO wechat_abnormal_collection_reviews')){
   const row=records.get(args[2])
   if(row)return {rows:[]}
   const created={id:'77777777-7777-4777-8777-777777777777',payment_event_id:args[1],
    action:args[3],note:args[4],actor_subject:args[5],created_at:new Date('2026-11-08T00:00:00Z')}
   records.set(args[2],created);return {rows:[created]}
  }
  if(sql.includes('FROM wechat_abnormal_collection_reviews WHERE store_id=$1 AND request_key=$2'))
   return {rows:records.has(args[1])?[records.get(args[1])]:[]}
  throw Error('unexpected transaction SQL')
 },release(){}}
 return {queries,records,pool:{
  query:async(sql,args=[])=>{
   queries.push({sql,args})
   if(sql.includes('FROM auth_sessions'))return {rows:[{external_subject:'owner-subject'}]}
   if(sql.includes('FROM merchant_members'))return {rows:[role?{id:store,role,slug:'store-1'}:undefined].filter(Boolean)}
   if(sql.includes('FROM payment_events e'))return {rows:evidence?[{id:event}]:[]}
   if(sql.includes('FROM wechat_abnormal_collection_reviews'))return {rows:[...records.values()]}
   throw Error('unexpected pool SQL')
  },connect:async()=>client
 }}
}
test('disabled review route never reads or writes any database',async()=>{
 const p={query(){throw Error('database access')},connect(){throw Error('database access')}}
 const result=res()
 assert.equal(await wechatAbnormalReviewRoute(req('POST',payload),result,new URL(path),p,
  {...env,WECHAT_PAY_LIVE_ENABLED:'false'}),true)
 assert.equal(result.status,404)
})
test('anonymous and insufficient-privilege users cannot review collections',async()=>{
 const a=poolFactory()
 const anon=res()
 await wechatAbnormalReviewRoute(req('GET',undefined,false),anon,new URL(path),a.pool,env)
 assert.equal(anon.status,401)
 assert.equal(a.queries.some(q=>q.sql.includes('payment_events')),false)
 const b=poolFactory('staff')
 const forbidden=res()
 await wechatAbnormalReviewRoute(req('POST',payload),forbidden,new URL(path),b.pool,env)
 assert.equal(forbidden.status,403)
 assert.equal(b.queries.some(q=>q.sql.includes('payment_events')),false)
})
test('cannot create a review for unverified, non-store abnormal collection',async()=>{
 const p=poolFactory('owner',false),result=res()
 await wechatAbnormalReviewRoute(req('POST',payload),result,new URL(path),p.pool,env)
 assert.equal(result.status,404)
 assert.equal(p.queries.some(q=>q.sql.includes('INSERT INTO')),false)
})
test('append-only review is idempotent and conflicting replay cannot mutate payment',async()=>{
 const p=poolFactory()
 const first=res(),second=res(),conflict=res()
 await wechatAbnormalReviewRoute(req('POST',payload),first,new URL(path),p.pool,env)
 assert.equal(first.status,201)
 assert.equal(first.body.review.action,'provider_checked')
 assert.equal(first.body.review.refundVerified,false)
 await wechatAbnormalReviewRoute(req('POST',payload),second,new URL(path),p.pool,env)
 assert.equal(second.status,200)
 assert.equal(second.body.created,false)
 await wechatAbnormalReviewRoute(req('POST',{...payload,action:'refund_requested'}),conflict,new URL(path),p.pool,env)
 assert.equal(conflict.status,409)
 assert.equal(conflict.body.error,'review_idempotency_conflict')
 assert.equal(p.records.size,1)
 assert.equal(p.queries.some(q=>/UPDATE orders|UPDATE payment_events|DELETE FROM payment_events/i.test(q.sql)),false)
 assert.ok(p.queries.some(q=>q.sql==='ROLLBACK'))
})
test('review list is scoped, bounded and cannot claim refund completion',async()=>{
 const p=poolFactory(),result=res()
 await wechatAbnormalReviewRoute(req('POST',payload),res(),new URL(path),p.pool,env)
 await wechatAbnormalReviewRoute(req('GET'),result,new URL(path),p.pool,env)
 assert.equal(result.status,200)
 assert.equal(result.body.reviews.length,1)
 assert.equal(result.body.reviews[0].manualEvidenceOnly,true)
 assert.equal(result.body.reviews[0].refundVerified,false)
 assert.ok(p.queries.some(q=>q.sql.includes('ORDER BY created_at DESC,id DESC LIMIT 101')))
})
test('strict validation blocks refunds marked as settled and excessive notes',()=>{
 assert.throws(()=>reviewInput({...payload,action:'refund_completed'}),/invalid_review_request/)
 assert.throws(()=>reviewInput({...payload,note:'a'.repeat(501)}),/invalid_review_request/)
 assert.throws(()=>reviewInput({...payload,extra:'anything'}),/invalid_review_request/)
 assert.throws(()=>reviewInput({...payload,requestKey:'short'}),/invalid_review_request/)
})
