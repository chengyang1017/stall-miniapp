import { supportGet,supportPost } from '../../shared/api/supportTransport'
export { getCloudContext as supportConfig,cloudIdentity as supportIdentity } from '../../shared/runtime/context'
export { supportTime,supportKey,supportError,compareSupportSeq } from '../../shared/domain/support'
export function merchantSupportGet(tail:string,query?:Record<string,string|number>){return supportGet(true,tail,query)}
export function merchantSupportPost(tail:string,data:Record<string,string>){return supportPost(true,tail,data)}
