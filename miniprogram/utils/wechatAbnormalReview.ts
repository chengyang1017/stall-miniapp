// Merchant-only, audit-only abnormal payment review transport.
import {getCloudContext,getSessionToken,cloudIdentity} from '../modules/shared/runtime/context'
import {authorizedGet} from '../modules/shared/runtime/auth'
const transaction=/^[0-9]{8,32}$/
const base=(slug:string,id:string)=>`/v1/merchant/stores/${slug}/wechat-abnormal-collections/${id}/reviews`
export function getAbnormalReviews(id:string):Promise<any>{
 const cfg=getCloudContext()
 if(!cfg||!transaction.test(id))return Promise.reject(Error('invalid_review_target'))
 return authorizedGet(cfg.apiBase,base(cfg.storeSlug,id))
}
export function appendAbnormalReview(id:string,body:{requestKey:string;action:string;note:string}):Promise<any>{
 const cfg=getCloudContext(),token=getSessionToken(),identity=cloudIdentity()
 if(!cfg||!token||!transaction.test(id))return Promise.reject(Error('invalid_review_target'))
 return new Promise((resolve,reject)=>wx.request({
  url:cfg.apiBase.replace(/\/$/,'')+base(cfg.storeSlug,id),
  method:'POST',data:body,timeout:15000,
  header:{Authorization:'Bearer '+token,'content-type':'application/json'},
  success:(r:any)=>{
   if(identity!==cloudIdentity()){reject(Error('session_or_store_changed_write_unconfirmed'));return}
   if(r.statusCode!==200&&r.statusCode!==201){reject(Error('http_'+r.statusCode+'_'+String(r.data?.error||'unknown')));return}
   resolve(r.data)
  },fail:()=>reject(Error('review_network_unknown'))
 }))
}
