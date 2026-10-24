// PHASE36_CLOUD_MERCHANT_ORDERS - existing merchant order screen adapter.
export function merchantOrderConfig(): {apiBase:string;storeSlug:string}|null {
  const c=wx.getStorageSync('stall_cloud_catalog_config_v1') as any
  if(!c || typeof c.apiBase!=='string' || typeof c.storeSlug!=='string')return null
  const apiBase=c.apiBase.trim().replace(/\/$/,'')
  const storeSlug=c.storeSlug.trim()
  const dev=/^http:\/\/(127\.0\.0\.1|localhost):8787$/.test(apiBase)
  const isDev=(()=>{try{return wx.getSystemInfoSync().platform==='devtools'}catch(_){return false}})()
  if(!/^https:\/\//.test(apiBase)&&!(dev&&isDev))return null
  if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug))return null
  return {apiBase,storeSlug}
}
function request(c:{apiBase:string;storeSlug:string},path:string,method:'GET'|'POST',data?:any):Promise<any>{
  const token=wx.getStorageSync('stall_server_session_v1')
  if(typeof token!=='string'||!token)return Promise.reject(new Error('not_logged_in'))
  return new Promise((resolve,reject)=>wx.request({
    url:c.apiBase+path,method,data:data||{},timeout:15000,
    header:{Authorization:'Bearer '+token,'content-type':'application/json'},
    success:(r:any)=>r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(new Error('http_'+r.statusCode+(r.data?.error?'_'+r.data.error:''))),
    fail:reject
  }))
}
export async function fetchMerchantOrders(c:{apiBase:string;storeSlug:string}):Promise<any[]>{
  const result=await request(c,'/v1/merchant/stores/'+c.storeSlug+'/orders','GET')
  if(!result||!Array.isArray(result.orders))throw new Error('invalid_orders')
  return result.orders
}
export async function updateMerchantOrder(c:{apiBase:string;storeSlug:string},id:string,status:string,reason=''):Promise<void>{
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('invalid_order_id')
  const body:Record<string,string>={status}
  if(reason)body.reason=reason
  await request(c,'/v1/merchant/stores/'+c.storeSlug+'/orders/'+id+'/status','POST',body)
}
