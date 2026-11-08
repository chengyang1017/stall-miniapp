// WeChat Pay live JSAPI routes, isolated from Stripe sandbox and staging simulation.
// Requires explicit production enablement and a single verified merchant/store.
import {authenticate} from './auth.mjs'
import {createPaymentGateway} from './paymentGateway.mjs'
import {settleVerifiedOrderPayment} from './paymentSettlementTransaction.mjs'
import {wechatPayLiveConfig,wechatPayV3,tradeNo,orderIdFromTradeNo,decodeWechatNotification,trustedWechatSuccess} from './wechatPayV3.mjs'

const uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const matchOrder=new RegExp('^/v1/stores/([a-z0-9][a-z0-9-]{1,62})/orders/('+uuid+')/wechat-pay$')
const notificationPath='/v1/payments/wechat-pay/notify'
const response=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))}
async function rawBody(req){
 let n=0,parts=[]
 for await(const part of req){n+=part.length;if(n>65536)throw Error('too_large');parts.push(Buffer.from(part))}
 return Buffer.concat(parts).toString('utf8')
}
const isUuid=value=>new RegExp('^'+uuid+'$').test(value)
const requestKey=order=>tradeNo(order.id)
async function scopedOrder(db,slug,id,subject,lock=false){
 const sql=`SELECT o.id,o.store_id,o.customer_subject,o.total_cents,o.currency,o.created_at,o.inventory_expires_at,
 o.inventory_state,o.payment_status,o.payment_source,o.fulfillment_status,s.slug
 FROM orders o JOIN stores s ON s.id=o.store_id
 WHERE o.id=$1 AND o.customer_subject=$2 AND s.slug=$3 AND s.is_active=true`+(lock?' FOR UPDATE OF o':'')
 const {rows}=await db.query(sql,[id,subject,slug])
 return rows[0]||null
}
export const verifiedWechatOrderStatus=order=>
 order?.payment_source==='wechatpay:live'&&
 ['paid','partially_refunded','refunded'].includes(order.payment_status)?order.payment_status:null
export const verifiedWechatPaidOrder=order=>verifiedWechatOrderStatus(order)==='paid'
async function trustedSettlement(pool,tx,config,order){
 // Only call after a verified WeChat API response or verified notification.
 const confirmed=trustedWechatSuccess(tx,config,order)
 const gateway=createPaymentGateway({provider:'wechatpay',mode:'live',
  createPayment:async()=>{throw Error('unsupported')},verifyNotification:async()=>confirmed})
 const event=await gateway.verifyNotification('',{request:{orderId:order.id,
  amountCents:Number(order.total_cents),currency:'CNY',requestKey:requestKey(order)},headers:{}})
 return settleVerifiedOrderPayment(pool,{event,expectedProvider:'wechatpay',expectedMode:'live'})
}
export async function wechatLivePaymentRoute(req,res,url,pool,env=process.env,deps={}){
 const match=matchOrder.exec(url.pathname),notify=url.pathname===notificationPath
 if(!match&&!notify)return false
 if(url.search||(notify?req.method!=='POST':!['GET','POST'].includes(req.method))){
  response(res,405,{error:'method_not_allowed'});return true
 }
 let config
 try{config=wechatPayLiveConfig(env)}catch{response(res,503,{error:'wechatpay_configuration_incomplete'});return true}
 if(!config){response(res,404,{error:'not_found'});return true}
 const pay=deps.pay||wechatPayV3(config)
 try{
  if(notify){
   const raw=await rawBody(req)
   const decoded=decodeWechatNotification(raw,req.headers,config)
   if(decoded.eventType!=='TRANSACTION.SUCCESS'){response(res,200,{code:'SUCCESS',message:'成功'});return true}
   const tx=decoded.transaction
   const orderId=orderIdFromTradeNo(tx?.out_trade_no)
   const {rows:[order]}=await pool.query(`SELECT o.id,o.customer_subject,o.total_cents,o.currency,
    s.slug FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.id=$1`,[orderId])
   if(!order||order.slug!==config.storeSlug)throw Error('wechatpay_order_not_found')
   await trustedSettlement(pool,tx,config,order)
   response(res,200,{code:'SUCCESS',message:'成功'});return true
  }
  if(match[1]!==config.storeSlug){response(res,404,{error:'not_found'});return true}
  const subject=await authenticate(pool,req)
  if(!subject){response(res,401,{error:'login_required'});return true}
  const id=match[2].toLowerCase()
  if(!isUuid(id)){response(res,400,{error:'invalid_order_id'});return true}
  if(req.method==='GET'){
   const order=await scopedOrder(pool,match[1],id,subject)
   if(!order){response(res,404,{error:'order_not_found'});return true}
   const verifiedStatus=verifiedWechatOrderStatus(order)
   if(verifiedStatus){response(res,200,{paymentStatus:verifiedStatus,verified:true});return true}
   // Do not report a sandbox, simulated, or unrelated provider's payment as live WeChat money.
   if(order.payment_status==='paid'||order.payment_source&&order.payment_source!=='wechatpay:live'){
    response(res,409,{error:'payment_source_mismatch'});return true
   }
   const tx=await pay.query(id)
   if(tx?.out_trade_no!==requestKey(order)||tx?.mchid!==config.mchid||tx?.appid!==config.appId)throw Error('wechatpay_query_mismatch')
   if(tx.trade_state==='SUCCESS'){
    const decision=await trustedSettlement(pool,tx,config,order)
    response(res,200,{paymentStatus:decision.action==='refund_required'?'refund_required':'paid',verified:true});return true
   }
   response(res,200,{paymentStatus:'unpaid',tradeState:typeof tx.trade_state==='string'?tx.trade_state:'UNKNOWN',verified:true});return true
  }
  // POST: the same order always has the same merchant out_trade_no.
  // Lock prevents issuing competing prepay requests for this order.
  const db=await pool.connect()
  try{
   await db.query('BEGIN')
   const order=await scopedOrder(db,match[1],id,subject,true)
   if(!order){await db.query('ROLLBACK');response(res,404,{error:'order_not_found'});return true}
   const expiresAt=Math.min(Date.parse(order.created_at)+15*60000,
     order.inventory_expires_at?Date.parse(order.inventory_expires_at):Infinity)
   if(order.currency!=='CNY'||!Number.isSafeInteger(Number(order.total_cents))||
    Number(order.total_cents)<=0||order.payment_status!=='unpaid'||order.fulfillment_status!=='new'||
    !['none','held'].includes(order.inventory_state)||expiresAt<Date.now()+65000){
    await db.query('ROLLBACK');response(res,409,{error:'order_not_payable'});return true
   }
   const previous=(await db.query('SELECT prepay_id,expires_at,mchid,amount_cents FROM wechat_live_prepays WHERE order_id=$1',[id])).rows[0]
   if(previous){
    if(previous.mchid!==config.mchid||Number(previous.amount_cents)!==Number(order.total_cents)||
      Date.parse(previous.expires_at)<Date.now()+60000)throw Error('wechatpay_existing_prepay_unavailable')
    await db.query('COMMIT')
    response(res,200,{...pay.requestPaymentParams(previous.prepay_id),orderId:id});return true
   }
   const prepayId=await pay.prepay(order,new Date(expiresAt).toISOString())
   await db.query(`INSERT INTO wechat_live_prepays(order_id,store_id,mchid,out_trade_no,amount_cents,prepay_id,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,order.store_id,config.mchid,requestKey(order),order.total_cents,prepayId,new Date(expiresAt)])
   await db.query('COMMIT')
   response(res,200,{...pay.requestPaymentParams(prepayId),orderId:id})
  }catch(error){try{await db.query('ROLLBACK')}catch{};throw error}finally{db.release()}
  return true
 }catch(error){
  const code=String(error?.code||error?.message||'')
  const bad=/^(wechatpay_invalid_signature|wechatpay_invalid_notification|invalid_out_trade_no)$/.test(code)
  const conflict=code==='wechatpay_existing_prepay_unavailable'
  // Never acknowledge unrecorded funds. WeChat can retry notifications.
  response(res,bad?400:conflict?409:503,{error:bad?'invalid_wechatpay_notification':conflict?'payment_window_unavailable':'wechatpay_temporarily_unavailable'})
  return true
 }
}
