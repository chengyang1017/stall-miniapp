export const reviewPolicy=Object.freeze({editWindowDays:7,maxCustomerEdits:1,maxImages:3,maxImageBytes:5*1024*1024,maxText:500,maxPage:20,maxRevisionsPerDay:20,unboundImageDays:7})
// Only isolated Stripe TEST settlements may serve as evidence for *test* reviews.
// Do not use this proof for real-purchase certification or production reviews.
import {createHash} from 'node:crypto'
import {sandboxEnabled,assertSandboxDatabase} from './sandboxPaymentWorker.mjs'
const notVerified=reason=>({verified:false,reason})
export async function verifiedReviewPayment(db,order){
 if(order?.payment_source!=='stripe:sandbox')return notVerified('真实支付的可信核验尚未接入，暂不能发表评价')
 if(process.env.APP_ENV!=='sandbox'||!sandboxEnabled(process.env))
  return notVerified('仅隔离 Sandbox 测试环境可创建测试评价')
 try{await assertSandboxDatabase(db,process.env)}catch{return notVerified('Sandbox 数据库身份尚未核验，不能创建测试评价')}
 const {rows}=await db.query(`SELECT r.id AS receipt_id,r.document_text,r.sha256,
  a.session_id,a.payment_intent_id,a.channel,a.amount_cents,a.currency
  FROM orders o
  JOIN sandbox_payment_attempts a ON a.order_id=o.id AND a.status='succeeded'
  JOIN sandbox_payment_receipts r ON r.order_id=o.id AND r.attempt_id=a.id
  JOIN payment_events e ON e.order_id=o.id AND e.provider='stripe:sandbox'
     AND e.event_type='payment_succeeded' AND e.provider_event_id=a.session_id
  WHERE o.id=$1 AND o.store_id=$2 AND o.customer_subject=$3
    AND o.payment_source='stripe:sandbox' AND o.payment_status='paid'
    AND o.fulfillment_status='delivered' AND o.currency='CNY'
    AND a.currency=o.currency AND a.amount_cents=o.total_cents
    AND e.amount_cents=o.total_cents
  LIMIT 2`,[order.id,order.store_id,order.customer_subject])
 if(rows.length!==1)return notVerified('未找到完整且唯一的 Stripe Sandbox 成功付款记录与测试小票')
 const proof=rows[0]
 if(!/^cs_test_[A-Za-z0-9_]+$/.test(proof.session_id||'')||
    !/^pi_[A-Za-z0-9_]+$/.test(proof.payment_intent_id||'')||
    createHash('sha256').update(proof.document_text).digest('hex')!==proof.sha256)
  return notVerified('测试付款凭证完整性校验失败')
 let document
 try{document=JSON.parse(proof.document_text)}catch{return notVerified('测试付款凭证无法解析')}
 if(document.sandbox!==true||document.provider!=='stripe:sandbox'||
    document.orderId!==order.id||document.currency!==order.currency||
    Number(document.totalCents)!==Number(order.total_cents)||
    document.transactionId!==proof.session_id||
    document.paymentIntentId!==proof.payment_intent_id||
    document.channel!==proof.channel)
  return notVerified('测试付款凭证与订单不一致')
 return {verified:true,orderId:order.id,storeId:order.store_id,
  customerSubject:order.customer_subject,totalCents:order.total_cents,
  currency:order.currency,receiptRef:'sandbox-test:'+proof.receipt_id,
  reason:'Stripe Sandbox 测试付款已核验；仅允许测试评价，不作为真实购买评价公开'}
}
// Optional text/image safety adapter. No configured scanner means pending, never
// approval. Manual approval is a distinct authenticated platform operator action.
export async function inspectReviewContent(_payload){return {state:'pending',reason:'内容安全检测尚未配置，等待平台人工审核'}}
export const reviewError=(status,message)=>{throw Object.assign(Error(message),{status})}
export async function reviewPurchase(db,store,subject,itemId){
 const o=(await db.query(`SELECT o.id,o.store_id,o.customer_subject,o.currency,o.payment_source,o.payment_status,o.fulfillment_status,o.total_cents,i.id AS item_id,i.product_id,i.product_name FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.store_id=$1 AND o.customer_subject=$2 AND i.id=$3 FOR UPDATE OF o`,[store,subject,itemId])).rows[0]
 if(!o)reviewError(404,'order_item_not_found')
 if(o.payment_source==='staging_simulated')return {eligible:false,reason:'模拟支付不能作为真实已购评价凭证',order:o}
 if(o.fulfillment_status!=='delivered'||o.payment_status!=='paid'||!o.product_id)return {eligible:false,reason:'仅本人已送达且具有可信支付确认的订单商品可评价',order:o}
 const proof=await verifiedReviewPayment(db,o)
 const eligible=proof.verified===true&&proof.orderId===o.id&&proof.storeId===store&&proof.customerSubject===subject&&String(proof.totalCents)===String(o.total_cents)&&proof.currency===o.currency&&typeof proof.receiptRef==='string'&&proof.receiptRef.length>0&&proof.receiptRef.length<=200
 return {eligible,reason:proof.reason||'可信支付证据不完整，暂不能评价',receiptRef:eligible?proof.receiptRef:null,order:o}
}
