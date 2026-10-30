import {authenticateCustomerAccountSession} from './customerAccountSessions.mjs'
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
const slug=/^[a-z0-9][a-z0-9-]{1,62}$/
export async function customerAccountOrdersReadRoute(req,res,url,pool){
 const match=/^\/v1\/customer\/account\/stores\/([^/]+)\/orders(?:\/([0-9a-fA-F-]{36}))?$/.exec(url.pathname)
 if(!match)return false
 if(process.env.PAYMENT_DB_ENV!=='isolated-test'||process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED!=='true'||process.env.CUSTOMER_PHONE_SESSION_ENABLED!=='true'){reply(res,404,{error:'not_enabled'});return true}
 if(req.method!=='GET'){reply(res,405,{error:'method_not_allowed'});return true}
 if(!slug.test(match[1])){reply(res,400,{error:'invalid_query'});return true}
 const offsetText=url.searchParams.get('offset')||'0'
 if((match[2]&&url.search)||(!match[2]&&(Array.from(url.searchParams.keys()).some(k=>k!=='offset')||!/^(0|[1-9][0-9]{0,3})$/.test(offsetText)||Number(offsetText)>1000))){reply(res,400,{error:'invalid_query'});return true}
 const accountId=await authenticateCustomerAccountSession(pool,req)
 if(!accountId){reply(res,401,{error:'unauthorized'});return true}
 // The permanent account must own the verified historical WeChat subject.
 // Never infer order ownership from a phone number or user-supplied subject.
 if(match[2]){
  const found=await pool.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.payment_source AS "paymentSource",o.fulfillment_status AS "fulfillmentStatus",o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt",o.estimated_arrival AS "estimatedArrival",o.issue_reason AS "issueReason",o.contact_snapshot AS "contactSnapshot",o.delivery_slot_snapshot AS "deliverySlotSnapshot"
  FROM orders o JOIN stores s ON s.id=o.store_id JOIN customer_login_identities i ON i.provider='wechat' AND i.provider_subject=o.customer_subject AND i.account_id=$1
  WHERE s.slug=$2 AND o.id=$3`,[accountId,match[1],match[2]])
  if(!found.rows.length){reply(res,404,{error:'not_found'});return true}
  const items=await pool.query('SELECT oi.id AS "orderItemId",oi.product_id AS "productId",oi.product_name AS "name",oi.unit_price_cents AS "unitPriceCents",oi.quantity,oi.line_total_cents AS "lineTotalCents" FROM order_items oi WHERE oi.order_id=$1 ORDER BY oi.id',[found.rows[0].id])
  reply(res,200,{order:found.rows[0],items:items.rows});return true
 }
 const result=await pool.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",
 o.payment_source AS "paymentSource",o.fulfillment_status AS "fulfillmentStatus",
 o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt",
 o.estimated_arrival AS "estimatedArrival",o.issue_reason AS "issueReason"
 FROM orders o JOIN stores s ON s.id=o.store_id
 JOIN customer_login_identities i ON i.provider='wechat'
   AND i.provider_subject=o.customer_subject AND i.account_id=$1
 WHERE s.slug=$2 ORDER BY o.created_at DESC,o.id DESC LIMIT 51 OFFSET $3`,[accountId,match[1],Number(offsetText)])
 reply(res,200,{orders:result.rows.slice(0,50),hasMore:result.rows.length>50,nextOffset:result.rows.length>50?Number(offsetText)+50:null})
 return true
}
