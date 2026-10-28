import { authorizedGet } from '../../shared/runtime/auth'
import { getCloudContext,getSessionToken } from '../../shared/runtime/context'
import type { CloudContext } from '../../shared/runtime/context'
import type { DeliveryConfig } from '../../shared/domain/delivery'
import { deliveryStoreKey } from '../../shared/domain/delivery'
export async function fetchMerchantDelivery(cfg:CloudContext):Promise<{config:DeliveryConfig;revision:string|null;configured:boolean}> {
  const r=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/delivery-rules`)
  if(!r||typeof r.configured!=='boolean'||!(r.revision===null||typeof r.revision==='string'&&/^[0-9a-f]{32}$/.test(r.revision)))throw Error('invalid_delivery_response')
  if(!r.configured)return {config:{areas:[],slots:[],specialDates:[],deliveryPaused:false},revision:null,configured:false}
  const raw=r.rules
  if(!raw||!Array.isArray(raw.areas)||!Array.isArray(raw.slots))throw Error('invalid_delivery_rules')
  return {configured:true,revision:r.revision,config:{areas:raw.areas.map((a:any)=>({id:a.id,name:a.name,enabled:a.enabled,...a.latitude!==null?{centerLat:a.latitude,centerLng:a.longitude,radiusMeters:a.radiusMeters}:{}})),
    slots:raw.slots.map((s:any)=>({...s,weekdays:s.weekdays||[0,1,2,3,4,5,6]})),specialDates:raw.specialDates||[],deliveryPaused:!!raw.deliveryPaused}}
}
export async function saveMerchantDelivery(cfg:CloudContext,revision:string|null,config:DeliveryConfig):Promise<string> {
  const current=getCloudContext();if(!current||deliveryStoreKey(current)!==deliveryStoreKey(cfg))throw Error('store_changed')
  const token=getSessionToken();if(!token)throw Error('not_logged_in')
  const data={expectedRevision:revision,deliveryPaused:!!config.deliveryPaused,specialDates:config.specialDates||[],
    areas:config.areas.map(a=>({id:a.id,name:a.name.trim(),enabled:a.enabled,latitude:a.centerLat??null,longitude:a.centerLng??null,radiusMeters:a.radiusMeters??null})),
    slots:config.slots.map(s=>({id:s.id,label:s.label.trim(),start:s.start,end:s.end,enabled:s.enabled,weekdays:s.weekdays||[0,1,2,3,4,5,6],...s.areaIds?{areaIds:s.areaIds}:{}}))}
  const r:any=await new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+`/v1/merchant/stores/${cfg.storeSlug}/delivery-rules`,method:'PUT',timeout:15000,data,
    header:{Authorization:'Bearer '+token,'content-type':'application/json'},success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error('http_'+r.statusCode+'_'+String(r.data?.error||''))),fail:reject}))
  if(!r||r.ok!==true||(typeof r.revision!=='string'||!/^[a-f0-9]{32}$/.test(r.revision)))throw Error('unconfirmed_delivery_save')
  return r.revision
}
