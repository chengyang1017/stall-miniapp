import { supportGet,supportPost } from '../../shared/api/supportTransport'
export { getCloudContext as supportConfig,cloudIdentity as supportIdentity } from '../../shared/runtime/context'
export { supportTime,supportKey,supportError,compareSupportSeq } from '../../shared/domain/support'
export function customerSupportGet(tail:string,query?:Record<string,string|number>){return supportGet(false,tail,query)}
export function customerSupportPost(tail:string,data:Record<string,string>){return supportPost(false,tail,data)}
