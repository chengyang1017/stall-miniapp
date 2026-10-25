// Server-only credential boundary. Current login remains pinned to the legacy app.
// Never expose these objects, raw configuration or secrets in client responses/logs.
export function legacyWechatApplication(env=process.env){
 const appId=env.WX_APPID,secret=env.WX_APPSECRET
 if(!appId||!secret)throw Error('wechat_not_configured')
 return {appId,secret}
}
// Preparation-only parser for a future operator-controlled registry. The HTTP login
// route DOES NOT consume this registry or accept an application/role selector yet.
export function parseTrustedWechatApplications(raw){
 let value
 try{value=JSON.parse(raw)}catch{throw Error('invalid_trusted_wechat_apps')}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>10)throw Error('invalid_trusted_wechat_apps')
 const applications=new Map(),ids=new Set()
 for(const [alias,entry] of Object.entries(value)){
  if(!/^[a-z][a-z0-9_-]{0,31}$/.test(alias)||!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(k=>!['appId','secret'].includes(k))||typeof entry.appId!=='string'||!/^wx[a-f0-9]{16}$/.test(entry.appId)||typeof entry.secret!=='string'||!/^[A-Za-z0-9_-]{16,256}$/.test(entry.secret)||ids.has(entry.appId))throw Error('invalid_trusted_wechat_apps')
  ids.add(entry.appId);applications.set(alias,Object.freeze({appId:entry.appId,secret:entry.secret}))
 }
 return applications
}
