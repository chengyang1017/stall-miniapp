import { getMerchantContext, getMerchantSessionToken, MerchantContext } from './merchantContext'
import { authorizedGet, localDevAllowed } from './authApi'
import { HoursConfig } from './storeHours'
import { minimumShortfallCents } from './minimumOrder'
export interface CloudBusiness extends HoursConfig {storeName?:string;configured:boolean;open:boolean;label:string;minimumOrderCents:number;revision?:string|null;timeZone:string;deliveryPaused?:boolean;todayDeliveryPaused?:boolean;noteTags?:string[];placeholderStyle?:string;placeholderImageKey?:string|null;customPlaceholderUrl?:string|null}
export function businessContextKey():string {const c=getMerchantContext();return c?JSON.stringify([c.apiBase,c.storeSlug,getMerchantSessionToken()]):'local-demo'}
export async function merchantBusiness(cfg:MerchantContext):Promise<CloudBusiness>{
  const r=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/business-settings`)
  if(!r||!Array.isArray(r.days)||r.days.length!==7||!Number.isSafeInteger(r.minimumOrderCents)||r.minimumOrderCents<0||typeof r.accepting!=='boolean'||typeof r.notice!=='string'||!(r.revision===null||typeof r.revision==='string'&&/^[a-f0-9]{32}$/.test(r.revision)))throw Error('invalid_business_settings')
  return r
}
export async function patchMerchantBusiness(cfg:MerchantContext,revision:string|null,patch:Partial<HoursConfig>&{minimumOrderCents?:number;noteTags?:string[];placeholderStyle?:string;placeholderImageKey?:string|null}):Promise<string>{
  const token=getMerchantSessionToken();if(!token)throw Error('not_logged_in')
  const r:any=await new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+`/v1/merchant/stores/${cfg.storeSlug}/business-settings`,method:'PATCH' as WechatMiniprogram.RequestOption['method'],timeout:15000,
    data:{...patch,expectedRevision:revision},header:{Authorization:'Bearer '+token,'content-type':'application/json'},
    success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error('http_'+r.statusCode+'_'+String(r.data?.error||''))),fail:reject}))
  if(!r||r.ok!==true||typeof r.revision!=='string')throw Error('unconfirmed_business_save')
  return r.revision
}
export async function publicBusiness(cfg:MerchantContext):Promise<CloudBusiness>{
  if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(cfg.storeSlug)||!(/^https:\/\//.test(cfg.apiBase)||localDevAllowed(cfg.apiBase)))throw Error('invalid_business_endpoint')
  const r:any=await new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+`/v1/stores/${cfg.storeSlug}/business-settings`,method:'GET',timeout:15000,
    success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error('business_read_failed')),fail:reject}))
  if(!r||typeof r.open!=='boolean'||typeof r.notice!=='string'||!Number.isSafeInteger(r.minimumOrderCents)||r.minimumOrderCents<0)throw Error('invalid_public_business')
  return r
}
export function minimumDisplay(cents:number,totalText:string):{minimumOrderText:string;minimumRemainingText:string;minimumReached:boolean}{
  const remaining=minimumShortfallCents(totalText,cents)
  return {minimumOrderText:(cents/100).toFixed(2),minimumRemainingText:(remaining/100).toFixed(2),minimumReached:remaining===0}
}
