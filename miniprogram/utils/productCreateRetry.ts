import { sessionScope } from '../modules/shared/runtime/sessionScope'
import { cloudIdentity as supportIdentity } from '../modules/shared/runtime/context'
import { authorizedMutation } from '../modules/merchant/api/mutation'
type Config={apiBase:string;storeSlug:string}
type Pending={key:string;payload:Record<string,any>}
function storageKey(cfg:Config,intent:string){return 'stall_product_create_retry_v1:'+JSON.stringify([cfg.apiBase,cfg.storeSlug,sessionScope(),intent])}
export function pendingProductCreate(cfg:Config,intent:string):Pending|null{
  const row=wx.getStorageSync(storageKey(cfg,intent)) as Pending
  return row&&typeof row.key==='string'&&row.payload&&typeof row.payload==='object'?row:null
}
export function clearProductCreate(cfg:Config,intent:string){wx.removeStorageSync(storageKey(cfg,intent))}
export async function createProductWithRetry(cfg:Config,intent:string,payload:Record<string,any>){
  const context=supportIdentity(),key=storageKey(cfg,intent)
  let pending=pendingProductCreate(cfg,intent)
  if(pending&&JSON.stringify(pending.payload)!==JSON.stringify(JSON.parse(JSON.stringify(payload))))throw Error('product_create_retry_content_changed')
  if(!pending){
    const clientKey='create_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)+'_'+Math.random().toString(36).slice(2)
    pending={key:clientKey,payload:JSON.parse(JSON.stringify(payload))}
    // Write before network; inability to retain the key must prevent a new request.
    wx.setStorageSync(key,pending)
  }
  const result=await authorizedMutation(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/products`,'POST',{...payload,clientKey:pending.key})
  if(context!==supportIdentity()||!result||typeof result.id!=='string'||!result.id)throw Error('unconfirmed_product_create')
  if((wx.getStorageSync(key) as Pending)?.key===pending.key)wx.removeStorageSync(key)
  return result
}
