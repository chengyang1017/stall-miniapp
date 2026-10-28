import { registerSessionCacheReset } from '../../shared/runtime/sessionLifecycle'
import type { SavedAddress } from '../domain/address'
import { getCloudContext, getSessionToken } from '../../shared/runtime/context'
import { authorizedGet } from '../../shared/runtime/auth'
import { cloudIdentity as supportIdentity } from '../../shared/runtime/context'
let identity='',rows:SavedAddress[]=[],selected='',requestSerial=0
function sync(){const key=supportIdentity();if(key!==identity){identity=key;rows=[];selected='';requestSerial++}}
export function cachedCloudAddresses():SavedAddress[]{sync();return rows.map(a=>({...a}))}
export function selectedCloudAddress():SavedAddress|undefined{sync();return rows.find(a=>a.id===selected)||rows.find(a=>a.isDefault)||rows[0]}
export function selectCloudAddress(id:string){sync();if(rows.some(a=>a.id===id))selected=id}
export function clearCloudAddressCache(){identity='';rows=[];selected='';requestSerial++}
registerSessionCacheReset(clearCloudAddressCache)
export async function refreshCloudAddresses():Promise<SavedAddress[]>{
 sync();const cfg=getCloudContext(),key=identity,serial=++requestSerial;if(!cfg)throw Error('cloud_not_configured')
 const r=await authorizedGet(cfg.apiBase,`/v1/stores/${cfg.storeSlug}/addresses`)
 if(key!==supportIdentity()){sync();throw Error('identity_changed')}
 if(serial!==requestSerial)return cachedCloudAddresses()
 if(!r||!Array.isArray(r.addresses)||r.addresses.length>50)throw Error('invalid_address_response')
 rows=r.addresses.map((a:any)=>({...a,deliveryStoreKey:cfg.apiBase+'/'+cfg.storeSlug}));if(selected&&!rows.some(a=>a.id===selected))selected=''
 return cachedCloudAddresses()
}
export async function writeCloudAddress(method:'POST'|'PATCH'|'DELETE',id:string,body:Record<string,any>):Promise<void>{
 sync();requestSerial++;const cfg=getCloudContext(),token=getSessionToken(),key=identity;if(!cfg||!token)throw Error('not_logged_in')
 if(id&&!/^[0-9a-f-]{36}$/.test(id))throw Error('invalid_address')
 const r:any=await new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+`/v1/stores/${cfg.storeSlug}/addresses`+(id?'/'+id:''),method:method as WechatMiniprogram.RequestOption['method'],data:body,timeout:15000,header:{Authorization:`Bearer ${token}`,'content-type':'application/json'},success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error(`http_${r.statusCode}_${r.data && r.data.error || ''}`)),fail:reject}))
 if(key!==supportIdentity()){sync();throw Error('identity_changed')}
 if(!r||r.ok!==true)throw Error('address_save_unconfirmed')
 // Acknowledgement is separate from one optional list refresh owned by the page.
}
