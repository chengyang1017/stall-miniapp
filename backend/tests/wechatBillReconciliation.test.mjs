import test from 'node:test'
import assert from 'node:assert/strict'
import {compareStatementRows,validateStatementRows,wechatBillReconciliationRoute} from '../src/wechatBillReconciliation.mjs'
const transactionId='4200001234567890123456789012'
const missingId='4200001234567890123456789013'
const refundId='wr'+'a'.repeat(32)
const payload={transactions:[{id:transactionId,amountCents:1500},{id:missingId,amountCents:800}],
 refunds:[{id:refundId,amountCents:400}]}
const path='https://example.test/v1/merchant/stores/store-1/wechat-bill-reconciliation'
const env={APP_ENV:'production',WECHAT_PAY_LIVE_ENABLED:'true',PAYMENT_DB_ENV:'production'}
const request=(body,authorized=true)=>({method:'POST',
 headers:authorized?{authorization:'Bearer '+'a'.repeat(40)}:{},
 async *[Symbol.asyncIterator](){if(body!==undefined)yield Buffer.from(JSON.stringify(body))}})
const response=()=>({status:null,data:null,writeHead(s){this.status=s},end(v){this.data=JSON.parse(v)}})
test('comparison distinguishes normal payment, missing record and unconfirmed refund',()=>{
 const statement=validateStatementRows(payload)
 const result=compareStatementRows(statement,{payments:[{id:transactionId,amountCents:'1500',type:'payment_succeeded'}],
  refunds:[{id:refundId,amountCents:'400',status:'processing'}]})
 assert.deepEqual(result.transactions.map(x=>x.outcome),['matched_local','missing_local'])
 assert.equal(result.refunds[0].outcome,'refund_not_locally_confirmed')
 assert.equal(result.summary.matchedLocal,1)
 assert.equal(result.summary.reviewRequired,2)
 assert.equal(result.officiallyVerified,false)
 assert.equal(result.moneyMoved,false)
 assert.equal(result.scope,'submitted_rows_only')
})
test('abnormal collections, mismatches and successful refunds are separately classified',()=>{
 const statement=validateStatementRows({transactions:[{id:transactionId,amountCents:200}],
  refunds:[{id:refundId,amountCents:500}]})
 const result=compareStatementRows(statement,{payments:[{id:transactionId,amountCents:'200',type:'refund_required'}],
  refunds:[{id:refundId,amountCents:'500',status:'succeeded'}]})
 assert.equal(result.transactions[0].outcome,'abnormal_collection')
 assert.equal(result.refunds[0].outcome,'matched_local')
 const mismatch=compareStatementRows(statement,{payments:[{id:transactionId,amountCents:'300',type:'payment_succeeded'}],refunds:[]})
 assert.equal(mismatch.transactions[0].outcome,'amount_mismatch')
})
test('reject duplicated IDs, untrusted status fields, malformed amounts and oversized batches',()=>{
 const sample={transactions:[{id:transactionId,amountCents:100}],refunds:[]}
 for(const bad of [
  {...sample,transactions:[sample.transactions[0],sample.transactions[0]]},
  {...sample,transactions:[{...sample.transactions[0],amountCents:1.2}]},
  {...sample,transactions:[{...sample.transactions[0],providerStatus:'SUCCESS'}]},
  {...sample,refunds:[{id:refundId,amountCents:0}]},
  {transactions:Array.from({length:201},(_,i)=>({id:String(i).padStart(20,'0'),amountCents:100})),refunds:[]},
  {transactions:[],refunds:[]}
 ])assert.throws(()=>validateStatementRows(bad),/invalid_statement/)
})
test('disabled comparison never touches database',async()=>{
 const p={query(){throw Error('unexpected DB')},connect(){throw Error('unexpected DB')}}
 const r=response()
 await wechatBillReconciliationRoute(request(payload),r,new URL(path),p,{...env,WECHAT_PAY_LIVE_ENABLED:'false'})
 assert.equal(r.status,404)
})
test('anonymous comparison never touches payment events',async()=>{
 const queries=[],p={query:async(sql)=>{queries.push(sql);return {rows:[]}},connect(){throw Error('unexpected DB')}}
 const r=response()
 await wechatBillReconciliationRoute(request(payload,false),r,new URL(path),p,env)
 assert.equal(r.status,401)
 assert.equal(queries.length,0)
})
test('authorized comparison is store scoped and executes only read-only transaction',async()=>{
 const queries=[],storeId='99999999-9999-4999-8999-999999999999'
 const db={query:async(sql,params)=>{
  queries.push({sql,params})
  if(sql.startsWith('BEGIN')||sql.startsWith('SET LOCAL')||sql==='COMMIT')return {rows:[]}
  if(sql.includes('FROM payment_events e'))return {rows:[{id:transactionId,amountCents:'1500',type:'payment_succeeded'}]}
  if(sql.includes('FROM wechat_live_refunds r'))return {rows:[{id:refundId,amountCents:'400',status:'succeeded'}]}
  throw Error('unexpected query')
 },release(){}}
 const pool={query:async(sql)=>{
  if(sql.includes('FROM auth_sessions'))return {rows:[{external_subject:'merchant-1'}]}
  if(sql.includes('FROM merchant_members'))return {rows:[{id:storeId,slug:'store-1',role:'owner'}]}
  throw Error('unexpected auth')
 },connect:async()=>db}
 const r=response()
 await wechatBillReconciliationRoute(request(payload),r,new URL(path),pool,env)
 assert.equal(r.status,200)
 assert.equal(r.data.summary.rowsCompared,3)
 assert.equal(r.data.summary.matchedLocal,2)
 assert.equal(r.data.transactions[1].outcome,'missing_local')
 assert.equal(r.data.officiallyVerified,false)
 assert.equal(queries[0].sql,'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
 assert.equal(queries.filter(q=>q.sql.includes('store_id=$1')).length,2)
 assert.deepEqual(queries.find(q=>q.sql.includes('FROM payment_events e')).params[0],storeId)
 assert.equal(queries.some(q=>/INSERT|UPDATE|DELETE/i.test(q.sql)),false)
 assert.equal(queries.at(-1).sql,'COMMIT')
})
