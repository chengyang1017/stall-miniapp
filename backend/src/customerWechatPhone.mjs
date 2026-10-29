import {authenticate} from './auth.mjs'
import {legacyWechatApplication} from './wechatApplications.mjs'

// Only the authenticated user's account may be updated. The phone is obtained
// from WeChat's server, never from a number supplied by the mini program.
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
async function postJson(url,body){
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)})
 if(!response.ok)throw Error('wechat_unavailable')
 return response.json()
}
export async function customerWechatPhoneBindRoute(req,res,url,pool){
 if(url.pathname!=='/v1/customer/phone/wechat-bind'||req.method!=='POST')return false
 if(process.env.PAYMENT_DB_ENV!=='isolated-test'||process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED!=='true'||process.env.WECHAT_PHONE_BIND_ENABLED!=='true'){
  reply(res,404,{error:'not_enabled'});return true
 }
 const subject=await authenticate(pool,req)
 if(!subject){reply(res,401,{error:'unauthorized'});return true}
 let app
 try{app=legacyWechatApplication()}catch{reply(res,503,{error:'wechat_not_configured'});return true}
 let raw=''
 try{
  for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>512){reply(res,413,{error:'too_large'});return true}}
 }catch{reply(res,400,{error:'invalid_body'});return true}
 let payload
 try{payload=JSON.parse(raw)}catch{reply(res,400,{error:'invalid_json'});return true}
 const code=payload?.code
 if(typeof code!=='string'||! /^[a-zA-Z0-9_-]{8,256}$/.test(code)){
  reply(res,400,{error:'invalid_wechat_phone_code'});return true
 }
 let phone
 try{
  const credentials=new URLSearchParams({grant_type:'client_credential',appid:app.appId,secret:app.secret})
  const tokenResult=await fetch('https://api.weixin.qq.com/cgi-bin/token?'+credentials.toString(),{signal:AbortSignal.timeout(8000)})
  if(!tokenResult.ok)throw Error('wechat_unavailable')
  const access=await tokenResult.json()
  if(typeof access.access_token!=='string'||!access.access_token)throw Error('wechat_access_token_unavailable')
  const result=await postJson('https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token='+encodeURIComponent(access.access_token),{code})
  phone=result?.phone_info
  if(result.errcode!==0||!phone||String(phone.countryCode)!=='86'||typeof phone.purePhoneNumber!=='string'||!/^1[3-9][0-9]{9}$/.test(phone.purePhoneNumber))throw Error('phone_verification_failed')
 }catch{
  reply(res,502,{error:'wechat_phone_verification_failed'});return true
 }
 const number='+86'+phone.purePhoneNumber
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  const found=await client.query("SELECT a.id FROM customer_accounts a JOIN customer_login_identities i ON i.account_id=a.id WHERE i.provider='wechat' AND i.provider_subject=$1 FOR UPDATE OF a",[subject])
  if(!found.rows.length){await client.query('ROLLBACK');reply(res,404,{error:'profile_not_found'});return true}
  const accountId=found.rows[0].id
  const owned=await client.query('SELECT account_id FROM customer_verified_phones WHERE phone_e164=$1',[number])
  if(owned.rows.some(r=>r.account_id!==accountId)){await client.query('ROLLBACK');reply(res,409,{error:'phone_already_bound'});return true}
  await client.query('INSERT INTO customer_verified_phones(account_id,phone_e164,verified_at) VALUES ($1,$2,now()) ON CONFLICT (account_id) DO UPDATE SET phone_e164=EXCLUDED.phone_e164,verified_at=EXCLUDED.verified_at',[accountId,number])
  await client.query('COMMIT')
  reply(res,200,{bound:true,maskedPhone:'+86*******'+number.slice(-4)})
 }catch(e){
  try{await client.query('ROLLBACK')}catch{}
  reply(res,e?.code==='23505'?409:503,{error:e?.code==='23505'?'phone_already_bound':'phone_bind_unavailable'})
 }finally{client.release()}
 return true
}
