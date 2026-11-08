// Customer-only production JSAPI payment. No merchant secret in the mini program.
import { getSessionToken,cloudIdentity } from '../../shared/runtime/context'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
type Config={apiBase:string;storeSlug:string}
function liveRequest(cfg:Config,orderId:string,method:'GET'|'POST'):Promise<any>{
 const identity=cloudIdentity(),token=getSessionToken()
 if(!token)return Promise.reject(Error('not_logged_in'))
 if(!uuid.test(orderId))return Promise.reject(Error('invalid_order_id'))
 return new Promise((resolve,reject)=>wx.request({
  url:cfg.apiBase.replace(/\/$/,'')+'/v1/stores/'+cfg.storeSlug+'/orders/'+orderId+'/wechat-pay',
  method,timeout:15000,header:{Authorization:'Bearer '+token},
  success:(res:any)=>{
   if(identity!==cloudIdentity()){reject(Error('identity_changed'));return}
   if(res.statusCode!==200||!res.data){reject(Error('http_'+res.statusCode+'_'+String(res.data?.error||'unknown')));return}
   resolve(res.data)
  },
  fail:()=>reject(Error('wechatpay_network_unknown'))
 }))
}
export async function prepareWechatPayment(cfg:Config,orderId:string):Promise<{
 timeStamp:string;nonceStr:string;package:string;signType:'RSA';paySign:string
}>{
 const value=await liveRequest(cfg,orderId,'POST')
 if(value.orderId!==orderId||!/^\d{10}$/.test(value.timeStamp||'')||
  !/^[A-Za-z0-9]{1,32}$/.test(value.nonceStr||'')||
  !/^prepay_id=wx[A-Za-z0-9]+$/.test(value.package||'')||
  value.signType!=='RSA'||typeof value.paySign!=='string'||value.paySign.length<100)
  throw Error('wechatpay_invalid_prepay')
 return {timeStamp:value.timeStamp,nonceStr:value.nonceStr,package:value.package,signType:'RSA',paySign:value.paySign}
}
export async function queryWechatPayment(cfg:Config,orderId:string):Promise<'paid'|'unpaid'|'refund_required'|'partially_refunded'|'refunded'>{
 const data=await liveRequest(cfg,orderId,'GET')
 if(data.verified!==true||!['paid','unpaid','refund_required','partially_refunded','refunded'].includes(data.paymentStatus))throw Error('wechatpay_unverified_status')
 return data.paymentStatus
}
