import { authenticate,permittedStore } from './auth.mjs'
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
const reply=(res,status,body)=>{res.writeHead(status,headers);res.end(JSON.stringify(body))}
const fail=(message,status=503)=>{throw Object.assign(Error(message),{status})}
const attempts=new Map()
let tokenCache=null,tokenPending=null
async function wechatToken(){
 const appid=process.env.WX_APPID,secret=process.env.WX_APPSECRET
 if(!appid||!secret)fail('wechat_code_not_configured')
 if(tokenCache?.appid===appid&&tokenCache.secret===secret&&tokenCache.until>Date.now())return tokenCache.token
 if(tokenPending)return tokenPending
 tokenPending=(async()=>{
  const r=await fetch('https://api.weixin.qq.com/cgi-bin/stable_token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({grant_type:'client_credential',appid,secret,force_refresh:false}),signal:AbortSignal.timeout(7000)})
  if(!r.ok)fail('wechat_token_unavailable',502)
  const b=await r.json()
  if(typeof b.access_token!=='string'||!Number.isFinite(b.expires_in)||b.expires_in<=120)fail('wechat_token_rejected_check_platform',502)
  tokenCache={appid,secret,token:b.access_token,until:Date.now()+(Math.min(b.expires_in,7200)-120)*1000}
  return tokenCache.token
 })()
 try{return await tokenPending}finally{tokenPending=null}
}
async function officialCode(store,retry=true){
 const token=await wechatToken()
 // Only public store ID; no login token, API URL, customer or merchant identity in scene.
 const r=await fetch('https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token='+encodeURIComponent(token),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scene:store.id.replace(/-/g,''),page:'pages/index/index',check_path:true,env_version:'release',width:430}),signal:AbortSignal.timeout(10000)})
 if(!r.ok)fail('wechat_code_unavailable',502)
 const chunks=[];let length=0
 for await(const chunk of r.body){length+=chunk.length;if(length>524288)fail('wechat_code_response_too_large',502);chunks.push(chunk)}
 const image=Buffer.concat(chunks)
 if(image.length>=8&&image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return image
 let errorCode=0
 try{errorCode=JSON.parse(image.toString('utf8')).errcode}catch{}
 if(retry&&[40001,40014,42001].includes(errorCode)){tokenCache=null;return officialCode(store,false)}
 fail('wechat_code_rejected_check_appid_release_page_and_ip',502)
}
export async function storeEntryRoute(req,res,url,pool){
 const pub=/^\/v1\/store-entry\/(store|scene)\/([a-z0-9][a-z0-9-]{1,62})$/.exec(url.pathname)
 const merchant=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/store-code$/.exec(url.pathname)
 if(!pub&&!merchant)return false
 let db
 try{
  if(url.search)fail('invalid_query',400)
  if(pub){
   if(req.method!=='GET')fail('method_not_allowed',405)
   const code=pub[2],hex=pub[1]==='scene'
   if(hex&&!/^[0-9a-f]{32}$/.test(code))fail('invalid_scene',400)
   const id=hex?code.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5'):null
   const store=(await pool.query('SELECT slug AS "storeSlug",name AS "storeName",time_zone AS "timeZone" FROM stores WHERE is_active=true AND '+(hex?'id=$1::uuid':'slug=$1'),[id||code])).rows[0]
   if(!store)fail('store_not_available',404)
   reply(res,200,store);return true
  }
  if(!['GET','POST'].includes(req.method))fail('method_not_allowed',405)
  const subject=await authenticate(pool,req);if(!subject)fail('login_required',401)
  const store=await permittedStore(pool,subject,merchant[1]);if(!store||!['owner','manager'].includes(store.role))fail('forbidden',403)
  const appid=process.env.WX_APPID
  if(req.method==='POST'){
   let raw='';for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>128)fail('too_large',413)}
   let body;try{body=JSON.parse(raw)}catch{fail('invalid_body',400)}
   if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>k!=='expectedAppId')||typeof body.expectedAppId!=='string'||body.expectedAppId.length>64)fail('invalid_body',400)
   if(!appid||!process.env.WX_APPSECRET)fail('wechat_code_not_configured')
   if(body.expectedAppId!==appid)fail('miniapp_appid_mismatch',409)
  }
  db=await pool.connect();await db.query('BEGIN')
  // Serialize generation/cache per store, including the first request across processes.
  const row=(await db.query('SELECT id,is_active FROM stores WHERE id=$1 FOR NO KEY UPDATE',[store.id])).rows[0]
  if(!row?.is_active)fail('enable_store_before_generating_code',409)
  let code=(await db.query('SELECT png_bytes,created_at FROM store_miniapp_codes WHERE store_id=$1 AND app_id=$2',[store.id,appid||''])).rows[0]
  if(!code&&req.method==='POST'){
   const now=Date.now();for(const [key,at] of attempts)if(now-at>=60000)attempts.delete(key)
   if(attempts.has(store.id)||attempts.size>=1000)fail('store_code_rate_limited',429)
   attempts.set(store.id,now)
   const image=await officialCode(store)
   code=(await db.query('INSERT INTO store_miniapp_codes(store_id,app_id,png_bytes,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(store_id) DO UPDATE SET app_id=excluded.app_id,png_bytes=excluded.png_bytes,created_by=excluded.created_by,created_at=clock_timestamp() RETURNING png_bytes,created_at',[store.id,appid,image,subject])).rows[0]
  }
  await db.query('COMMIT')
  reply(res,200,{storeName:store.name,storeSlug:store.slug,appId:appid||null,configured:!!appid&&!!process.env.WX_APPSECRET,code:code?{imageBase64:code.png_bytes.toString('base64'),createdAt:code.created_at,environment:'release'}:null})
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});reply(res,e.status||503,{error:e.status?e.message:'store_code_unavailable'})}finally{db?.release()}
 return true
}
