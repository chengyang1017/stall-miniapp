// PHASE34_CLOUD_CHECKOUT
import { cloudCartConfig, cloudCartDetails, readCloudCart, writeCloudCart } from './cloudCart'
export { cloudCartConfig } from './cloudCart'

export interface CloudDeliveryRules {
  accepting: boolean
  days: Array<{enabled:boolean;start:string;end:string}>
  areas: Array<{id:string;name:string;enabled:boolean}>
  slots: Array<{id:string;label:string;start:string;end:string;enabled:boolean}>
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
  return new Promise((resolve,reject)=>wx.request({url,method,data:body,timeout:15000,
    header:method==='POST'?{'content-type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':key||''}:{},
    success:(r:any)=>r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(new Error('http_'+r.statusCode+'_'+String(r.data&&r.data.error||'unknown'))),fail:reject}))
}
export async function loadCloudDelivery():Promise<CloudDeliveryRules> {
  const cfg=cloudCartConfig();if(!cfg)throw new Error('cloud_not_configured')
  const response=await request(endpoint(cfg.apiBase,cfg.storeSlug,'delivery-rules'),'GET')
  if(!response||!response.configured||!response.rules)throw new Error('delivery_not_configured')
  return response.rules as CloudDeliveryRules
}
export async function loadCloudCheckout(){
  const cfg=cloudCartConfig();if(!cfg)throw new Error('cloud_not_configured')
  const [cart,rules]=await Promise.all([cloudCartDetails(cfg),loadCloudDelivery()])
  return {cart,rules}
}
export function localDate(daysAhead=0):string {
  const now=new Date(Date.now()+8*3600000+daysAhead*86400000)
  return now.toISOString().slice(0,10)
}
export function availableCloudSlots(rules:CloudDeliveryRules,date:string):Array<{id:string;label:string;start:string;end:string}> {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(rules.days))return []
  const day=new Date(date+'T00:00:00Z').getUTCDay()
  const d=rules.days[day]
  if(!d||!d.enabled)return []
  const time=new Date(Date.now()+8*3600000).toISOString().slice(11,16)
  return (rules.slots||[]).filter(s=>s.enabled&&s.start>=d.start&&s.end<=d.end&&!(date===localDate()&&s.end<=time))
}
export async function createCloudOrder(input:{address:{receiverName:string;phone:string;areaId:string;detail:string;latitude?:number;longitude?:number};slot:{id:string;date:string};note:string}):Promise<any> {
  const cfg=cloudCartConfig();if(!cfg)throw new Error('cloud_not_configured')
  const items=readCloudCart(cfg.storeSlug).map(x=>({productId:x.productId,quantity:x.quantity}))
  if(!items.length)throw new Error('empty_cart')
  const body={items,address:input.address,slot:input.slot,note:input.note.trim()}
  const pendingKey='stall_cloud_order_pending_v1:'+cfg.storeSlug
  const fingerprint=JSON.stringify(body)
  let previous=wx.getStorageSync(pendingKey) as any
  if(!previous||previous.fingerprint!==fingerprint){
    previous={fingerprint,key:'checkout_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,16)}
    wx.setStorageSync(pendingKey,previous)
  }
  const result=await request(endpoint(cfg.apiBase,cfg.storeSlug,'orders'),'POST',body,previous.key)
  if(!result||typeof result.orderId!=='string')throw new Error('invalid_order_result')
  wx.removeStorageSync(pendingKey)
  writeCloudCart(cfg.storeSlug,[])
  const ordersKey='stall_cloud_recent_orders_v1:'+cfg.storeSlug
  const existing=wx.getStorageSync(ordersKey)
  const orders=Array.isArray(existing)?existing:[]
  wx.setStorageSync(ordersKey,[{id:result.orderId,totalCents:result.totalCents,paymentStatus:'unpaid',createdAt:new Date().toISOString()},...orders.filter((x:any)=>x.id!==result.orderId)].slice(0,50))
  return result
}
