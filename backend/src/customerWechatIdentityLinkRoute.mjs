import {authenticate} from './auth.mjs'
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
const enabled=()=>process.env.PAYMENT_DB_ENV==='isolated-test'&&process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED==='true'&&process.env.CUSTOMER_WECHAT_LINK_ENABLED==='true'

// A valid session proves ownership only of the account resolved on the server.
// Never accept an account ID, verification boolean, or identity from request JSON.
export async function customerWechatIdentityLinkRoute(req,res,url,pool,{authenticateSession=authenticate}={}){
 if(url.pathname!=='/v1/customer/identity/wechat-link'||req.method!=='POST')return false
 if(!enabled()){reply(res,404,{error:'not_enabled'});return true}
 const subject=await authenticateSession(pool,req)
 if(!subject){reply(res,401,{error:'unauthorized'});return true}
 const current=await pool.query("SELECT a.id FROM customer_accounts a JOIN customer_login_identities i ON i.account_id=a.id WHERE i.provider='wechat' AND i.provider_subject=$1",[subject])
 // This route is not available to existing WeChat sessions: their identity is
 // already linked. Phone sessions need separate secure session-account mapping.
 // Intentionally deny requests until a verified phone session is supported.
 if(current.rows.length){reply(res,409,{error:'already_wechat_linked'});return true}
 reply(res,403,{error:'phone_session_not_supported_yet'})
 return true
}
