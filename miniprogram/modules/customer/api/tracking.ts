import { getCloudContext } from '../../shared/runtime/context'
import { authorizedGet } from '../../shared/runtime/auth'
import type { TrackingView } from '../../shared/domain/tracking'
export async function readCustomerTracking(id:string):Promise<TrackingView>{
 const c=getCloudContext();if(!c)throw Error('本机演示没有真实配送位置')
 if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('订单编号无效')
 return authorizedGet(c.apiBase,`/v1/stores/${c.storeSlug}/orders/${id}/tracking`)
}
