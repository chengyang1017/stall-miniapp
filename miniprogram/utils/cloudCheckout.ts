import { selectedCartRows } from '../modules/customer/domain/cartSelection'
import { traceRequest } from '../modules/shared/runtime/uiTrace'
// PHASE34_CLOUD_CHECKOUT
import { cloudCartConfig, cloudCartDetails, readCloudCart, writeCloudCart,cloudCacheSuffix } from './cloudCart'
import { cloudIdentity as supportIdentity } from '../modules/shared/runtime/context'
import { getSessionToken } from '../modules/shared/runtime/context'
import { CloudBusiness } from '../modules/shared/domain/business'
import { SpecialDeliveryDate } from '../modules/customer/demo/settings'
import { PublicDeliveryArea } from '../modules/shared/domain/delivery'
export { cloudCartConfig } from './cloudCart'

export interface CloudDeliveryRules {
  accepting: boolean
  days: Array<{enabled:boolean;start:string;end:string}>
  areas: PublicDeliveryArea[]
  slots: Array<{id:string;label:string;start:string;end:string;enabled:boolean;weekdays?:number[];areaIds?:string[]}>
  deliveryPaused?:boolean;specialDates?:SpecialDeliveryDate[];business:CloudBusiness;serverNow?:string;receivedAt?:number
}
function endpoint(base:string,slug:string,path:string):string {
  const local=/^http:\/\/(?:127\.0\.0\.1|localhost):8787\/?$/.test(base)
  let dev=false
  try { dev=wx.getSystemInfoSync().platform==='devtools' } catch (_) {}
  if(!/^https:\/\//.test(base)&&!(local&&dev))throw new Error('invalid_api_endpoint')
  if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug))throw new Error('invalid_store_slug')
  return base.replace(/\/$/,'')+'/v1/stores/'+slug+'/'+path
}
function request(url:string,method:'GET'|'POST',body?:any,key?:string):Promise<any> {
  const token=wx.getStorageSync('stall_server_session_v1')
  if(method==='POST'&&(typeof token!=='string'||!token))return Promise.reject(new Error('login_required'))
  return traceRequest(method==='GET'?'delivery.rules':'checkout.submit',()=>new Promise((resolve,reject)=>wx.request({url,method,data:body,timeout:15000,
    header:method==='POST'?{'content-type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':key||''}:{},
    success:(r:any)=>r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(new Error('http_'+r.statusCode+'_'+String(r.data&&r.data.error||'unknown'))),fail:reject})))
}
export async function loadCloudDelivery(cfg=cloudCartConfig()):Promise<CloudDeliveryRules> {
  if(!cfg)throw new Error('cloud_not_configured')
  const response=await request(endpoint(cfg.apiBase,cfg.storeSlug,'delivery-rules'),'GET')
  if(!response||!response.configured||!response.rules)throw new Error('当前尚未配置云端配送规则，暂不支持下单')
  if(!Array.isArray(response.rules.areas)||!Array.isArray(response.rules.slots)||!Array.isArray(response.rules.days)||!response.rules.business)throw new Error('invalid_delivery_response')
  return {...response.rules,receivedAt:Date.now()} as CloudDeliveryRules
}
export async function loadCloudCheckout(){
  const cfg=cloudCartConfig();if(!cfg)throw new Error('cloud_not_configured')
  const [cart,rules]=await Promise.all([cloudCartDetails(cfg,true),loadCloudDelivery(cfg)])
  if(cart.items.some((item:any)=>item.stockInsufficient))throw new Error('库存不足，请返回购物车减少数量')
  return {cart,rules,business:rules.business}
}
function deliveryNow(rules?:CloudDeliveryRules):number {
  const server=rules?.serverNow?Date.parse(rules.serverNow):NaN
  return Number.isFinite(server)?server+Math.max(0,Date.now()-(rules?.receivedAt||Date.now())):Date.now()
}
export function localDate(daysAhead=0,rules?:CloudDeliveryRules):string {
  const now=new Date(deliveryNow(rules)+8*3600000+daysAhead*86400000)
  return now.toISOString().slice(0,10)
}
export function availableCloudSlots(rules:CloudDeliveryRules,date:string,areaId?:string):Array<{id:string;label:string;start:string;end:string}> {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(rules.days))return []
  if(!rules.accepting||rules.deliveryPaused||!areaId||!rules.areas.some(a=>a.id===areaId&&a.enabled)||date<localDate(0,rules)||date>localDate(7,rules)||(rules.specialDates||[]).some(d=>d.date===date&&d.paused))return []
  const day=new Date(date+'T00:00:00Z').getUTCDay()
  if(!Number.isFinite(day)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)return []
  const d=rules.days[day]
  if(!d||!d.enabled)return []
  const current=new Date(deliveryNow(rules)+8*3600000),time=current.toISOString().slice(11,16),business=rules.days[current.getUTCDay()]
  if(!business?.enabled||time<business.start||time>=business.end)return []
  return (rules.slots||[]).filter(s=>s.enabled&&(!s.weekdays||s.weekdays.includes(day))&&(!s.areaIds||s.areaIds.includes(areaId))&&s.start>=d.start&&s.end<=d.end&&!(date===localDate(0,rules)&&s.end<=time))
}
export function cloudDeliveryReason(rules:CloudDeliveryRules,date?:string,areaId?:string):string {
  if(!rules.accepting)return '店铺整体暂停接单'
  if(rules.deliveryPaused)return '临时暂停全部配送'
  if(!rules.areas.some(a=>a.enabled&&rules.slots.some(s=>s.enabled&&(!s.areaIds||s.areaIds.includes(a.id)))))return '尚无可用配送区域或时段，暂不支持下单'
  const now=new Date(deliveryNow(rules)+8*3600000),today=rules.days[now.getUTCDay()],clock=now.toISOString().slice(11,16)
  if(!today?.enabled||clock<today.start||clock>=today.end)return '当前不在店铺营业时间'
  if(!date)return ''
  if((rules.specialDates||[]).some(d=>d.date===date&&d.paused))return '所选特殊日期暂停配送，请选择其他日期'
  if(!areaId)return '请先选择可配送的收货区域'
  if(!rules.areas.some(a=>a.id===areaId&&a.enabled))return '该区域已暂停或不再配送'
  return availableCloudSlots(rules,date,areaId).length?'':'该区域在所选日期没有有效配送时段'
}
export async function createCloudOrder(input:{address:{receiverName:string;phone:string;areaId:string;detail:string;latitude?:number;longitude?:number};slot:{id:string;date:string};note:string}):Promise<any> {
  if(!getSessionToken())throw Error('login_required')
  const identity=supportIdentity()
  const cfg=cloudCartConfig();if(!cfg)throw new Error('cloud_not_configured')
  const items=selectedCartRows(readCloudCart(cfg.storeSlug)).map(x=>({productId:x.productId,quantity:x.quantity}))
  if(!items.length)throw new Error('empty_cart')
  const body={items,address:input.address,slot:input.slot,note:input.note.trim()}
  const pendingKey='stall_cloud_order_pending_v1:'+cloudCacheSuffix(cfg.storeSlug)
  const fingerprint=JSON.stringify(body)
  let previous=wx.getStorageSync(pendingKey) as any
  if(!previous&&wx.getStorageSync('stall_cloud_order_pending_v1:'+cfg.storeSlug))throw Error('存在旧版未区分身份的待确认下单请求，请先核对自己的云端订单并联系维护者处理旧缓存，避免重复创建。')
  if(!previous||previous.fingerprint!==fingerprint){
    previous={fingerprint,key:'checkout_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,16)}
    wx.setStorageSync(pendingKey,previous)
  }
  const result=await request(endpoint(cfg.apiBase,cfg.storeSlug,'orders'),'POST',body,previous.key)
  if(identity!==supportIdentity())throw Error('identity_changed_order_unconfirmed')
  if(!result||typeof result.orderId!=='string')throw new Error('invalid_order_result')
  if(result.inventoryState==='released'||result.fulfillmentStatus==='cancelled'){
    wx.removeStorageSync(pendingKey)
    throw new Error('原待支付订单已取消或预留过期，请重新确认库存后下单')
  }
  wx.removeStorageSync(pendingKey)
  const purchased=new Set(items.map(x=>x.productId))
  writeCloudCart(cfg.storeSlug,readCloudCart(cfg.storeSlug).filter(x=>!purchased.has(x.productId)))
  return result
}
