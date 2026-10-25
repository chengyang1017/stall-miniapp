import { getCloudContext, getSessionToken } from '../modules/shared/runtime/context'
import { authorizedGet } from '../modules/shared/runtime/auth'
import { cloudIdentity as supportIdentity } from '../modules/shared/runtime/context'
export async function readCloudCategories():Promise<any>{const c=getCloudContext();if(!c)throw Error('not_configured');return authorizedGet(c.apiBase,`/v1/merchant/stores/${c.storeSlug}/categories`)}
export async function writeCloudCategories(method:'POST'|'PATCH'|'DELETE',id:string,body:Record<string,any>):Promise<any>{
 const c=getCloudContext(),token=getSessionToken(),identity=supportIdentity();if(!c||!token)throw Error('not_logged_in')
 const r:any=await new Promise((resolve,reject)=>wx.request({url:c.apiBase+`/v1/merchant/stores/${c.storeSlug}/categories`+(id?'/'+id:''),method:method as WechatMiniprogram.RequestOption['method'],data:body,timeout:15000,header:{Authorization:`Bearer ${token}`,'content-type':'application/json'},success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error(`http_${r.statusCode}_${r.data?.error||''}`)),fail:reject}))
 if(identity!==supportIdentity()||!r||r.ok!==true)throw Error('category_write_unconfirmed');return r
}
