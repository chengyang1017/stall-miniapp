import { getCloudContext,getSessionToken } from '../../shared/runtime/context'
import type { CloudContext } from '../../shared/runtime/context'
import { authorizedGet } from '../../shared/runtime/auth'
import type { CloudBusiness,HoursConfig } from '../../shared/domain/business'
export function businessContextKey():string {const c=getCloudContext();return c?JSON.stringify([c.apiBase,c.storeSlug,getSessionToken()]):'local-demo'}
export async function merchantBusiness(cfg:CloudContext):Promise<CloudBusiness>{
  const r=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/business-settings`)
  if(!r||!Array.isArray(r.days)||r.days.length!==7||!Number.isSafeInteger(r.minimumOrderCents)||r.minimumOrderCents<0||typeof r.accepting!=='boolean'||typeof r.notice!=='string'||!(r.revision===null||typeof r.revision==='string'&&/^[a-f0-9]{32}$/.test(r.revision)))throw Error('invalid_business_settings')
  return r
}
export async function patchMerchantBusiness(cfg:CloudContext,revision:string|null,patch:Partial<HoursConfig>&{minimumOrderCents?:number;noteTags?:string[];placeholderStyle?:string;placeholderImageKey?:string|null}):Promise<string>{
  const token=getSessionToken();if(!token)throw Error('not_logged_in')
  const r:any=await new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+`/v1/merchant/stores/${cfg.storeSlug}/business-settings`,method:'PATCH' as WechatMiniprogram.RequestOption['method'],timeout:15000,
    data:{...patch,expectedRevision:revision},header:{Authorization:'Bearer '+token,'content-type':'application/json'},
    success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error('http_'+r.statusCode+'_'+String(r.data?.error||''))),fail:reject}))
  if(!r||r.ok!==true||typeof r.revision!=='string')throw Error('unconfirmed_business_save')
  return r.revision
}
