import { getCloudContext } from '../modules/shared/runtime/context'
import { publicBusiness } from '../modules/shared/api/business'
import { cloudIdentity as supportIdentity } from '../modules/shared/runtime/context'
export const placeholderStyles=['classic','mountain','bag','playful','premium','custom']
let cacheKey='',cached={placeholderStyle:'none',customPlaceholderUrl:''}
const requests=new WeakMap<object,number>()
export function currentPresentation():{placeholderStyle:string;customPlaceholderUrl:string}{
 const cfg=getCloudContext();if(!cfg)return {placeholderStyle:String(wx.getStorageSync('stall_placeholder_style_v1')||'premium'),customPlaceholderUrl:String(wx.getStorageSync('stall_placeholder_custom_v1')||'')}
 return cacheKey===cfg.apiBase+'/'+cfg.storeSlug?cached:{placeholderStyle:'none',customPlaceholderUrl:''}
}
function presentationFailure(page:{setData:(value:any)=>void}){page.setData({...currentPresentation(),presentationError:'云端缺图设置暂时无法更新；已有样式已保留'})}
export function applyPagePresentation(page:{setData:(value:any)=>void},value:any):void {
 const cfg=getCloudContext();if(!cfg)return
 if(!value.placeholderStyle||!placeholderStyles.includes(value.placeholderStyle)){presentationFailure(page);return}
 cacheKey=cfg.apiBase+'/'+cfg.storeSlug;cached={placeholderStyle:value.placeholderStyle,customPlaceholderUrl:value.customPlaceholderUrl||''};page.setData({...cached,presentationError:''})
}
export async function refreshPagePresentation(page:{setData:(value:any)=>void}):Promise<void>{
 const serial=(requests.get(page)||0)+1;requests.set(page,serial)
 const cfg=getCloudContext(),context=supportIdentity();page.setData({...currentPresentation(),presentationError:''})
 if(!cfg)return
 try{const r=await publicBusiness(cfg);if(context!==supportIdentity()||requests.get(page)!==serial)return;applyPagePresentation(page,r)}
 catch(_){if(context===supportIdentity()&&requests.get(page)===serial)presentationFailure(page)}
}
export function invalidatePagePresentation(page:object){requests.set(page,(requests.get(page)||0)+1)}
