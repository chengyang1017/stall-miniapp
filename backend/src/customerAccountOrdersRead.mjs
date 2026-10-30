import {authenticateCustomerAccountSession} from './customerAccountSessions.mjs'
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
const slug=/^[a-z0-9][a-z0-9-]{1,62}$/
export async function customerAccountOrdersReadRoute(req,res,url,pool){
 const match=/^\/v1\/customer\/account\/stores\/([^/]+)\/orders$/.exec(url.pathname)
 if(!match)return false
 if(process.env.PAYMENT_DB_ENV!=='isolated-test'||process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED!=='true'||process.env.CUSTOMER_PHONE_SESSION_ENABLED!=='true'){reply(res,404,{error:'not_enabled'});return true}
 if(req.method!=='GET'){reply(res,405,{error:'method_not_allowed'});return true}
 if(!slug.test(match[1])||url.search){reply(res,400,{error:'invalid_query'});return true}
 const accountId=await authenticateCustomerAccountSession(pool,req)
 if(!accountId){reply(res,401,{error:'unauthorized'});return true}
 // The permanent account must own the verified historical WeChat subject.
 // Never infer order ownership from a phone number or user-supplied subject.
 const result=await pool.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",
 o.payment_source AS "paymentSource",o.fulfillment_status AS "fulfillmentStatus",
 o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt",
 o.estimated_arrival AS "estimatedArrival",o.issue_reason AS "issueReason"
 FROM orders o JOIN stores s ON s.id=o.store_id
 JOIN customer_login_identities i ON i.provider='wechat'
   AND i.provider_subject=o.customer_subject AND i.account_id=$1
 WHERE s.slug=$2 ORDER BY o.created_at DESC,o.id DESC LIMIT 51`,[accountId,match[1]])
 reply(res,200,{orders:result.rows.slice(0,50),hasMore:result.rows.length>50})
 return true
}
