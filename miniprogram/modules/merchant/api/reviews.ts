import { getCloudContext,getSessionToken,cloudIdentity } from '../../shared/runtime/context'
import type { ReviewPage } from '../../shared/domain/reviews'
export function merchantReviewRequest(tail='',method:'GET'|'POST'|'PATCH'='GET',data:Record<string,any>={}):Promise<any>{
 const c=getCloudContext(),token=getSessionToken(),identity=cloudIdentity()
 if(!c||!token)return Promise.reject(Error('请配置云端店铺并登录商家账号'))
 if(tail&&!/^[0-9a-f-]{36}\/(reply|report)$/.test(tail))return Promise.reject(Error('invalid_review_path'))
 return new Promise((resolve,reject)=>wx.request({url:c.apiBase+`/v1/merchant/stores/${c.storeSlug}/reviews`+(tail?'/'+tail:''),method:method==='PATCH'?'POST':method,data,timeout:15000,header:{Authorization:'Bearer '+token,'content-type':'application/json'},success:(r:any)=>identity!==cloudIdentity()?reject(Error('账号或店铺已变化')):r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(Error(String(r.data?.error||'http_'+r.statusCode))),fail:()=>reject(Error('网络未确认，请使用原编号重试并刷新核对'))}))
}
export function merchantReviews(query:Record<string,string|number>):Promise<ReviewPage>{return merchantReviewRequest('','GET',query)}
export function merchantReviewImage(id:string):Promise<string>{
 const c=getCloudContext(),token=getSessionToken(),identity=cloudIdentity();if(!c||!token||!/^[0-9a-f-]{36}$/.test(id))return Promise.reject(Error('invalid_review_image'))
 return new Promise((resolve,reject)=>wx.request({url:c.apiBase+`/v1/merchant/stores/${c.storeSlug}/review-images/${id}`,header:{Authorization:'Bearer '+token},timeout:15000,success:(r:any)=>identity===cloudIdentity()&&r.statusCode===200?resolve(r.data.url):reject(Error('评价图片读取失败')),fail:reject}))
}
