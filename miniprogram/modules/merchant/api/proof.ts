import { getCloudContext } from '../../shared/runtime/context'
import { cloudProofUrl } from '../../shared/api/proofRead'
import { loadProofOrder } from '../../../utils/merchantProofCloud'
export async function proofSnapshot(id:string){const c=getCloudContext();if(!c)throw Error('not_configured');return loadProofOrder(id)}
export async function proofUrl(id:string){const c=getCloudContext();if(!c)throw Error('not_configured');return cloudProofUrl(c.apiBase,c.storeSlug,id,true)}
