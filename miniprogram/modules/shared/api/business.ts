import { localDevAllowed } from '../runtime/auth'
import type { CloudContext } from '../runtime/context'
import type { CloudBusiness } from '../domain/business'
import { minimumShortfallCents } from '../domain/money'
export type { CloudBusiness } from '../domain/business'
export async function publicBusiness(cfg:CloudContext):Promise<CloudBusiness>{
  if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(cfg.storeSlug)||!(/^https:\/\//.test(cfg.apiBase)||localDevAllowed(cfg.apiBase)))throw Error('invalid_business_endpoint')
  const r:any=await new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+`/v1/stores/${cfg.storeSlug}/business-settings`,method:'GET',timeout:15000,
    success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error('http_'+r.statusCode+'_business_read_failed')),fail:reject}))
  if(!r||typeof r.open!=='boolean'||typeof r.notice!=='string'||!Number.isSafeInteger(r.minimumOrderCents)||r.minimumOrderCents<0)throw Error('invalid_public_business')
  return r
}
export function minimumDisplay(cents:number,totalText:string):{minimumOrderText:string;minimumRemainingText:string;minimumReached:boolean}{
  const remaining=minimumShortfallCents(totalText,cents)
  return {minimumOrderText:(cents/100).toFixed(2),minimumRemainingText:(remaining/100).toFixed(2),minimumReached:remaining===0}
}
