import {authenticateCustomerAccountSession} from './customerAccountSessions.mjs'
const response=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
const enabled=()=>process.env.PAYMENT_DB_ENV==='isolated-test'&&process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED==='true'&&process.env.CUSTOMER_PHONE_SESSION_ENABLED==='true'
const slug=/^[a-z0-9][a-z0-9-]{1,62}$/
export async function customerAccountAddressReadRoute(req,res,url,pool){
 const match=/^\/v1\/customer\/account\/stores\/([^/]+)\/addresses$/.exec(url.pathname)
 if(!match)return false
 if(!enabled()){response(res,404,{error:'not_enabled'});return true}
 if(req.method!=='GET'){response(res,405,{error:'method_not_allowed'});return true}
 if(!slug.test(match[1])||url.search){response(res,400,{error:'invalid_query'});return true}
 const accountId=await authenticateCustomerAccountSession(pool,req)
 if(!accountId){response(res,401,{error:'unauthorized'});return true}
 // The provider_subject is an existing server-verified identity bound to this
 // permanent account, never supplied by the client or inferred from a phone.
 const result=await pool.query(`SELECT a.id,a.receiver_name AS "receiverName",a.phone,
 a.area_id AS "deliveryAreaId",a.area_name AS area,a.detail,
 a.is_default AS "isDefault",a.latitude,a.longitude,
 a.location_name AS "locationName",a.map_address AS "mapAddress",a.version
 FROM customer_addresses a
 JOIN stores s ON s.id=a.store_id
 JOIN customer_login_identities i ON i.provider='wechat'
  AND i.provider_subject=a.customer_subject AND i.account_id=$1
 WHERE s.slug=$2 AND a.deleted_at IS NULL
 ORDER BY a.is_default DESC,a.created_at,a.id LIMIT 51`,[accountId,match[1]])
 if(result.rows.length>50){response(res,413,{error:'address_limit'});return true}
 response(res,200,{addresses:result.rows})
 return true
}
