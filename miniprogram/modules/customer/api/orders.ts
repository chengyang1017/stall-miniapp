// PHASE35_CUSTOMER_ORDERS
import { getCloudContext } from '../../shared/runtime/context'
import { cloudIdentity as supportIdentity } from '../../shared/runtime/context'
const TOKEN_KEY = 'stall_server_session_v1'
export const customerOrdersConfig = getCloudContext
export function stagingOrderPayment(cfg:{apiBase:string;storeSlug:string},id:string,requestKey?:string):Promise<any>{
 const identity=supportIdentity(),token=wx.getStorageSync(TOKEN_KEY)
 if(typeof token!=='string'||!token)return Promise.reject(Error('not_logged_in'))
 if(!/^[0-9a-f-]{36}$/i.test(id)||requestKey!==undefined&&!/^[0-9a-f-]{36}$/i.test(requestKey))return Promise.reject(Error('invalid_test_request'))
 return new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+'/v1/stores/'+cfg.storeSlug+'/orders/'+id+'/staging-payment',method:requestKey?'POST':'GET',data:requestKey?{requestKey}:{},timeout:15000,header:{Authorization:'Bearer '+token,'content-type':'application/json'},success:(r:any)=>{
  if(identity!==supportIdentity())reject(Error('identity_changed'))
  else if(r.statusCode===200&&r.data&&(requestKey?r.data.ok===true&&r.data.simulated===true&&r.data.orderId===id:r.data.authorized===true&&typeof r.data.eligible==='boolean'))resolve(r.data)
  else reject(Error('http_'+r.statusCode+'_'+String(r.data?.error||'unconfirmed_response')))
 },fail:()=>reject(Error('network_result_unknown'))}))
}
export function customerOrdersRequest(cfg:{apiBase:string;storeSlug:string},id?:string,query:{cursor?:string;tab?:string;limit?:number}={}):Promise<any> {
 const identity=supportIdentity(),token=wx.getStorageSync(TOKEN_KEY)
 if(typeof token!=='string'||!token)return Promise.reject(new Error('not_logged_in'))
 if(id && !/^[0-9a-f-]{36}$/i.test(id))return Promise.reject(new Error('invalid_order_id'))
 const params=Object.keys(query).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(String((query as any)[k]))).join('&')
 const uri=cfg.apiBase+'/v1/stores/'+cfg.storeSlug+'/orders'+(id?'/'+encodeURIComponent(id):'')+(params?'?'+params:'')
 return new Promise((resolve,reject)=>wx.request({url:uri,method:'GET',timeout:15000,header:{Authorization:'Bearer '+token},success:(res:any)=>{
   if(identity!==supportIdentity())reject(Error('identity_changed'))
   else if(res.statusCode===200)resolve(res.data)
   else reject(new Error('http_'+res.statusCode))
 },fail:reject}))
}
