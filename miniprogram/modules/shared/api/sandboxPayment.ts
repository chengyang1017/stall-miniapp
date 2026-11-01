import { cloudIdentity, getSessionToken } from '../runtime/context'
export function sandboxPaymentRequest(cfg:{apiBase:string;storeSlug:string},id:string,merchant=false,action='sandbox-payment',data?:any,requestKey?:string):Promise<any>{
 const identity=cloudIdentity(),token=getSessionToken()
 if(!token||! /^[0-9a-f-]{36}$/i.test(id)||!['sandbox-payment','sandbox-refund','sandbox-cancel'].includes(action))return Promise.reject(Error('invalid_payment_context'))
 return new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+'/v1/'+(merchant?'merchant/':'')+'stores/'+cfg.storeSlug+'/orders/'+id+'/'+action,
  method:action==='sandbox-payment'?'GET':'POST',data:data||{},timeout:20000,
  header:{Authorization:'Bearer '+token,'content-type':'application/json',...(requestKey?{'Idempotency-Key':requestKey}:{})},
  success:(r:any)=>{if(identity!==cloudIdentity())reject(Error('identity_changed'))
   else if(r.statusCode>=200&&r.statusCode<300&&r.data?.sandbox===true)resolve(r.data)
   else reject(Error('http_'+r.statusCode+'_'+String(r.data?.error||'unconfirmed_sandbox_response')))},
  fail:()=>reject(Error('network_result_unknown'))
 }))
}
