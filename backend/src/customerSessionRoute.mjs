import {authenticateCustomerAccountSession,revokeCustomerAccountSession} from './customerAccountSessions.mjs'
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
export async function customerSessionRoute(req,res,url,pool){
 if(url.pathname!=='/v1/customer/auth/session'||!['GET','DELETE'].includes(req.method))return false
 if(process.env.PAYMENT_DB_ENV!=='isolated-test'||process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED!=='true'||process.env.CUSTOMER_PHONE_SESSION_ENABLED!=='true'){
  reply(res,404,{error:'not_enabled'});return true
 }
 const accountId=await authenticateCustomerAccountSession(pool,req)
 if(!accountId){reply(res,401,{error:'unauthorized'});return true}
 if(req.method==='DELETE'){
  await revokeCustomerAccountSession(pool,req)
  reply(res,200,{ok:true});return true
 }
 const result=await pool.query(`SELECT a.id,a.nickname,a.avatar_style, p.phone_e164 IS NOT NULL AS phone_bound,\n CASE WHEN p.phone_e164 IS NOT NULL THEN '+86*******'||right(p.phone_e164,4) ELSE NULL END AS masked_phone\n FROM customer_accounts a LEFT JOIN customer_verified_phones p ON p.account_id=a.id WHERE a.id=$1`,[accountId])
 if(result.rows.length!==1){reply(res,401,{error:'unauthorized'});return true}
 reply(res,200,{accountId:result.rows[0].id,nickname:result.rows[0].nickname,avatarStyle:result.rows[0].avatar_style,phoneBound:result.rows[0].phone_bound,maskedPhone:result.rows[0].masked_phone})
 return true
}
