import test from 'node:test'
import assert from 'node:assert/strict'
import {buildLiveReceipt,wechatLiveReceiptRoute} from '../src/wechatLiveReceipt.mjs'
import {readAbnormalWechatCollections,abnormalCollectionsCsv,billingRoute} from '../src/billing.mjs'
import {nextDelaySeconds,reconcileEnabled,runWechatRefundReconciliation} from '../src/wechatLiveRefundReconcile.mjs'
const uuid='12345678-1234-4234-8234-123456789abc'
const order={id:uuid,store_id:'99999999-9999-4999-8999-999999999999',store_name:'商家小店',
 customer_subject:'wx:wxaaaaaaaaaaaaaaaa:customer',payment_source:'wechatpay:live',
 payment_status:'paid',currency:'CNY',subtotal_cents:1200,delivery_fee_cents:300,total_cents:1500,
 created_at:new Date('2026-11-08T02:00:00Z'),paid_at:new Date('2026-11-08T02:02:00Z')}
const items=[{product_name:'咖啡',quantity:2,unit_price_cents:600,line_total_cents:1200}]
const events=[{provider:'wechatpay:live',event_type:'payment_succeeded',provider_event_id:'4200001234567890123456789012',amount_cents:'1500'}]
test('receipt is derived only from server-verified payment, with stable SHA256 and no PII',()=>{
 const a=buildLiveReceipt({order,items,events,refunds:[]})
 const b=buildLiveReceipt({order,items,events,refunds:[]})
 assert.equal(a.sha256,b.sha256)
 assert.match(a.sha256,/^[a-f0-9]{64}$/)
 assert.equal(a.receipt.totalCents,1500)
 assert.equal(a.receipt.lines[0].lineCents,1200)
 assert.equal(a.receipt.invoice,false)
 assert.equal(a.receipt.netCents,1500)
 assert.equal(a.receipt.refundPendingCents,0)
 assert.equal(JSON.stringify(a).includes('customer'),false)
})
test('refunded receipt uses only verified succeeded refund and preserves original sum',()=>{
 const r=buildLiveReceipt({order:{...order,payment_status:'partially_refunded'},items,events,
  refunds:[{status:'succeeded',amount_cents:400},{status:'processing',amount_cents:500}]})
 assert.equal(r.receipt.refundedCents,400)
 assert.equal(r.receipt.refundPendingCents,500)
 assert.equal(r.receipt.netCents,1100)
 const full=buildLiveReceipt({order:{...order,payment_status:'refunded'},items,events,
  refunds:[{status:'succeeded',amount_cents:1500}]})
 assert.equal(full.receipt.netCents,0)
})
test('receipt refuses forged payment, missing event, wrong totals or inconsistent refund status',()=>{
 const make=(o={},i=items,e=events,r=[])=>buildLiveReceipt({order:{...order,...o},items:i,events:e,refunds:r})
 assert.throws(()=>make({payment_source:'staging_simulated'}),/live_receipt_unverified/)
 assert.throws(()=>make({payment_status:'unpaid'}),/live_receipt_unverified/)
 assert.throws(()=>make({},items,[]),/live_receipt_unverified/)
 assert.throws(()=>make({},items,[{...events[0],provider:'stripe:sandbox'}]),/live_receipt_unverified/)
 assert.throws(()=>make({total_cents:1800}),/live_receipt_unverified/)
 assert.throws(()=>make({},[{...items[0],line_total_cents:1300}]),/live_receipt_unverified/)
 assert.throws(()=>make({},items,events,[{status:'succeeded',amount_cents:500}]),/live_receipt_unverified/)
 assert.throws(()=>make({},items,events,[{status:'processing',amount_cents:1600}]),/live_receipt_unverified/)
})
test('receipts are absent when production WeChatPay is disabled (no DB reads)',async()=>{
 const res={status:null,writeHead(n){this.status=n},end(){}},pool={
  connect(){throw Error('unreachable')},query(){throw Error('unreachable')}}
 const handled=await wechatLiveReceiptRoute({method:'GET',headers:{}},res,
  new URL('https://example.com/v1/stores/store-1/orders/'+uuid+'/wechat-receipt'),pool,
  {WECHAT_PAY_LIVE_ENABLED:'false'})
 assert.equal(handled,true)
 assert.equal(res.status,404)
})
test('refund worker never runs in isolated or non-live environments',async()=>{
 const env={APP_ENV:'production',WECHAT_PAY_LIVE_ENABLED:'true',
  WECHAT_PAY_LIVE_REFUNDS_ENABLED:'true',WECHAT_PAY_REFUND_RECONCILE_ENABLED:'true'}
 assert.equal(reconcileEnabled({...env,APP_ENV:'sandbox'}),false)
 assert.equal(reconcileEnabled({...env,PAYMENT_DB_ENV:'isolated-test'}),false)
 assert.equal(reconcileEnabled({...env,WECHAT_PAY_REFUND_RECONCILE_ENABLED:'false'}),false)
 const pool={query(){throw Error('database must not be touched')}}
 const result=await runWechatRefundReconciliation(pool,{...env,WECHAT_PAY_LIVE_REFUNDS_ENABLED:'false'})
 assert.equal(result.enabled,false)
})
test('status reconciliation uses backoff and never retries refund POST',async()=>{
 const {generateKeyPairSync}=await import('node:crypto')
 const key=generateKeyPairSync('rsa',{modulusLength:2048})
 const env={APP_ENV:'production',WECHAT_PAY_LIVE_ENABLED:'true',
  WECHAT_PAY_LIVE_REFUNDS_ENABLED:'true',WECHAT_PAY_REFUND_RECONCILE_ENABLED:'true',
  WX_APPID:'wx'+'a'.repeat(16),WECHAT_PAY_MCH_ID:'1900001234',WECHAT_PAY_STORE_SLUG:'store-1',
  WECHAT_PAY_MERCHANT_SERIAL:'A'.repeat(40),
  WECHAT_PAY_MERCHANT_PRIVATE_KEY:key.privateKey.export({type:'pkcs8',format:'pem'}).toString(),
  WECHAT_PAY_PLATFORM_SERIAL:'PUB_KEY_ID_1234567890',
  WECHAT_PAY_PLATFORM_PUBLIC_KEY:key.publicKey.export({type:'spki',format:'pem'}).toString(),
  WECHAT_PAY_API_V3_KEY:'x'.repeat(32),
  WECHAT_PAY_NOTIFY_URL:'https://api.example.com/v1/payments/wechat-pay/notify',
  WECHAT_PAY_REFUND_NOTIFY_URL:'https://api.example.com/v1/payments/wechat-pay/refund-notify'}
 const queries=[],id='44444444-4444-4444-8444-444444444444',storeId='99999999-9999-4999-8999-999999999999'
 const pool={query:async(sql,params)=>{
  queries.push({sql,params})
  if(sql.includes('WITH eligible'))return {rows:[{id,store_id:storeId,out_refund_no:'wr'+id.replace(/-/g,''),status:'unknown',reconcile_attempts:2}]}
  if(sql.includes('reconcile_lease_token=NULL'))return {rowCount:1,rows:[]}
  throw Error('unexpected DB SQL')
 }}
 let readCount=0
 const result=await runWechatRefundReconciliation(pool,env,{pay:{
  queryRefund:async()=>{readCount++;throw Error('wechatpay_network_unknown')},
  refund:()=>{throw Error('MUST NOT POST refund')}
 }})
 assert.deepEqual({claimed:result.claimed,checked:result.checked,failed:result.failed},{claimed:1,checked:0,failed:1})
 assert.equal(readCount,1)
 assert.equal(queries.length,2)
 assert.equal(queries[1].params[2],300)
 assert.equal(nextDelaySeconds(0,'processing'),60)
 assert.equal(nextDelaySeconds(9,'unknown'),21600)
 assert.equal(nextDelaySeconds(4,'abnormal'),21600)
 assert.equal(nextDelaySeconds(5,'succeeded'),0)
})

test('read-only abnormal collection ledger caps rows and preserves provider references',async()=>{
 const seen=[]
 const rows=Array.from({length:51},(_,i)=>({orderId:uuid,transactionId:'transaction-'+i,amountCents:'1500',receivedAt:'2026-11-08T02:00:00Z'}))
 const db={query:async(sql,args)=>{seen.push({sql,args});return {rows}}}
 const result=await readAbnormalWechatCollections(db,['store-id'],['o.store_id=$1'])
 assert.equal(result.items.length,50)
 assert.equal(result.hasMore,true)
 assert.equal(result.items[0].transactionId,'transaction-0')
 assert.equal(seen[0].args[0],'store-id')
 assert.ok(seen[0].sql.includes("e.event_type='refund_required'"))
 assert.ok(seen[0].sql.includes("e.provider='wechatpay:live'"))
 assert.ok(seen[0].sql.includes('LIMIT 51'))
})
test('read-only abnormal collection ledger returns empty result',async()=>{
 const result=await readAbnormalWechatCollections({query:async()=>({rows:[]})},['store-id'],['o.store_id=$1'])
 assert.deepEqual(result,{items:[],hasMore:false})
})

test('abnormal collection CSV preserves evidence and is safe to open in spreadsheet',()=>{
 const csv=abnormalCollectionsCsv([
  {orderId:'12345678-1234-4234-8234-123456789abc',transactionId:'4200001234567890123456789012',
   amountCents:'1234',receivedAt:new Date('2026-11-08T02:00:00Z')},
  {orderId:'=HYPERLINK("evil")',transactionId:'+SUM(1,1)',
   amountCents:'200',receivedAt:new Date('2026-11-08T03:00:00Z')}
 ])
 assert.equal(csv.charCodeAt(0),0xFEFF)
 assert.ok(csv.includes('\r\n'))
 assert.ok(csv.includes('12.34'))
 assert.ok(csv.includes('待人工复核'))
 assert.ok(csv.includes("'=HYPERLINK"))
 assert.ok(csv.includes("'+SUM"))
 assert.equal(csv.includes('退款已完成'),false)
})

test('abnormal collection export endpoint checks merchant permission before database export',async()=>{
 const calls=[]
 const pool={query:async(sql)=>{calls.push(sql);return {rows:[]}},
  connect:async()=>{throw Error('unauthorized export must not connect')}}
 const res={status:null,body:null,writeHead(code){this.status=code},end(text){this.body=JSON.parse(text)}}
 const handled=await billingRoute({method:'GET',headers:{}},res,
  new URL('https://example.com/v1/merchant/stores/store-1/billing/abnormal-export?all=1&format=json'),pool)
 assert.equal(handled,true)
 assert.equal(res.status,401)
 assert.equal(res.body.error,'login_required')
 assert.equal(calls.length,0)
})
test('merchant abnormal export is read-only, scoped and returns usable CSV',async()=>{
 const prevApp=process.env.APP_ENV,prevLive=process.env.WECHAT_PAY_LIVE_ENABLED
 process.env.APP_ENV='production';process.env.WECHAT_PAY_LIVE_ENABLED='true'
 try{
  const queries=[]
  const db={query:async(sql,args)=>{
   queries.push({sql,args})
   if(sql.startsWith('SELECT e.order_id AS "orderId"'))return {rows:[{
    orderId:uuid,transactionId:'4200001234567890123456789012',
    amountCents:'850',receivedAt:new Date('2026-11-08T02:00:00Z')}]}
   if(sql==='BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'||sql.startsWith('SET LOCAL')||sql==='COMMIT')return {rows:[]}
   throw Error('unanticipated export query')
  },release(){}}
  const pool={query:async sql=>{
   if(sql.includes('FROM auth_sessions'))return {rows:[{external_subject:'merchant-1'}]}
   if(sql.includes('FROM merchant_members'))return {rows:[{id:'store-id',slug:'store-1',role:'owner'}]}
   throw Error('unknown authentication query')
  },connect:async()=>db}
  const res={status:null,body:null,writeHead(code){this.status=code},end(value){this.body=JSON.parse(value)}}
  const handled=await billingRoute({method:'GET',headers:{authorization:'Bearer '+'a'.repeat(40)}},res,
   new URL('https://example.com/v1/merchant/stores/store-1/billing/abnormal-export?all=1&format=json'),pool)
  assert.equal(handled,true)
  assert.equal(res.status,200)
  assert.ok(res.body.csv.includes('4200001234567890123456789012'))
  assert.ok(res.body.csv.includes('8.50'))
  assert.ok(res.body.filename.endsWith('.csv'))
  assert.equal(queries[0].sql.startsWith('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'),true)
  const evidence=queries.find(q=>q.sql.includes("e.event_type='refund_required'"))
  assert.ok(evidence)
  assert.equal(evidence.args[0],'store-id')
  assert.ok(queries.some(q=>q.sql==='COMMIT'))
 }finally{
  if(prevApp===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=prevApp
  if(prevLive===undefined)delete process.env.WECHAT_PAY_LIVE_ENABLED;else process.env.WECHAT_PAY_LIVE_ENABLED=prevLive
 }
})
