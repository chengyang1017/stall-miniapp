import {authenticateCustomerAccountSession} from './customerAccountSessions.mjs'
import {customerAddressRoute} from './customerAddresses.mjs'

const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
const enabled=()=>process.env.PAYMENT_DB_ENV==='isolated-test'&&process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED==='true'&&process.env.CUSTOMER_PHONE_SESSION_ENABLED==='true'&&process.env.CUSTOMER_PHONE_ADDRESS_WRITE_ENABLED==='true'
const slug=/^[a-z0-9][a-z0-9-]{1,62}$/
const uuid=/^[0-9a-f-]{36}$/i

// Stage-only opt-in; reuse the exact validated, transactional address mutations.
// A permanent account with multiple WeChat identities must be resolved manually,
// not picked arbitrarily. All legacy store scoping/version checks are preserved.
export async function customerAccountAddressWriteRoute(req,res,url,pool){
 const match=/^\/v1\/customer\/account\/stores\/([^/]+)\/addresses(?:\/([^/]+))?$/.exec(url.pathname)
 if(!match)return false
 if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return false
 if(!enabled()){reply(res,404,{error:'not_enabled'});return true}
 if(!slug.test(match[1])||(match[2]&&!uuid.test(match[2]))||url.search){reply(res,400,{error:'invalid_query'});return true}
 if((req.method==='POST'&&match[2])||(req.method!=='POST'&&!match[2])){reply(res,405,{error:'method_not_allowed'});return true}
 const accountId=await authenticateCustomerAccountSession(pool,req)
 if(!accountId){reply(res,401,{error:'unauthorized'});return true}
 const identities=await pool.query("SELECT provider_subject FROM customer_login_identities WHERE account_id=$1 AND provider='wechat' LIMIT 2",[accountId])
 if(identities.rows.length!==1){reply(res,409,{error:identities.rows.length?'multiple_identities_require_review':'linked_wechat_identity_required'});return true}
 const subject=identities.rows[0].provider_subject
 if(typeof subject!=='string'||!/^wx:wx[a-f0-9]{16}:[A-Za-z0-9_-]{1,128}$/.test(subject)){reply(res,409,{error:'invalid_linked_identity'});return true}
 const legacyUrl=new URL(url)
 legacyUrl.pathname='/v1/stores/'+match[1]+'/addresses'+(match[2]?'/'+match[2]:'')
 // The WeChat request API supports PUT, not PATCH. Convert only after authentication.
 if(req.method==='PUT')req.method='PATCH'
 return customerAddressRoute(req,res,legacyUrl,pool,subject)
}
