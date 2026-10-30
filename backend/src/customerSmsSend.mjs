// Disabled until a trusted server-owned SMS provider adapter is wired.
// A request cannot provide its own sender, IP, or readiness claim.
import {issueCustomerSmsChallenge} from './customerSmsIssue.mjs'
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body))}
export async function customerSmsSendRoute(req,res,url,pool,{send=null,issue=issueCustomerSmsChallenge}={}){
 if(url.pathname!=='/v1/customer/auth/sms/send'||req.method!=='POST')return false
 const secret=process.env.CUSTOMER_SMS_HMAC_SECRET
 if(process.env.PAYMENT_DB_ENV!=='isolated-test'||process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED!=='true'||process.env.CUSTOMER_PHONE_SESSION_ENABLED!=='true'||process.env.CUSTOMER_SMS_PROVIDER_READY!=='true'||process.env.CUSTOMER_SMS_LOGIN_ENABLED!=='true'||typeof secret!=='string'||secret.length<32||typeof send!=='function'){
  reply(res,404,{error:'not_enabled'});return true
 }
 let raw=''
 try{for await(const part of req){raw+=part.toString('utf8');if(Buffer.byteLength(raw)>256){reply(res,413,{error:'too_large'});return true}}}catch{reply(res,400,{error:'invalid_body'});return true}
 let body
 try{body=JSON.parse(raw)}catch{reply(res,400,{error:'invalid_json'});return true}
 if(!body||typeof body.phone!=='string'||!/^\+861[3-9][0-9]{9}$/.test(body.phone)||Object.keys(body).some(k=>k!=='phone')){reply(res,400,{error:'invalid_phone'});return true}
 // socket.remoteAddress is supplied by the HTTP server, NOT forwarded headers.
 const remoteIp=req.socket?.remoteAddress
 if(typeof remoteIp!=='string'){reply(res,503,{error:'sms_send_unavailable'});return true}
 try{
  const result=await issue(pool,{phone:body.phone,remoteIp,secret,send})
  if(!result.accepted){reply(res,429,{error:'try_later'});return true}
  reply(res,200,{ok:true})
 }catch{reply(res,503,{error:'sms_send_unavailable'})}
 return true
}
