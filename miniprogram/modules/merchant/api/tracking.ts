import { getCloudContext,getSessionToken,cloudIdentity } from '../../shared/runtime/context'
import type { TrackingView } from '../../shared/domain/tracking'
export interface CourierChoice {id:string;label:string;self:boolean}
export async function merchantTracking(id:string,action:''|'start'|'location'|'pause'|'resume'|'stop'='' ,data:Record<string,unknown>={}):Promise<TrackingView>{
 return request(`/orders/${id}/tracking${action?'/'+action:''}`,action?'POST':'GET',data)
}
export async function assignTracking(id:string,courierId:string,expectedVersion:number):Promise<{ok:boolean;assignmentVersion:number}>{return request(`/orders/${id}/tracking/assign`,'POST',{courierId,expectedVersion})}
export async function trackingCouriers():Promise<CourierChoice[]>{return (await request('/tracking/couriers','GET')).couriers}
function request(tail:string,method:'POST'|'GET',data:Record<string,unknown>={}):Promise<any>{
 const c=getCloudContext(),token=getSessionToken(),identity=cloudIdentity()
 if(!c||!token)return Promise.reject(Error('请先配置云端店铺并登录；演示模式不采集定位'))
 if(!/^\/orders\/[0-9a-f-]{36}\/tracking(?:\/(assign|start|location|pause|resume|stop))?$/i.test(tail)&&tail!=='/tracking/couriers')return Promise.reject(Error('invalid_tracking_path'))
 return new Promise((resolve,reject)=>wx.request({url:c.apiBase+`/v1/merchant/stores/${c.storeSlug}`+tail,method,data,timeout:12000,header:{Authorization:'Bearer '+token,'content-type':'application/json'},success:(r:any)=>{
  if(identity!==cloudIdentity())reject(Error('identity_changed'))
  else if(r.statusCode>=200&&r.statusCode<300)resolve(r.data)
  else reject(Error(`http_${r.statusCode}_${r.data?.error||'tracking_failed'}`))
 },fail:()=>reject(Error('网络未确认，请刷新核对；停止采集不依赖网络'))}))
}
