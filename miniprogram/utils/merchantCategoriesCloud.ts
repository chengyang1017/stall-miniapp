import { getCloudContext, getSessionToken } from '../modules/shared/runtime/context'
import { registerSessionCacheReset } from '../modules/shared/runtime/sessionLifecycle'
import { authorizedGet } from '../modules/shared/runtime/auth'
import { cloudIdentity as supportIdentity } from '../modules/shared/runtime/context'
// Confirmed data only, in memory and scoped to one identity/API/store.
let generation=0
let reading:{identity:string;issued:number;promise:Promise<any>}|null=null
let confirmed:{identity:string;value:any}|null=null
registerSessionCacheReset(()=>{confirmed=null;reading=null;generation++})
export function cachedCloudCategories():any{if(confirmed?.identity!==supportIdentity()){confirmed=null;return null}return confirmed?JSON.parse(JSON.stringify(confirmed.value)):null}
function accept(value:any,identity:string,issued:number){
 if(!value||!Array.isArray(value.items)||typeof value.revision!=='string'||value.items.some((c:any)=>!c||typeof c.id!=='string'||typeof c.name!=='string')||new Set(value.items.map((c:any)=>c.id)).size!==value.items.length)throw Error('invalid_category_response')
 if(identity!==supportIdentity())throw Error('session_or_store_changed')
 if(issued===generation)confirmed={identity,value:JSON.parse(JSON.stringify(value))};return value
}
export function readCloudCategories():Promise<any>{
 const c=getCloudContext(),identity=supportIdentity();if(!c)return Promise.reject(Error('not_configured'))
 if(reading?.identity===identity&&reading.issued===generation)return reading.promise
 const issued=++generation
 const promise=authorizedGet(c.apiBase,`/v1/merchant/stores/${c.storeSlug}/categories`).then(r=>accept(r,identity,issued)).catch(e=>{if(identity===supportIdentity()&&issued===generation&&/http_40[13]/.test(String(e)))confirmed=null;throw e}).finally(()=>{if(reading?.promise===promise)reading=null})
 reading={identity,issued,promise};return promise
}
export async function writeCloudCategories(method:'POST'|'PATCH'|'DELETE',id:string,body:Record<string,any>):Promise<any>{
 const c=getCloudContext(),token=getSessionToken(),identity=supportIdentity(),issued=++generation;if(!c||!token)throw Error('not_logged_in')
 const r:any=await new Promise((resolve,reject)=>wx.request({url:c.apiBase+`/v1/merchant/stores/${c.storeSlug}/categories`+(id?'/'+id:''),method:method as WechatMiniprogram.RequestOption['method'],data:body,timeout:15000,header:{Authorization:`Bearer ${token}`,'content-type':'application/json'},success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error(`http_${r.statusCode}_${r.data?.error||''}`)),fail:reject}))
 if(identity!==supportIdentity()||!r||r.ok!==true)throw Error('category_write_unconfirmed');return accept(r,identity,issued)
}
