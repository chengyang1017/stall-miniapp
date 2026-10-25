import { getCloudContext,getSessionToken } from '../runtime/context'
import { authorizedGet } from '../runtime/auth'
export function supportPath(merchant:boolean,tail:string):string {
 const c=getCloudContext();if(!c)throw Error('cloud_not_configured')
 return `/v1/${merchant?'merchant/':''}stores/${c.storeSlug}/support/${tail}`
}
export function supportGet(merchant:boolean,tail:string,query?:Record<string,string|number>):Promise<any>{
 const c=getCloudContext();if(!c)return Promise.reject(Error('cloud_not_configured'));return authorizedGet(c.apiBase,supportPath(merchant,tail),query)
}
export function supportPost(merchant:boolean,tail:string,data:Record<string,string>):Promise<any>{
 const c=getCloudContext(),token=getSessionToken();if(!c||!token)return Promise.reject(Error('not_logged_in'))
 const path=supportPath(merchant,tail)
 return new Promise((resolve,reject)=>wx.request({url:c.apiBase+path,method:'POST',data,timeout:15000,header:{Authorization:`Bearer ${token}`,'content-type':'application/json'},success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error(`http_${r.statusCode}_${r.data&&r.data.error||''}`)),fail:reject}))
}
