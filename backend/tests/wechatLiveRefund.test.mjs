import test from 'node:test'
import assert from 'node:assert/strict'
import {createSign,generateKeyPairSync} from 'node:crypto'
import {wechatPayLiveConfig,wechatPayV3,tradeNo,decodeWechatNotification} from '../src/wechatPayV3.mjs'
import {wechatLiveRefundRoute,applyVerifiedRefund} from '../src/wechatLiveRefundRoute.mjs'
const merchant=generateKeyPairSync('rsa',{modulusLength:2048})
const platform=generateKeyPairSync('rsa',{modulusLength:2048})
const orderId='12345678-1234-4234-8234-123456789abc', refundId='4d965111-853b-4525-9530-357163283946'
const mchid='1900001234', appid='wx'+'a'.repeat(16),refundNo='wr'+refundId.replace(/-/g,'')
const env={APP_ENV:'production',WECHAT_PAY_LIVE_ENABLED:'true',WECHAT_PAY_LIVE_REFUNDS_ENABLED:'true',
 WX_APPID:appid,WECHAT_PAY_MCH_ID:mchid,WECHAT_PAY_STORE_SLUG:'single-store',
 WECHAT_PAY_MERCHANT_SERIAL:'A'.repeat(40),WECHAT_PAY_MERCHANT_PRIVATE_KEY:merchant.privateKey.export({format:'pem',type:'pkcs8'}).toString(),
 WECHAT_PAY_PLATFORM_SERIAL:'PUB_KEY_ID_1234567890',WECHAT_PAY_PLATFORM_PUBLIC_KEY:platform.publicKey.export({format:'pem',type:'spki'}).toString(),
 WECHAT_PAY_API_V3_KEY:'x'.repeat(32),WECHAT_PAY_NOTIFY_URL:'https://pay.example.com/v1/payments/wechat-pay/notify',
 WECHAT_PAY_REFUND_NOTIFY_URL:'https://pay.example.com/v1/payments/wechat-pay/refund-notify'}
const cfg=wechatPayLiveConfig(env)
const txid='4200001234567890123456789012', refundProviderId='50200207182018070300011301001'
const original={id:refundId,order_id:orderId,store_id:'99999999-9999-4999-8999-999999999999',
 out_refund_no:refundNo,original_total_cents:'15000',amount_cents:'5000',transaction_id:txid,
 payment_source:'wechatpay:live',currency:'CNY',payment_status:'paid',status:'processing',provider_refund_id:null}
const observed=(status='SUCCESS')=>({mchid,out_trade_no:tradeNo(orderId),out_refund_no:refundNo,
 transaction_id:txid,refund_id:refundProviderId,refund_status:status,amount:{refund:5000,total:15000}})
function signedHeaders(raw){
 const ts=String(Math.floor(Date.now()/1000)),nonce='nonce'
 return {'wechatpay-serial':env.WECHAT_PAY_PLATFORM_SERIAL,'wechatpay-timestamp':ts,'wechatpay-nonce':nonce,
 'wechatpay-signature':createSign('RSA-SHA256').update(ts+'\n'+nonce+'\n'+raw+'\n').end().sign(platform.privateKey,'base64')}
}
test('refund switch is separate and guarded by production payment gate',()=>{
 assert.equal(wechatPayLiveConfig({...env,WECHAT_PAY_LIVE_ENABLED:'false'}),null)
 assert.equal(wechatPayLiveConfig({...env,WECHAT_PAY_LIVE_REFUNDS_ENABLED:'false'}).refundsEnabled,false)
 assert.throws(()=>wechatPayLiveConfig({...env,WECHAT_PAY_REFUND_NOTIFY_URL:'http://localhost/v1/payments/wechat-pay/refund-notify'}),
  /wechatpay_invalid_configuration/)
})
test('refund API signs original body, always uses fixed out_refund_no and validates trusted response',async()=>{
 const calls=[]
 const api=wechatPayV3(cfg,{fetchImpl:async(url,options)=>{
  calls.push({url,options})
  let data
  if(options.method==='POST'){
   const payload=JSON.parse(options.body)
   assert.deepEqual(payload.amount,{refund:5000,total:15000,currency:'CNY'})
   assert.equal(payload.out_trade_no,tradeNo(orderId))
   assert.equal(payload.out_refund_no,refundNo)
   assert.equal(payload.notify_url,env.WECHAT_PAY_REFUND_NOTIFY_URL)
   data={...observed('PROCESSING'),status:'PROCESSING'}
  }else data={...observed('SUCCESS'),status:'SUCCESS'}
  const raw=JSON.stringify(data),headers=signedHeaders(raw)
  return {ok:true,text:async()=>raw,headers:{get:key=>headers[key.toLowerCase()]}}
 }})
 const received=await api.refund({outTradeNo:tradeNo(orderId),outRefundNo:refundNo,refundCents:5000,totalCents:15000,reason:'商品缺货'})
 assert.equal(received.status,'PROCESSING')
 const status=await api.queryRefund(refundNo)
 assert.equal(status.status,'SUCCESS')
 assert.equal(calls.length,2)
 assert.match(calls[0].url,/\/v3\/refund\/domestic\/refunds$/)
 assert.match(calls[1].url,/\/v3\/refund\/domestic\/refunds\/wr/)
 await assert.rejects(()=>api.refund({outTradeNo:tradeNo(orderId),outRefundNo:'bad',refundCents:5000,totalCents:15000,reason:'a'}),/wechatpay_invalid_refund_request/)
})
test('refund callback authenticates REFUND.SUCCESS before decryption',()=>{
 const event=JSON.stringify({event_type:'REFUND.SUCCESS',resource:{algorithm:'AEAD_AES_256_GCM',
  ciphertext:'bad',associated_data:'',nonce:'123456789012'}})
 assert.throws(()=>decodeWechatNotification(event,signedHeaders(event),cfg),/wechatpay_invalid_notification/)
 assert.throws(()=>decodeWechatNotification(event,{...signedHeaders(event),'wechatpay-signature':'fake'},cfg),/wechatpay_invalid_signature/)
})
function mockPool(state='processing'){
 const refund={...original,status:state},queries=[]
 const db={query:async(sql,params)=>{
  queries.push({sql,params})
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL'))return {rows:[],rowCount:0}
  if(sql.includes('SELECT r.*,o.total_cents'))return {rows:[refund]}
  if(sql.includes('SELECT refund_id FROM wechat_live_refund_events'))return {rows:[]}
  if(sql.includes('INSERT INTO wechat_live_refund_events'))return {rows:[],rowCount:1}
  if(sql.startsWith('UPDATE wechat_live_refunds SET status='))return {rows:[],rowCount:1}
  if(sql.includes('COALESCE(SUM(amount_cents)'))return {rows:[{total:'5000'}]}
  if(sql.startsWith('UPDATE orders SET payment_status='))return {rows:[],rowCount:1}
  throw Error('unexpected SQL '+sql)
 },release(){}}
 return {connect:async()=>db,queries}
}
test('verified successful refund is counted once, does not release stock',async()=>{
 const pool=mockPool()
 const result=await applyVerifiedRefund(pool,{refundId,storeId:original.store_id,config:cfg,
  observation:observed(),eventId:'EV123456',eventType:'REFUND.SUCCESS'})
 assert.equal(result.status,'succeeded')
 assert.equal(pool.queries.filter(q=>q.sql.startsWith('UPDATE orders SET payment_status=')).length,1)
 assert.equal(pool.queries.some(q=>q.sql.includes('inventory_reservations')||q.sql.includes('stock_quantity')),false)
})
test('mismatched provider amount aborts transaction without changing order',async()=>{
 const pool=mockPool()
 await assert.rejects(()=>applyVerifiedRefund(pool,{refundId,storeId:original.store_id,config:cfg,
  observation:{...observed(),amount:{total:15000,refund:100}},eventId:'EV123',eventType:'REFUND.SUCCESS'}),
  /wechatpay_refund_mismatch/)
 assert.equal(pool.queries.some(q=>q.sql.startsWith('UPDATE orders SET payment_status=')),false)
 assert.equal(pool.queries.some(q=>q.sql==='ROLLBACK'),true)
})
test('processing callback after success never reverts successful refund',async()=>{
 const pool=mockPool('succeeded')
 const result=await applyVerifiedRefund(pool,{refundId,storeId:original.store_id,config:cfg,
  observation:observed('PROCESSING')})
 assert.equal(result.status,'succeeded')
})
test('disabled refund API never touches database',async()=>{
 const pool={connect(){throw Error('should not connect')},query(){throw Error('should not query')}}
 const res={status:0,writeHead(code){this.status=code},end(){}}
 const handled=await wechatLiveRefundRoute({method:'POST',headers:{}},res,
  new URL('https://example.com/v1/payments/wechat-pay/refund-notify'),pool,
  {...env,WECHAT_PAY_LIVE_REFUNDS_ENABLED:'false'})
 assert.equal(handled,true)
 assert.equal(res.status,404)
})
