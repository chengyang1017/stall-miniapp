import {authenticate} from './auth.mjs'
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body))}
const enabled=()=>process.env.PAYMENT_DB_ENV==='isolated-test'&&process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED==='true'
// Staging-only authenticated identity snapshot; never returns an unmasked phone,
// account tokens or any merchant privileges. No new login/session is issued.
export async function customerAccountSnapshotRoute(req,res,url,pool,{authenticateSession=authenticate}={}){
 if(url.pathname!=='/v1/customer/account'||req.method!=='GET')return false
 if(!enabled()){reply(res,404,{error:'not_enabled'});return true}
 const subject=await authenticateSession(pool,req)
 if(typeof subject!=='string'||!/^wx:wx[a-f0-9]{16}:[A-Za-z0-9_-]{1,128}$/.test(subject)){
  reply(res,401,{error:'unauthorized'});return true
 }
 const result=await pool.query(`SELECT a.id,a.nickname,a.avatar_style,
  p.phone_e164 IS NOT NULL AS phone_bound,
  CASE WHEN p.phone_e164 IS NOT NULL THEN '+86*******'||right(p.phone_e164,4) ELSE NULL END AS masked_phone
  FROM customer_accounts a
  JOIN customer_login_identities i ON i.account_id=a.id
  LEFT JOIN customer_verified_phones p ON p.account_id=a.id
  WHERE i.provider='wechat' AND i.provider_subject=$1`,[subject])
 if(result.rows.length!==1){reply(res,404,{error:'account_not_found'});return true}
 const a=result.rows[0]
 reply(res,200,{accountId:a.id,nickname:a.nickname,avatarStyle:a.avatar_style,phoneBound:a.phone_bound,maskedPhone:a.masked_phone})
 return true
}
