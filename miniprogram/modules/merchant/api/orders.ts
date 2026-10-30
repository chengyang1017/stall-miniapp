import type { FulfillmentStatus } from '../../shared/domain/orders'
// PHASE36_CLOUD_MERCHANT_ORDERS - existing merchant order screen adapter.
import { getCloudContext, getSessionToken } from '../../shared/runtime/context'
import { authorizedGet } from '../../shared/runtime/auth'
export const merchantOrderConfig = getCloudContext
export interface MerchantOrderQuery {q:string;state:string;from:string;to:string}
export type MerchantOrderCounts=Record<FulfillmentStatus,number>&{all:number;other:number;unpaid?:number}
export interface MerchantOrderPage {orders:any[];pendingCount:number;counts:MerchantOrderCounts;matchingCount:number;hasMore:boolean;nextCursor:string|null;canManage:boolean}
// Includes session identity privately, never returned to WXML or logs.
export function merchantOrderContextKey():string {
  const c=getCloudContext();return c?JSON.stringify([c.apiBase,c.storeSlug,getSessionToken()||'']):'local-demo'
}
function request(c:{apiBase:string;storeSlug:string},path:string,method:'GET'|'POST'|'PUT',data?:any):Promise<any>{
  const token=getSessionToken()
  if(typeof token!=='string'||!token)return Promise.reject(new Error('not_logged_in'))
  return new Promise((resolve,reject)=>wx.request({
    url:c.apiBase+path,method,data:data||{},timeout:15000,
    header:{Authorization:'Bearer '+token,'content-type':'application/json'},
    success:(r:any)=>r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(new Error('http_'+r.statusCode+(r.data?.error?'_'+r.data.error:''))),
    fail:reject
  }))
}
export async function fetchMerchantOrders(c:{apiBase:string;storeSlug:string}):Promise<any[]>{
  return (await fetchMerchantOrderPage(c)).orders
}
export async function fetchMerchantOrderPage(c:{apiBase:string;storeSlug:string},query?:MerchantOrderQuery,cursor=''):Promise<MerchantOrderPage>{
  const result=await authorizedGet(c.apiBase,'/v1/merchant/stores/'+c.storeSlug+'/orders',{limit:30,...query?{q:query.q,state:query.state,...query.from?{from:query.from,to:query.to}:{}}:{},...cursor?{cursor}:{}})
  if(!result||!Array.isArray(result.orders))throw new Error('invalid_orders')
  if(!Number.isSafeInteger(result.pendingCount)||result.pendingCount<0)throw new Error('invalid_pending_count')
  if(!result.counts||['all','new','accepted','preparing','delivering','delivered','cancelled','abnormal','other'].some(k=>!Number.isSafeInteger(result.counts[k])||result.counts[k]<0)||result.pendingCount!==result.counts.new||!Number.isSafeInteger(result.matchingCount)||result.matchingCount<0||typeof result.canManage!=='boolean'||typeof result.hasMore!=='boolean'||result.hasMore&&(typeof result.nextCursor!=='string'||!result.nextCursor))throw new Error('invalid_order_page')
  return result
}
export async function fetchMerchantOrderSummary(c:{apiBase:string;storeSlug:string}):Promise<{pendingCount:number;unpaidCount:number}>{
  const result=await request(c,'/v1/merchant/stores/'+c.storeSlug+'/orders/summary','GET')
  if(!result||result.pendingStatus!=='new'||!Number.isSafeInteger(result.pendingCount)||result.pendingCount<0||!Number.isSafeInteger(result.counts?.unpaid)||result.counts.unpaid<0)throw new Error('invalid_order_summary')
  return {pendingCount:result.pendingCount,unpaidCount:result.counts.unpaid}
}
export async function fetchMerchantPendingCount(c:{apiBase:string;storeSlug:string}):Promise<number>{
  const result=await request(c,'/v1/merchant/stores/'+c.storeSlug+'/orders/summary','GET')
  if(!result||result.pendingStatus!=='new'||!Number.isSafeInteger(result.pendingCount)||result.pendingCount<0)throw new Error('invalid_pending_count')
  return result.pendingCount
}
export async function updateMerchantOrder(c:{apiBase:string;storeSlug:string},id:string,status:string,reason=''):Promise<void>{
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('invalid_order_id')
  const body:Record<string,string>={status}
  if(reason)body.reason=reason
  const result=await request(c,'/v1/merchant/stores/'+c.storeSlug+'/orders/'+id+'/status','POST',body)
  if(!result||result.ok!==true||result.status!==status)throw new Error('unconfirmed_order_update')
}

export async function saveMerchantOrderNote(c:{apiBase:string;storeSlug:string},id:string,note:string,expectedVersion:number):Promise<{note:string;version:number}>{
 const context=merchantOrderContextKey()
 if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('invalid_order_id')
 const r=await request(c,`/v1/merchant/stores/${c.storeSlug}/orders/${id}/note`,'PUT',{note,expectedVersion})
 if(context!==merchantOrderContextKey()||!r||typeof r.note!=='string'||!Number.isSafeInteger(r.version))throw Error('unconfirmed_note_save')
 return r
}
