import { authorizedMutation } from '../modules/merchant/api/mutation'
import { authorizedGet } from '../modules/shared/runtime/auth'
import { getSessionToken, getCloudContext } from '../modules/shared/runtime/context'
import { supportKey } from '../modules/shared/domain/support'

interface StoreConfig { apiBase: string; storeSlug: string }

function imageType(path: string): string {
  const suffix = path.split('?')[0].toLowerCase().split('.').pop()
  if (suffix === 'jpg' || suffix === 'jpeg') return 'image/jpeg'
  if (suffix === 'png') return 'image/png'
  if (suffix === 'webp') return 'image/webp'
  throw new Error('unsupported_image_format')
}

function fileInfo(path: string): Promise<{size: number}> {
  return new Promise((resolve, reject) => wx.getFileInfo({ filePath: path, success: (r: any) => resolve({size: Number(r.size)}), fail: reject }))
}

function fileData(path: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: path, success: (r: any) => resolve(r.data as ArrayBuffer), fail: reject }))
}

export async function uploadMerchantImage(cfg: StoreConfig, path: string): Promise<string> {
  const token=getSessionToken(),context=JSON.stringify(getCloudContext())
  const current=getCloudContext();if(!current||current.apiBase!==cfg.apiBase||current.storeSlug!==cfg.storeSlug)throw Error('merchant_context_changed')
  const contentType = imageType(path)
  const info = await fileInfo(path)
  if (!Number.isFinite(info.size) || info.size < 1 || info.size > 5 * 1024 * 1024) throw new Error('image_must_be_under_5mb')
  const result = await authorizedMutation(cfg.apiBase,
    `/v1/merchant/stores/${cfg.storeSlug}/image-uploads`, 'POST', {contentType, sizeBytes: info.size,clientKey:supportKey()})
  if (!result || typeof result.key !== 'string' || typeof result.uploadUrl !== 'string' || !/^https:\/\//.test(result.uploadUrl)) {
    throw new Error('invalid_upload_signature')
  }
  const data = await fileData(path)
  await new Promise<void>((resolve, reject) => wx.request({
    url: result.uploadUrl, method: 'PUT', data,
    header: {'content-type': contentType}, timeout: 60000,
    success: (r: any) => r.statusCode >= 200 && r.statusCode < 300 ? resolve() : reject(new Error(`image_upload_http_${r.statusCode}`)),
    fail: reject
  }))
  if(token!==getSessionToken()||context!==JSON.stringify(getCloudContext()))throw Error('merchant_context_changed')
  if(typeof result.imageId!=='string')throw Error('image_registry_required')
  const verified=await authorizedMutation(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/image-uploads/${result.imageId}/complete`,'POST',{})
  if(!verified.ok||verified.key!==result.key)throw Error('image_verification_failed')
  return result.key
}

export function imageManagementGet(tail='',query?:Record<string,string>):Promise<any>{const c=getCloudContext();if(!c)return Promise.reject(Error('cloud_not_configured'));return authorizedGet(c.apiBase,`/v1/merchant/stores/${c.storeSlug}/${tail||'images'}`,query)}
export function imageReasonText(reason:string):string{return ({business_history_archive_or_backup_protected:'存在业务历史、归档或备份保护，保留',legacy_history_unknown_protected:'旧对象来源或历史不明，保留',proof_or_invalid_key_protected:'凭证或非法对象，禁止清理',deletion_state_locked:'删除状态已锁定，需运维核对',upload_grace_period:'仍在上传保护期，保留',upload_interrupted_no_object:'上传中断或对象不存在，无文件可删除',object_state_unknown:'无法确认对象状态，保留',object_recently_modified:'对象近期变更，仍在保护期',unexpected_object_protected:'对象属性不符合预期，保留',unassociated_upload_after_grace:'超过保护期，未发现任何业务引用，可生成计划'} as Record<string,string>)[reason]||'状态不明，保留'}
export function imageStateText(state:string):string{return ({issued:'待上传或待校验',verified:'已校验存在',missing:'对象缺失',unknown:'无法确认',deleting:'已锁定，需运维核对',deleted:'已确认删除',planned:'计划待运维审批',approved:'已批准，未代表已删除',running:'执行中或待运维复核',finished:'已处理，请核对逐项结果',blocked_reference_or_state:'引用或状态变化，未删除',check_failed_object_retained:'检查失败，保留对象',uncertain_locked_requires_operator_review:'结果不确定，锁定待复核'} as Record<string,string>)[state]||'状态未知'}
export function imageManagementPost(tail:string,data:Record<string,any>):Promise<any>{
 const c=getCloudContext(),token=getSessionToken();if(!c||!token)return Promise.reject(Error('not_logged_in'))
 if(!['images/scan','images/check','image-cleanup/plans'].includes(tail))return Promise.reject(Error('invalid_image_endpoint'))
 return new Promise((resolve,reject)=>wx.request({url:c.apiBase+`/v1/merchant/stores/${c.storeSlug}/${tail}`,method:'POST',data,timeout:60000,header:{Authorization:`Bearer ${token}`,'content-type':'application/json'},success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error(`http_${r.statusCode}_${r.data&&r.data.error||''}`)),fail:reject}))
}
