import { getCloudContext } from '../../shared/runtime/context'
import { cloudProofUrl } from '../../shared/api/proofRead'
import { customerOrdersRequest } from './orders'
export async function proofSnapshot(id:string){const c=getCloudContext();if(!c)throw Error('not_configured');const r=await customerOrdersRequest(c,id);return {fulfillment_status:r.order.fulfillmentStatus,delivered_at:r.order.deliveredAt}}
export async function proofUrl(id:string){const c=getCloudContext();if(!c)throw Error('not_configured');return cloudProofUrl(c.apiBase,c.storeSlug,id,false)}
