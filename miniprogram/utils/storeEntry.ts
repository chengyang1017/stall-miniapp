import { PUBLIC_API_BASE,DEFAULT_STORE_SLUG,CLOUD_ONLY } from '../config/cloud'
import { getCloudContext } from '../modules/shared/runtime/context'
import { localDevAllowed } from '../modules/shared/runtime/auth'
let pending:{kind:'store'|'scene';value:string}|null=null
let generation=0
export function captureStoreEntry(query:Record<string,string|undefined>={}){
 const kind=query.scene?'scene':query.store?'store':null
 if(!kind)return
 let value=String(query[kind]||'')
 try{value=decodeURIComponent(value)}catch{value='invalid!'}
 if(!pending||pending.kind!==kind||pending.value!==value){pending={kind,value};generation++}
}
export async function resolveStoreEntry():Promise<void>{
 const current=getCloudContext()
 if(!pending&&CLOUD_ONLY){pending={kind:'store',value:current?.storeSlug||DEFAULT_STORE_SLUG};generation++}
 if(!pending&&!current&&DEFAULT_STORE_SLUG){pending={kind:'store',value:DEFAULT_STORE_SLUG};generation++}
 if(!pending)return
 const entry=pending,serial=generation
 if(!(entry.kind==='scene'?/^[a-f0-9]{32}$/:/^[a-z0-9][a-z0-9-]{1,62}$/).test(entry.value))throw Error('店铺入口参数无效，请联系商家重新分享')
 const apiBase=(PUBLIC_API_BASE||current?.apiBase||'').trim().replace(/\/+$/,'')
 if(!/^https:\/\/[^\s/]+/.test(apiBase)&&!localDevAllowed(apiBase))throw Error('尚未配置可信云端API，暂不能打开此店铺，请联系商家')
 const result:any=await new Promise((resolve,reject)=>wx.request({url:apiBase+'/v1/store-entry/'+entry.kind+'/'+entry.value,method:'GET',timeout:15000,success:r=>r.statusCode===200?resolve(r.data):reject(Error('店铺不可用或网络异常，请重试')),fail:()=>reject(Error('店铺读取失败，请检查网络后重试'))}))
 if(serial!==generation)throw Error('店铺入口已变化，请重新打开')
 if(!result||typeof result.storeSlug!=='string'||!/^[a-z0-9][a-z0-9-]{1,62}$/.test(result.storeSlug)||typeof result.storeName!=='string')throw Error('店铺资料无效')
 if(current&&current.apiBase!==apiBase){wx.removeStorageSync('stall_server_session_v1');wx.removeStorageSync('stall_server_cache_scope_v1')}
 wx.setStorageSync('stall_cloud_catalog_config_v1',{apiBase,storeSlug:result.storeSlug})
 pending=null
}
export function shopShare(name:string){const c=getCloudContext();return {title:name||'店铺商品',path:c?'/pages/index/index?store='+encodeURIComponent(c.storeSlug):'/pages/index/index'}}
