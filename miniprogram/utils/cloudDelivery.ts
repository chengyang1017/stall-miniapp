import { authorizedGet } from './authApi'
import { getMerchantContext, getMerchantSessionToken, MerchantContext } from './merchantContext'
import { DeliveryConfig } from './delivery'
import { SavedAddress } from './addresses'

export interface PublicDeliveryArea {id:string;name:string;enabled:boolean;requiresLocation?:boolean}
export function deliveryStoreKey(cfg:MerchantContext):string{return cfg.apiBase.replace(/\/$/,'')+'/'+cfg.storeSlug}
export function resolveDeliveryArea(address:SavedAddress,areas:PublicDeliveryArea[],storeKey:string):PublicDeliveryArea|undefined {
  if(address.deliveryStoreKey&&address.deliveryStoreKey!==storeKey)return undefined
  if(address.deliveryAreaId)return address.deliveryStoreKey===storeKey?areas.find(a=>a.id===address.deliveryAreaId):undefined
  const matches=areas.filter(a=>a.name===address.area)
  return matches.length===1?matches[0]:undefined
}
export function deliveryAddressReason(address:SavedAddress,areas:PublicDeliveryArea[],storeKey:string):string {
  const area=resolveDeliveryArea(address,areas,storeKey)
  if(!area)return '不可配送：原区域已删除或不属于当前店铺，请编辑重选'
  if(!area.enabled)return '不可配送：该区域已暂停'
  if(area.requiresLocation&&(!Number.isFinite(address.latitude)||!Number.isFinite(address.longitude)))return '不可配送：该区域需补充地图位置'
  return ''
}
export async function fetchMerchantDelivery(cfg:MerchantContext):Promise<{config:DeliveryConfig;revision:string|null;configured:boolean}> {
  const r=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/delivery-rules`)
  if(!r||typeof r.configured!=='boolean'||!(r.revision===null||typeof r.revision==='string'&&/^[0-9a-f]{32}$/.test(r.revision)))throw Error('invalid_delivery_response')
  if(!r.configured)return {config:{areas:[],slots:[],specialDates:[],deliveryPaused:false},revision:null,configured:false}
  const raw=r.rules
  if(!raw||!Array.isArray(raw.areas)||!Array.isArray(raw.slots))throw Error('invalid_delivery_rules')
  return {configured:true,revision:r.revision,config:{areas:raw.areas.map((a:any)=>({id:a.id,name:a.name,enabled:a.enabled,...a.latitude!==null?{centerLat:a.latitude,centerLng:a.longitude,radiusMeters:a.radiusMeters}:{}})),
    slots:raw.slots.map((s:any)=>({...s,weekdays:s.weekdays||[0,1,2,3,4,5,6]})),specialDates:raw.specialDates||[],deliveryPaused:!!raw.deliveryPaused}}
}
export async function saveMerchantDelivery(cfg:MerchantContext,revision:string|null,config:DeliveryConfig):Promise<string> {
  const current=getMerchantContext();if(!current||deliveryStoreKey(current)!==deliveryStoreKey(cfg))throw Error('store_changed')
  const token=getMerchantSessionToken();if(!token)throw Error('not_logged_in')
  const data={expectedRevision:revision,deliveryPaused:!!config.deliveryPaused,specialDates:config.specialDates||[],
    areas:config.areas.map(a=>({id:a.id,name:a.name.trim(),enabled:a.enabled,latitude:a.centerLat??null,longitude:a.centerLng??null,radiusMeters:a.radiusMeters??null})),
    slots:config.slots.map(s=>({id:s.id,label:s.label.trim(),start:s.start,end:s.end,enabled:s.enabled,weekdays:s.weekdays||[0,1,2,3,4,5,6],...s.areaIds?{areaIds:s.areaIds}:{}}))}
  const r:any=await new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+`/v1/merchant/stores/${cfg.storeSlug}/delivery-rules`,method:'PUT',timeout:15000,data,
    header:{Authorization:'Bearer '+token,'content-type':'application/json'},success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error('http_'+r.statusCode+'_'+String(r.data?.error||''))),fail:reject}))
  if(!r||r.ok!==true||typeof r.revision!=='string')throw Error('unconfirmed_delivery_save')
  return r.revision
}
