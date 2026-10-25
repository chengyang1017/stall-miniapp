// PHASE37B_PROOF: signed R2 upload for the existing delivery-proof page.
import { getMerchantContext, getMerchantSessionToken, MerchantContext } from './merchantContext'
type Cfg = MerchantContext
const config = getMerchantContext
export function cloudProofConfig():Cfg|null{return config()}
function request(cfg:Cfg,route:string,body:any):Promise<any>{
 const token=getMerchantSessionToken()
 if(typeof token!=='string'||!token)return Promise.reject(new Error('not_logged_in'))
 return new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+'/v1/merchant/stores/'+cfg.storeSlug+route,method:'POST',data:body,timeout:20000,header:{Authorization:'Bearer '+token,'content-type':'application/json'},success:(r:any)=>r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(new Error('http_'+r.statusCode+'_'+String(r.data&&r.data.error||'failed'))),fail:reject}))
}
export async function loadProofOrder(id:string):Promise<any>{
 const cfg=config();if(!cfg)throw Error('not_configured')
 const token=getMerchantSessionToken()
 if(typeof token!=='string'||!token)throw Error('not_logged_in')
 return new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+'/v1/merchant/stores/'+cfg.storeSlug+'/orders/'+encodeURIComponent(id),method:'GET',header:{Authorization:'Bearer '+token},success:(r:any)=>r.statusCode===200?resolve(r.data.order):reject(new Error('http_'+r.statusCode)),fail:reject}))
}
export async function uploadDeliveryProof(id:string,filePath:string):Promise<string>{
 const cfg=config();if(!cfg)throw Error('not_configured')
 const ext=(filePath.split('?')[0].split('.').pop()||'').toLowerCase()
 const contentType=ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='png'?'image/png':ext==='webp'?'image/webp':''
 if(!contentType)throw Error('unsupported_image_format')
 const info:any=await new Promise((resolve,reject)=>wx.getFileInfo({filePath,success:resolve,fail:reject}))
 if(!info.size||info.size>5*1024*1024)throw Error('invalid_image_size')
 const signed=await request(cfg,'/orders/'+id+'/proof-upload',{contentType,sizeBytes:info.size})
 if(!signed||typeof signed.key!=='string'||typeof signed.uploadUrl!=='string'||!/^https:\/\//.test(signed.uploadUrl))throw Error('invalid_upload_signature')
 const buffer:ArrayBuffer=await new Promise((resolve,reject)=>wx.getFileSystemManager().readFile({filePath,success:(v:any)=>resolve(v.data),fail:reject}))
 await new Promise<void>((resolve,reject)=>wx.request({url:signed.uploadUrl,method:'PUT',data:buffer,timeout:60000,header:{'content-type':contentType},success:(r:any)=>r.statusCode>=200&&r.statusCode<300?resolve():reject(new Error('upload_http_'+r.statusCode)),fail:reject}))
 return signed.key
}
export async function completeCloudDelivery(id:string,key:string):Promise<void>{const cfg=config();if(!cfg)throw Error('not_configured');await request(cfg,'/orders/'+id+'/complete',{proofKey:key})}
