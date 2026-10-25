import { getCloudContext,cloudIdentity,getSessionToken } from '../../shared/runtime/context'
import { loginWithWechat } from '../../shared/runtime/auth'
import { supportKey } from '../../shared/domain/support'
import type { ReviewPage,ReviewSummary } from '../../shared/domain/reviews'
export function reviewCustomerRequest(tail:string,method:'GET'|'POST'|'PATCH'='GET',data:Record<string,any>={}):Promise<any>{
 const c=getCloudContext(),identity=cloudIdentity(),token=getSessionToken()
 if(!c)return Promise.reject(Error('本机演示未生成交易评价，请配置云端店铺'))
 if(!/^(reviews(?:\/(?:mine|eligibility|[0-9a-f-]{36})(?:\/(?:withdraw|report))?)?|review-images(?:\/[0-9a-f-]{36}(?:\/complete)?)?|products\/[0-9a-f-]{36}\/reviews(?:\/summary)?)$/i.test(tail))return Promise.reject(Error('invalid_review_path'))
 const publicRead=method==='GET'&&(/^(products|review-images)\//.test(tail))
 if(!publicRead&&!token)return Promise.reject(Error('请先微信登录'))
 return new Promise((resolve,reject)=>wx.request({url:c.apiBase+`/v1/stores/${c.storeSlug}/`+tail,method:method==='PATCH'?'POST':method,data,timeout:20000,header:{...token?{Authorization:'Bearer '+token}:{},'content-type':'application/json'},success:(r:any)=>identity!==cloudIdentity()?reject(Error('账号或店铺已变化')):r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(Error(String((r.data && r.data.error) || 'http_' + r.statusCode))),fail:()=>reject(Error('网络结果未确认，请保留内容并使用原编号重试'))}))
}
export function reviewLogin(){const c=getCloudContext();if(!c)return Promise.reject(Error('未配置云端店铺'));return loginWithWechat(c.apiBase)}
export function publicReviews(id:string,rating='',cursor=''):Promise<ReviewPage>{return reviewCustomerRequest(`products/${id}/reviews`,'GET',{...rating?{rating}:{},...cursor?{cursor}:{},limit:10})}
export function publicReviewSummary(id:string):Promise<ReviewSummary>{return reviewCustomerRequest(`products/${id}/reviews/summary`)}
export async function uploadReviewPhoto(orderItemId:string,filePath:string,clientKey:string=supportKey(),contentType=''):Promise<string>{
  const identity = cloudIdentity()
  const extension = filePath.split('?')[0].split('.').pop()
  const ext = extension ? extension.toLowerCase() : undefined
  const type = contentType || (
    ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' : ''
  )
 if(!['image/jpeg','image/png','image/webp'].includes(type))throw Error('仅支持 JPG、PNG、WebP 图片')
 const info=await new Promise<WechatMiniprogram.WxGetFileInfoSuccessCallbackResult>((resolve,reject)=>wx.getFileInfo({filePath,success:resolve,fail:reject}))
 if(!info.size||info.size>5*1024*1024)throw Error('每张图片最多5MB')
 const issued=await reviewCustomerRequest('review-images','POST',{orderItemId,contentType:type,sizeBytes:info.size,clientKey})
 if(identity!==cloudIdentity())throw Error('账号已变化')
 if(issued.verified===true)return String(issued.imageId)
 await new Promise<void>((resolve,reject)=>wx.getFileSystemManager().readFile({filePath,success:r=>{if(identity!==cloudIdentity()){reject(Error('账号已变化'));return}wx.request({url:issued.uploadUrl,method:'PUT',data:r.data,header:{'content-type':issued.contentType,'content-length':String(issued.sizeBytes)},timeout:20000,success:res=>res.statusCode>=200&&res.statusCode<300?resolve():reject(Error('图片上传未确认')),fail:()=>reject(Error('图片上传未确认，可使用原编号重试'))})},fail:reject}))
 if(identity!==cloudIdentity())throw Error('账号已变化')
 const verified=await reviewCustomerRequest(`review-images/${issued.imageId}/complete`,'POST',{})
 return String(verified.imageId)
}
