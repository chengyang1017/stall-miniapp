export const reviewPolicy=Object.freeze({editWindowDays:7,maxCustomerEdits:1,maxImages:3,maxImageBytes:5*1024*1024,maxText:500,maxPage:20,maxRevisionsPerDay:20,unboundImageDays:7})
// Integration boundary owned by the customer's payment module. A database 'paid'
// label/payment_events row alone is not verified receipt. Never enable via a flag.
export async function verifiedReviewPayment(_db,_order){return {verified:false,reason:'可信支付核验尚未接入，暂不能发表评价'}}
// Optional text/image safety adapter. No configured scanner means pending, never
// approval. Manual approval is a distinct authenticated platform operator action.
export async function inspectReviewContent(_payload){return {state:'pending',reason:'内容安全检测尚未配置，等待平台人工审核'}}
export const reviewError=(status,message)=>{throw Object.assign(Error(message),{status})}
export async function reviewPurchase(db,store,subject,itemId){
 const o=(await db.query(`SELECT o.id,o.store_id,o.customer_subject,o.currency,o.payment_status,o.fulfillment_status,o.total_cents,i.id AS item_id,i.product_id,i.product_name FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.store_id=$1 AND o.customer_subject=$2 AND i.id=$3 FOR UPDATE OF o`,[store,subject,itemId])).rows[0]
 if(!o)reviewError(404,'order_item_not_found')
 if(o.fulfillment_status!=='delivered'||o.payment_status!=='paid'||!o.product_id)return {eligible:false,reason:'仅本人已送达且具有可信支付确认的订单商品可评价',order:o}
 const proof=await verifiedReviewPayment(db,o)
 const eligible=proof.verified===true&&proof.orderId===o.id&&proof.storeId===store&&proof.customerSubject===subject&&String(proof.totalCents)===String(o.total_cents)&&proof.currency===o.currency&&typeof proof.receiptRef==='string'&&proof.receiptRef.length>0&&proof.receiptRef.length<=200
 return {eligible,reason:proof.reason||'可信支付证据不完整，暂不能评价',receiptRef:eligible?proof.receiptRef:null,order:o}
}
