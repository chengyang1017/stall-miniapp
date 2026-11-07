// Read-only merchant/customer live WeChat payment evidence, not a tax invoice.
// Only a durable, provider-verified event can create a customer-visible receipt.
import {createHash} from 'node:crypto'
import {authenticate,permittedStore} from './auth.mjs'
import {wechatPayLiveConfig} from './wechatPayV3.mjs'
const uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const customer=new RegExp('^/v1/stores/([a-z0-9][a-z0-9-]{1,62})/orders/('+uuid+')/wechat-receipt$')
const merchant=new RegExp('^/v1/merchant/stores/([a-z0-9][a-z0-9-]{1,62})/orders/('+uuid+')/wechat-receipt$')
const fail=(code)=>Object.assign(Error(code),{code})
const response=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))}
const asInt=(x)=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<0)throw fail('invalid_receipt_amount');return n}
const safeDate=(v)=>{const d=new Date(v);if(!Number.isFinite(d.getTime()))throw fail('invalid_receipt_date');return d.toISOString()}
export function buildLiveReceipt({order,items,events,refunds}){
 if(!order||order.payment_source!=='wechatpay:live'||!['paid','partially_refunded','refunded'].includes(order.payment_status)||
  order.currency!=='CNY'||!order.paid_at||!Array.isArray(items)||!items.length||!Array.isArray(events)||
  events.length!==1||!Array.isArray(refunds))throw fail('live_receipt_unverified')
 const event=events[0],subtotal=asInt(order.subtotal_cents),delivery=asInt(order.delivery_fee_cents),total=asInt(order.total_cents)
 if(total!==subtotal+delivery||event.event_type!=='payment_succeeded'||event.provider!=='wechatpay:live'||
  asInt(event.amount_cents)!==total||!/^[0-9]{8,32}$/.test(event.provider_event_id||''))throw fail('live_receipt_unverified')
 let itemTotal=0
 const lines=items.map(item=>{
  const quantity=asInt(item.quantity),unitCents=asInt(item.unit_price_cents),lineCents=asInt(item.line_total_cents)
  if(!quantity||!lineCents&&unitCents>0||lineCents!==quantity*unitCents||
   typeof item.product_name!=='string'||!item.product_name.trim())throw fail('live_receipt_unverified')
  itemTotal+=lineCents
  return {name:item.product_name,quantity,unitCents,lineCents}
 })
 if(itemTotal!==subtotal)throw fail('live_receipt_unverified')
 let refunded=0,unresolved=0
 for(const entry of refunds){
  const amount=asInt(entry.amount_cents)
  if(entry.status==='succeeded')refunded+=amount
  else if(['pending','submitting','unknown','processing','abnormal','review'].includes(entry.status))unresolved+=amount
  else if(entry.status!=='closed')throw fail('live_receipt_unverified')
 }
 if(refunded>total||unresolved>total||refunded+unresolved>total)throw fail('live_receipt_unverified')
 if((order.payment_status==='refunded')!==(refunded===total)||
   (order.payment_status==='partially_refunded')!==(refunded>0&&refunded<total))throw fail('live_receipt_unverified')
 const receipt=Object.freeze({
  type:'wechat_payment_record',invoice:false,provider:'wechatpay:live',currency:'CNY',
  orderId:order.id,storeName:order.store_name,storeId:order.store_id,
  transactionId:event.provider_event_id,createdAt:safeDate(order.created_at),paidAt:safeDate(order.paid_at),
  lines,subtotalCents:subtotal,deliveryFeeCents:delivery,totalCents:total,
  refundedCents:refunded,refundPendingCents:unresolved,netCents:total-refunded,
  paymentStatus:order.payment_status,
  notice:'微信支付核验付款记录；非税务发票。退款结果以官方记录为准。'
 })
 const document=JSON.stringify(receipt)
 return {receipt,sha256:createHash('sha256').update(document).digest('hex')}
}
export async function wechatLiveReceiptRoute(req,res,url,pool,env=process.env){
 const customerMatch=customer.exec(url.pathname),merchantMatch=merchant.exec(url.pathname)
 if(!customerMatch&&!merchantMatch)return false
 if(req.method!=='GET'||url.search){response(res,405,{error:'method_not_allowed'});return true}
 let config
 try{config=wechatPayLiveConfig(env)}catch{response(res,503,{error:'payment_configuration_incomplete'});return true}
 if(!config){response(res,404,{error:'not_found'});return true}
 const m=customerMatch||merchantMatch,slug=m[1],orderId=m[2].toLowerCase(),isMerchant=!!merchantMatch
 if(slug!==config.storeSlug){response(res,404,{error:'not_found'});return true}
 try{
  const subject=await authenticate(pool,req)
  if(!subject){response(res,401,{error:'login_required'});return true}
  let storeId=null
  if(isMerchant){
   const store=await permittedStore(pool,subject,slug)
   if(!store||!['owner','manager'].includes(store.role)){response(res,403,{error:'forbidden'});return true}
   storeId=store.id
  }
  const db=await pool.connect()
  let active=false
  try{
   await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');active=true
   await db.query("SET LOCAL statement_timeout='5000ms'")
   const {rows:[order]}=await db.query(
    "SELECT o.id,o.store_id,s.name AS store_name,o.customer_subject,o.payment_source,o.payment_status,"+
    "o.currency,o.subtotal_cents,o.delivery_fee_cents,o.total_cents,o.created_at,o.paid_at "+
    "FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.id=$1 AND s.slug=$2 AND s.is_active=true "+
    "AND ($3::boolean=false AND o.customer_subject=$4 OR $3::boolean=true AND o.store_id=$5::uuid)",
    [orderId,slug,isMerchant,subject,storeId])
   if(!order){response(res,404,{error:'receipt_not_found'});return true}
   const [items,events,refunds]=await Promise.all([
    db.query("SELECT product_name,quantity,unit_price_cents,line_total_cents FROM order_items WHERE order_id=$1 ORDER BY id LIMIT 501",[orderId]),
    db.query("SELECT provider,event_type,provider_event_id,amount_cents FROM payment_events WHERE order_id=$1 AND provider='wechatpay:live' AND event_type='payment_succeeded' LIMIT 3",[orderId]),
    db.query("SELECT amount_cents,status FROM wechat_live_refunds WHERE order_id=$1 ORDER BY id LIMIT 51",[orderId])
   ])
   if(items.rows.length>500||refunds.rows.length>50)throw fail('live_receipt_unverified')
   const result=buildLiveReceipt({order,items:items.rows,events:events.rows,refunds:refunds.rows})
   await db.query('COMMIT');active=false
   response(res,200,result)
   return true
  }finally{if(active)await db.query('ROLLBACK').catch(()=>{});db.release()}
 }catch(e){
  const bad=['live_receipt_unverified','invalid_receipt_amount','invalid_receipt_date'].includes(e.code)
  response(res,bad?409:503,{error:bad?'receipt_not_verified':'receipt_temporarily_unavailable'})
  return true
 }
}
