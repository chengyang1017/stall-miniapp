import { getMerchantContext } from './merchantContext'
import { publicBusiness } from './businessCloud'
import { supportIdentity } from './supportCloud'
export const placeholderStyles=['classic','mountain','bag','playful','premium','custom']
let cacheKey='',cached={placeholderStyle:'none',customPlaceholderUrl:''}
const requests=new WeakMap<object,number>()
export function currentPresentation():{placeholderStyle:string;customPlaceholderUrl:string}{
 const cfg=getMerchantContext();if(!cfg)return {placeholderStyle:String(wx.getStorageSync('stall_placeholder_style_v1')||'premium'),customPlaceholderUrl:String(wx.getStorageSync('stall_placeholder_custom_v1')||'')}
 return cacheKey===cfg.apiBase+'/'+cfg.storeSlug?cached:{placeholderStyle:'none',customPlaceholderUrl:''}
}
export async function refreshPagePresentation(page:{setData:(value:any)=>void}):Promise<void>{
 const serial=(requests.get(page)||0)+1;requests.set(page,serial)
 const cfg=getMerchantContext(),context=supportIdentity();page.setData({...currentPresentation(),presentationError:''})
 if(!cfg)return
 try{const r=await publicBusiness(cfg);if(context!==supportIdentity()||requests.get(page)!==serial)return
  if(!r.placeholderStyle||!placeholderStyles.includes(r.placeholderStyle))throw Error('presentation_api_required')
  cacheKey=cfg.apiBase+'/'+cfg.storeSlug;cached={placeholderStyle:r.placeholderStyle,customPlaceholderUrl:r.customPlaceholderUrl||''};page.setData(cached)
 }catch(_){if(context===supportIdentity()&&requests.get(page)===serial)page.setData({placeholderStyle:'none',customPlaceholderUrl:'',presentationError:'云端缺图设置读取失败，未使用本机设置'})}
}
export function invalidatePagePresentation(page:object){requests.set(page,(requests.get(page)||0)+1)}
