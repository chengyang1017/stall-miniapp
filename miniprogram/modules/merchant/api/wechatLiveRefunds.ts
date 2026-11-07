// Single-store live WeChat refund functions. Merchant identity is verified on server.
import {getSessionToken} from '../../shared/runtime/context'
import {merchantOrderContextKey} from './orders'
type Config={apiBase:string;storeSlug:string}
export interface LiveRefund {
 id:string;orderId:string;amountCents:number;status:string;outRefundNo:string
 createdAt:string;updatedAt:string;reviewRequired:boolean
}
function request(cfg:Config,id:string,method:'GET'|'POST',data?:any,refundId?:string):Promise<any>{
 const token=getSessionToken(),identity=merchantOrderContextKey()
 if(!token)return Promise.reject(Error('not_logged_in'))
 if(!/^[0-9a-f-]{36}$/i.test(id)||refundId&&!/^[0-9a-f-]{36}$/i.test(refundId))return Promise.reject(Error('invalid_order_id'))
 const base=cfg.apiBase.replace(/\/$/,'')
 const path='/v1/merchant/stores/'+cfg.storeSlug+'/orders/'+id+'/wechat-refunds'+(refundId?'/'+refundId:'')
 return new Promise((resolve,reject)=>wx.request({url:base+path,method,data,timeout:15000,
  header:{Authorization:'Bearer '+token,'content-type':'application/json'},
  success:(res:any)=>{
   if(identity!==merchantOrderContextKey())return reject(Error('identity_changed'))
   if(res.statusCode!==200&&res.statusCode!==202)return reject(Error('http_'+res.statusCode+'_'+String(res.data?.error||'error')))
   resolve(res.data)
  },fail:()=>reject(Error('payment_result_unknown'))}))
}
export async function listLiveRefunds(cfg:Config,id:string):Promise<LiveRefund[]>{
 const result=await request(cfg,id,'GET')
 if(!result||!Array.isArray(result.refunds))throw Error('invalid_refunds_response')
 return result.refunds
}
export function createLiveRefund(cfg:Config,id:string,payload:{requestKey:string;amountCents:number;reason:string}):Promise<LiveRefund>{
 return request(cfg,id,'POST',payload)
}
export function refreshLiveRefund(cfg:Config,id:string,refundId:string):Promise<LiveRefund>{
 return request(cfg,id,'GET',undefined,refundId)
}
