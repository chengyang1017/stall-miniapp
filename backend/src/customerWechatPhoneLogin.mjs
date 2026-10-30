// Staging-only login using a one-time official WeChat phone authorization code.
// Not SMS login; never grants merchant access or creates/merges customer accounts.
import {legacyWechatApplication} from './wechatApplications.mjs'
import {verifyWechatPhoneCode} from './customerWechatPhone.mjs'
import {resolveExistingVerifiedPhoneAccount} from './customerPhoneAccountLookup.mjs'
import {createCustomerAccountSession} from './customerAccountSessions.mjs'
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body))}
const enabled=()=>process.env.PAYMENT_DB_ENV==='isolated-test'&&process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED==='true'&&process.env.WECHAT_PHONE_BIND_ENABLED==='true'&&process.env.CUSTOMER_PHONE_SESSION_ENABLED==='true'
export async function customerWechatPhoneLoginRoute(req,res,url,pool,{verifyCode=verifyWechatPhoneCode,getApplication=legacyWechatApplication}={}){
 if(url.pathname!=='/v1/customer/auth/wechat-phone'||req.method!=='POST')return false
 if(!enabled()){reply(res,404,{error:'not_enabled'});return true}
 let raw=''
 try{for await(const part of req){raw+=part.toString('utf8');if(Buffer.byteLength(raw)>512){reply(res,413,{error:'too_large'});return true}}}
 catch{reply(res,400,{error:'invalid_body'});return true}
 let body
 try{body=JSON.parse(raw)}catch{reply(res,400,{error:'invalid_json'});return true}
 if(typeof body?.code!=='string'||! /^[A-Za-z0-9_-]{8,256}$/.test(body.code)){reply(res,400,{error:'invalid_phone_code'});return true}
 let app
 try{app=getApplication()}catch{reply(res,503,{error:'wechat_not_configured'});return true}
 let verifiedPhone
 try{verifiedPhone=await verifyCode(app,body.code)}catch{reply(res,401,{error:'phone_verification_failed'});return true}
 // Verification result must be returned by trusted server-side WeChat API, never client input.
 try{
  const accountId=await resolveExistingVerifiedPhoneAccount(pool,{phone:verifiedPhone,verifiedByServer:true})
  if(!accountId){reply(res,403,{error:'phone_not_linked'});return true}
  const session=await createCustomerAccountSession(pool,{accountId,verifiedLogin:true})
  reply(res,200,session)
 }catch{reply(res,503,{error:'customer_login_unavailable'})}
 return true
}
