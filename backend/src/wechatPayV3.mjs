// Single-merchant WeChat Pay API v3 (ordinary merchant), deliberately disabled by default.
// Private keys and APIv3 secret are server-only; never place them in mini-program assets.
import {createPrivateKey,createPublicKey,createSign,createVerify,randomBytes,createDecipheriv} from 'node:crypto'

const err=code=>Object.assign(Error(code),{code})
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const slug=/^[a-z0-9][a-z0-9-]{1,62}$/
const serial=/^(?:[A-F0-9]{16,128}|PUB_KEY_ID_[0-9]+)$/
const merchant=/^[0-9]{6,32}$/
const app=/^wx[a-f0-9]{16}$/i
const pem=text=>String(text||'').replace(/\\n/g,'\n')
const signed=(key,input)=>createSign('RSA-SHA256').update(input).end().sign(key,'base64')
const verify=(key,input,signature)=>{try{return createVerify('RSA-SHA256').update(input).end().verify(key,Buffer.from(signature,'base64'))}catch{return false}}
export const tradeNo=orderId=>{
 if(typeof orderId!=='string'||!uuid.test(orderId))throw err('invalid_order_id')
 return orderId.replace(/-/g,'').toLowerCase()
}
export const orderIdFromTradeNo=value=>{
 if(typeof value!=='string'||!/^[a-f0-9]{32}$/.test(value))throw err('invalid_out_trade_no')
 return value.slice(0,8)+'-'+value.slice(8,12)+'-'+value.slice(12,16)+'-'+value.slice(16,20)+'-'+value.slice(20)
}
export function wechatPayLiveConfig(env=process.env){
 if(env.APP_ENV!=='production'||env.PAYMENT_DB_ENV==='isolated-test'||env.WECHAT_PAY_LIVE_ENABLED!=='true')return null
 const notify=String(env.WECHAT_PAY_NOTIFY_URL||'')
 let url
 try{url=new URL(notify)}catch{throw err('wechatpay_invalid_configuration')}
 if(!merchant.test(env.WECHAT_PAY_MCH_ID||'')||!app.test(env.WX_APPID||'')||
  !slug.test(env.WECHAT_PAY_STORE_SLUG||'')||!serial.test(env.WECHAT_PAY_MERCHANT_SERIAL||'')||
  !serial.test(env.WECHAT_PAY_PLATFORM_SERIAL||'')||
  url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
  url.pathname!=='/v1/payments/wechat-pay/notify'||
  !/^[a-z0-9.-]+$/i.test(url.hostname)||Buffer.byteLength(env.WECHAT_PAY_API_V3_KEY||'')!==32)
  throw err('wechatpay_invalid_configuration')
 let privateKey,platformKey
 try{
  privateKey=createPrivateKey(pem(env.WECHAT_PAY_MERCHANT_PRIVATE_KEY))
  platformKey=createPublicKey(pem(env.WECHAT_PAY_PLATFORM_PUBLIC_KEY))
  if(privateKey.asymmetricKeyType!=='rsa'||platformKey.asymmetricKeyType!=='rsa')throw Error('bad_key')
 }catch{throw err('wechatpay_invalid_configuration')}
 return Object.freeze({appId:env.WX_APPID,mchid:env.WECHAT_PAY_MCH_ID,
  storeSlug:env.WECHAT_PAY_STORE_SLUG,serial:env.WECHAT_PAY_MERCHANT_SERIAL,
  platformSerial:env.WECHAT_PAY_PLATFORM_SERIAL,privateKey,platformKey,
  v3key:Buffer.from(env.WECHAT_PAY_API_V3_KEY),notifyUrl:notify})
}
export function verifyWechatSignature(headers,raw,config,now=Date.now()){
 const serialHeader=headers['wechatpay-serial']
 const ts=String(headers['wechatpay-timestamp']||'')
 const nonce=String(headers['wechatpay-nonce']||'')
 const signature=headers['wechatpay-signature']
 if(serialHeader!==config.platformSerial||!/^[0-9]{10}$/.test(ts)||
  Math.abs(now-Number(ts)*1000)>300000||!nonce||nonce.length>128||
  typeof signature!=='string'||signature.startsWith('WECHATPAY/SIGNTEST/')||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)||
  !verify(config.platformKey,ts+'\n'+nonce+'\n'+raw+'\n',signature))throw err('wechatpay_invalid_signature')
 return true
}
export function decodeWechatNotification(raw,headers,config){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>65536)throw err('wechatpay_invalid_notification')
 verifyWechatSignature(headers,raw,config)
 let event
 try{event=JSON.parse(raw)}catch{throw err('wechatpay_invalid_notification')}
 if(!event||!/^TRANSACTION\./.test(event.event_type||'')||
   event.resource?.algorithm!=='AEAD_AES_256_GCM')throw err('wechatpay_invalid_notification')
 const resource=event.resource
 if(typeof resource.nonce!=='string'||typeof resource.ciphertext!=='string'||typeof resource.associated_data!=='string')throw err('wechatpay_invalid_notification')
 let data
 try{
  const bytes=Buffer.from(resource.ciphertext,'base64')
  if(bytes.length<17)throw Error('ciphertext')
  const decipher=createDecipheriv('aes-256-gcm',config.v3key,Buffer.from(resource.nonce))
  decipher.setAAD(Buffer.from(resource.associated_data))
  decipher.setAuthTag(bytes.subarray(-16))
  data=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]).toString('utf8'))
 }catch{throw err('wechatpay_invalid_notification')}
 return {eventId:event.id,eventType:event.event_type,transaction:data}
}
export function trustedWechatSuccess(tx,config,order){
 if(!tx||tx.trade_state!=='SUCCESS'||tx.appid!==config.appId||tx.mchid!==config.mchid||
   tx.out_trade_no!==tradeNo(order.id)||tx.payer?.openid!==order.customer_subject?.slice(('wx:'+config.appId+':').length)||
   !order.customer_subject?.startsWith('wx:'+config.appId+':')||
   tx.amount?.currency!=='CNY'||tx.amount?.total!==Number(order.total_cents)||
   !/^[0-9]{8,32}$/.test(tx.transaction_id||'')||order.currency!=='CNY')
  throw err('wechatpay_transaction_mismatch')
 return {verifiedByProvider:true,provider:'wechatpay',mode:'live',orderId:order.id,
  transactionId:tx.transaction_id,amountCents:Number(order.total_cents),currency:'CNY',status:'succeeded'}
}
export function wechatPayV3(config,{fetchImpl=fetch,now=()=>Date.now()}={}){
 async function request(method,path,body=null){
  if(!/^\/v3\/(pay\/transactions\/|pay\/refund)/.test(path))throw err('wechatpay_invalid_api_path')
  const timestamp=String(Math.floor(now()/1000)),nonce=randomBytes(16).toString('hex')
  const payload=body===null?'':JSON.stringify(body)
  const authorization='WECHATPAY2-SHA256-RSA2048 mchid="'+config.mchid+'",nonce_str="'+nonce+
   '",timestamp="'+timestamp+'",serial_no="'+config.serial+'",signature="'+
   signed(config.privateKey,method+'\n'+path+'\n'+timestamp+'\n'+nonce+'\n'+payload+'\n')+'"'
  let response,raw
  try{
   response=await fetchImpl('https://api.mch.weixin.qq.com'+path,{method,
    headers:{Authorization:authorization,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:payload}:{}),signal:AbortSignal.timeout(8000)})
   raw=await response.text()
  }catch{throw err('wechatpay_network_unknown')}
  if(raw.length>65536)throw err('wechatpay_response_too_large')
  // API replies must be authenticated with the configured WeChat Pay key.
  verifyWechatSignature({
   'wechatpay-serial':response.headers.get('wechatpay-serial'),
   'wechatpay-timestamp':response.headers.get('wechatpay-timestamp'),
   'wechatpay-nonce':response.headers.get('wechatpay-nonce'),
   'wechatpay-signature':response.headers.get('wechatpay-signature')
  },raw,config,now())
  if(!response.ok)throw err('wechatpay_provider_rejected')
  try{return raw?JSON.parse(raw):{}}catch{throw err('wechatpay_invalid_response')}
 }
 return Object.freeze({
  async prepay(order,expiresAt){
   if(!Number.isSafeInteger(Number(order.total_cents))||Number(order.total_cents)<=0||order.currency!=='CNY'||
    !order.customer_subject?.startsWith('wx:'+config.appId+':'))throw err('wechatpay_invalid_order')
   const openid=order.customer_subject.slice(('wx:'+config.appId+':').length)
   const result=await request('POST','/v3/pay/transactions/jsapi',{
    appid:config.appId,mchid:config.mchid,description:'店铺订单',out_trade_no:tradeNo(order.id),
    time_expire:expiresAt,notify_url:config.notifyUrl,
    amount:{total:Number(order.total_cents),currency:'CNY'},payer:{openid}
   })
   if(!/^wx[A-Za-z0-9]+$/.test(result.prepay_id||''))throw err('wechatpay_invalid_prepay')
   return result.prepay_id
  },
  async query(orderId){
   const path='/v3/pay/transactions/out-trade-no/'+tradeNo(orderId)+'?mchid='+encodeURIComponent(config.mchid)
   return request('GET',path)
  },
  requestPaymentParams(prepayId){
   if(!/^wx[A-Za-z0-9]+$/.test(prepayId||''))throw err('wechatpay_invalid_prepay')
   const timeStamp=String(Math.floor(now()/1000)),nonceStr=randomBytes(16).toString('hex')
   const pkg='prepay_id='+prepayId
   return {timeStamp,nonceStr,package:pkg,signType:'RSA',
    paySign:signed(config.privateKey,config.appId+'\n'+timeStamp+'\n'+nonceStr+'\n'+pkg+'\n')}
  }
 })
}
