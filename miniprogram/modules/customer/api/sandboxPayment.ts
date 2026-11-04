import { cloudIdentity } from '../../shared/runtime/context'
export type SandboxChannel = 'card' | 'alipay' | 'wechat_pay'
// The hosted URL is an external-browser test entry, never native payment parameters.
export function createSandboxCheckout(cfg:{apiBase:string;storeSlug:string},orderId:string,channel:SandboxChannel,requestKey:string):Promise<string>{
 const identity=cloudIdentity(),token=wx.getStorageSync('stall_server_session_v1')
 if(!token||!['card','alipay','wechat_pay'].includes(channel)||! /^[0-9a-f-]{36}$/i.test(orderId))return Promise.reject(Error('invalid_payment_context'))
 return new Promise((resolve,reject)=>wx.request({
  url:cfg.apiBase+'/v1/stores/'+cfg.storeSlug+'/orders/'+orderId+'/stripe-test-checkout',method:'POST',
  data:{channel},timeout:20000,header:{Authorization:'Bearer '+token,'Idempotency-Key':requestKey,'content-type':'application/json'},
  success:(r:any)=>{
   if(identity!==cloudIdentity())return reject(Error('identity_changed'))
   const body=r.data
   if(r.statusCode!==200||body?.testMode!==true||body?.nativePayment!==false||body?.channel!==channel||typeof body?.url!=='string'||!/^https:\/\/checkout\.stripe\.com\//.test(body.url))return reject(Error('sandbox_checkout_unavailable'))
   resolve(body.url)
  },fail:()=>reject(Error('network_result_unknown'))
 }))
}
