// Independent SMS OTP login is disabled until a real provider, issuance quotas,
// and approved deployment are configured. No client proof flags are accepted.
import {consumeCustomerSmsChallenge} from './customerSmsChallenge.mjs'
import {resolveExistingVerifiedPhoneAccount} from './customerPhoneAccountLookup.mjs'
import {createCustomerAccountSession} from './customerAccountSessions.mjs'
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body))}
export async function customerSmsLoginRoute(req,res,url,pool,{consume=consumeCustomerSmsChallenge,lookup=resolveExistingVerifiedPhoneAccount,createSession=createCustomerAccountSession}={}){
 if(url.pathname!=='/v1/customer/auth/sms'||req.method!=='POST')return false
 // This gate intentionally requires a future audited provider issuance pipeline.
 if(process.env.PAYMENT_DB_ENV!=='isolated-test'||process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED!=='true'||process.env.CUSTOMER_PHONE_SESSION_ENABLED!=='true'||process.env.CUSTOMER_SMS_PROVIDER_READY!=='true'||process.env.CUSTOMER_SMS_LOGIN_ENABLED!=='true'||typeof process.env.CUSTOMER_SMS_HMAC_SECRET!=='string'||process.env.CUSTOMER_SMS_HMAC_SECRET.length<32){
  reply(res,404,{error:'not_enabled'});return true
 }
 let raw=''
 try{for await(const part of req){raw+=part.toString('utf8');if(Buffer.byteLength(raw)>512){reply(res,413,{error:'too_large'});return true}}}catch{reply(res,400,{error:'invalid_body'});return true}
 let body
 try{body=JSON.parse(raw)}catch{reply(res,400,{error:'invalid_json'});return true}
 if(!body||typeof body.phone!=='string'||!/^\+861[3-9][0-9]{9}$/.test(body.phone)||typeof body.code!=='string'||!/^[0-9]{6}$/.test(body.code)){
  reply(res,400,{error:'invalid_credentials'});return true
 }
 try{
  const verified=await consume(pool,{phone:body.phone,code:body.code,secret:process.env.CUSTOMER_SMS_HMAC_SECRET})
  if(!verified){reply(res,401,{error:'invalid_credentials'});return true}
  const accountId=await lookup(pool,{phone:body.phone,verifiedByServer:true})
  // Never create or merge an account by phone number.
  if(!accountId){reply(res,401,{error:'invalid_credentials'});return true}
  const session=await createSession(pool,{accountId,verifiedLogin:true})
  reply(res,200,session)
 }catch{reply(res,503,{error:'sms_login_unavailable'})}
 return true
}
