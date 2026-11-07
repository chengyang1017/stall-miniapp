import test from 'node:test'
import assert from 'node:assert/strict'
import {createCipheriv,createSign,createVerify,generateKeyPairSync} from 'node:crypto'
import {wechatPayLiveConfig,tradeNo,orderIdFromTradeNo,verifyWechatSignature,decodeWechatNotification,trustedWechatSuccess,wechatPayV3} from '../src/wechatPayV3.mjs'
import {wechatLivePaymentRoute} from '../src/wechatLivePaymentRoute.mjs'

const merchant=generateKeyPairSync('rsa',{modulusLength:2048})
const platform=generateKeyPairSync('rsa',{modulusLength:2048})
const appid='wx'+'a'.repeat(16),mchid='1900001234',orderId='12345678-1234-4234-8234-123456789abc'
const customer='wx:'+appid+':user_openid'
const serial='PUB_KEY_ID_1234567890'
const secret='t'.repeat(32)
const env={
 APP_ENV:'production',WECHAT_PAY_LIVE_ENABLED:'true',PAYMENT_DB_ENV:'production',
 WX_APPID:appid,WECHAT_PAY_MCH_ID:mchid,WECHAT_PAY_STORE_SLUG:'store-1',
 WECHAT_PAY_MERCHANT_SERIAL:'A'.repeat(40),
 WECHAT_PAY_MERCHANT_PRIVATE_KEY:merchant.privateKey.export({type:'pkcs8',format:'pem'}).toString(),
 WECHAT_PAY_PLATFORM_SERIAL:serial,
 WECHAT_PAY_PLATFORM_PUBLIC_KEY:platform.publicKey.export({type:'spki',format:'pem'}).toString(),
 WECHAT_PAY_API_V3_KEY:secret,
 WECHAT_PAY_NOTIFY_URL:'https://pay.example.com/v1/payments/wechat-pay/notify'
}
const config=wechatPayLiveConfig(env)
const order={id:orderId,customer_subject:customer,total_cents:'15000',currency:'CNY'}
const signature=(s,body)=>createSign('RSA-SHA256').update(body).end().sign(s,'base64')
function signedHeaders(raw,now=Math.floor(Date.now()/1000),nonce='test-nonce'){
 const ts=String(now)
 return {'wechatpay-serial':serial,'wechatpay-timestamp':ts,'wechatpay-nonce':nonce,
  'wechatpay-signature':signature(platform.privateKey,ts+'\n'+nonce+'\n'+raw+'\n')}
}
function callback(tx=validTransaction()){
 const nonce='123456789012',aad='transaction'
 const cipher=createCipheriv('aes-256-gcm',Buffer.from(secret),Buffer.from(nonce))
 cipher.setAAD(Buffer.from(aad))
 const bytes=Buffer.concat([cipher.update(JSON.stringify(tx),'utf8'),cipher.final(),cipher.getAuthTag()])
 return JSON.stringify({id:'event-1',event_type:'TRANSACTION.SUCCESS',resource:{
  algorithm:'AEAD_AES_256_GCM',nonce,associated_data:aad,ciphertext:bytes.toString('base64')}})
}
function validTransaction(){return {mchid,appid,out_trade_no:tradeNo(orderId),
 trade_state:'SUCCESS',transaction_id:'4200001234567890123456789012',payer:{openid:'user_openid'},
 amount:{total:15000,currency:'CNY'}}}
const response=()=>({code:0,data:null,writeHead(n){this.code=n},end(value){this.data=JSON.parse(value)}})
test('strict live feature gate; no activation by stale sandbox settings',()=>{
 assert.equal(wechatPayLiveConfig({...env,WECHAT_PAY_LIVE_ENABLED:'false'}),null)
 assert.equal(wechatPayLiveConfig({...env,APP_ENV:'sandbox'}),null)
 assert.equal(wechatPayLiveConfig({...env,PAYMENT_DB_ENV:'isolated-test'}),null)
 assert.throws(()=>wechatPayLiveConfig({...env,WECHAT_PAY_PLATFORM_SERIAL:'wrong'}),/wechatpay_invalid_configuration/)
 assert.throws(()=>wechatPayLiveConfig({...env,WECHAT_PAY_API_V3_KEY:'short'}),/wechatpay_invalid_configuration/)
})
test('trade number is stable, reversible and rejects malformed input',()=>{
 assert.equal(tradeNo(orderId),'12345678123442348234123456789abc')
 assert.equal(orderIdFromTradeNo(tradeNo(orderId)),orderId)
 assert.throws(()=>orderIdFromTradeNo('abc'),/invalid_out_trade_no/)
})
test('webhook signature and AES-GCM authenticated resource must both be correct',()=>{
 const raw=callback(),headers=signedHeaders(raw)
 assert.equal(verifyWechatSignature(headers,raw,config),true)
 const event=decodeWechatNotification(raw,headers,config)
 assert.equal(event.eventType,'TRANSACTION.SUCCESS')
 assert.equal(event.transaction.out_trade_no,tradeNo(orderId))
 assert.deepEqual(trustedWechatSuccess(event.transaction,config,order),{
  verifiedByProvider:true,provider:'wechatpay',mode:'live',orderId,
  transactionId:'4200001234567890123456789012',amountCents:15000,currency:'CNY',status:'succeeded'})
 assert.throws(()=>verifyWechatSignature(headers,raw+' ',config),/wechatpay_invalid_signature/)
 assert.throws(()=>verifyWechatSignature({...headers,'wechatpay-serial':'WRONG'},raw,config),/wechatpay_invalid_signature/)
 assert.throws(()=>verifyWechatSignature(signedHeaders(raw,1),raw,config),/wechatpay_invalid_signature/)
 assert.throws(()=>verifyWechatSignature({...headers,'wechatpay-signature':'WECHATPAY\/SIGNTEST\/xx'},raw,config),/wechatpay_invalid_signature/)
 const changed=callback({...validTransaction(),amount:{total:1,currency:'CNY'}})
 assert.throws(()=>trustedWechatSuccess(decodeWechatNotification(changed,signedHeaders(changed),config).transaction,config,order),/wechatpay_transaction_mismatch/)
})
test('signed API response is verified, prepay and requestPayment signatures are correct',async()=>{
 let calledPath='',requestAuth=''
 const api=wechatPayV3(config,{fetchImpl:async(url,options)=>{
  const path=new URL(url).pathname
  calledPath=path;requestAuth=options.headers.Authorization
  const body=JSON.stringify({prepay_id:'wx201410272009395522657a690389285100'})
  const headers=signedHeaders(body)
  return {ok:true,text:async()=>body,headers:{get:k=>headers[k.toLowerCase()]}}
 }})
 const prepay=await api.prepay(order,'2026-11-08T02:00:00Z')
 assert.equal(calledPath,'/v3/pay/transactions/jsapi')
 assert.match(requestAuth,/WECHATPAY2-SHA256-RSA2048/)
 const params=api.requestPaymentParams(prepay)
 assert.equal(params.package,'prepay_id='+prepay)
 assert.equal(params.signType,'RSA')
 const message=appid+'\n'+params.timeStamp+'\n'+params.nonceStr+'\n'+params.package+'\n'
 assert.equal(createVerify('RSA-SHA256').update(message).end().verify(merchant.publicKey,params.paySign,'base64'),true)
})
test('disabled production route neither queries DB nor starts a payment',async()=>{
 const db={query(){throw Error('DB must not be queried')},connect(){throw Error('DB must not be used')}}
 const res=response()
 const handled=await wechatLivePaymentRoute({method:'POST',headers:{}},res,new URL('https://example.com/v1/stores/store-1/orders/'+orderId+'/wechat-pay'),db,{...env,WECHAT_PAY_LIVE_ENABLED:'false'})
 assert.equal(handled,true)
 assert.equal(res.code,404)
})
