// PHASE37_ETA: merchant ETA mutation, leaving existing status flow unchanged.
import { getCloudContext, getSessionToken } from '../modules/shared/runtime/context'
export async function saveMerchantEta(orderId:string, estimatedArrival:string):Promise<void>{
  const cfg=getCloudContext()
  if(!cfg)throw new Error('cloud_not_configured')
  if(!/^[0-9a-f-]{36}$/i.test(orderId))throw new Error('invalid_order_id')
  const token=getSessionToken()
  if(typeof token!=='string'||!token)throw new Error('not_logged_in')
  await new Promise<void>((resolve,reject)=>wx.request({
    url:cfg.apiBase+'/v1/merchant/stores/'+cfg.storeSlug+'/orders/'+orderId+'/eta',
    method:'PUT',data:{estimatedArrival},timeout:15000,
    header:{Authorization:'Bearer '+token,'content-type':'application/json'},
    success:(res:any)=>res.statusCode===200&&res.data?.ok===true&&res.data.estimatedArrival===estimatedArrival.trim()?resolve():reject(new Error('http_'+res.statusCode+(res.data&&res.data.error?'_'+res.data.error:'_unconfirmed_eta_save'))),
    fail:reject
  }))
}
