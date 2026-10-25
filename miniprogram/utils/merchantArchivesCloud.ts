import { getMerchantContext,getMerchantSessionToken } from './merchantContext'
import { authorizedGet } from './authApi'
import { supportIdentity } from './supportCloud'
export { supportIdentity as archiveContext } from './supportCloud'
export { supportKey as archiveKey,supportTime as archiveTime } from './supportCloud'
export const archiveBase=()=>{const c=getMerchantContext();if(!c)throw Error('cloud_not_configured');return `/v1/merchant/stores/${c.storeSlug}/archives`}
export function archiveGet(tail='',query?:Record<string,string|number>):Promise<any>{const c=getMerchantContext();if(!c)return Promise.reject(Error('cloud_not_configured'));return authorizedGet(c.apiBase,archiveBase()+tail,query)}
export function archivePost(tail:string,data:Record<string,any>):Promise<any>{
 const c=getMerchantContext(),token=getMerchantSessionToken();if(!c||!token)return Promise.reject(Error('not_logged_in'))
 return new Promise((resolve,reject)=>wx.request({url:c.apiBase+archiveBase()+tail,method:'POST',data,timeout:60000,header:{Authorization:`Bearer ${token}`,'content-type':'application/json'},success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error(`http_${r.statusCode}_${r.data&&r.data.error||''}`)),fail:reject}))
}
export function archiveErrorText(e:any):string{
 const s=String(e&&e.message||e)
 if(/401|not_logged_in/.test(s))return '请先登录商家账号'
 if(/invalid_date_range|invalid_billing_query/.test(s))return '请选择有效的开始和结束日期，顺序正确且不超过366天'
 if(/generation_failed/.test(s))return '该次归档生成失败，请查看历史记录；不会显示为备份成功'
 if(/403/.test(s))return '仅店铺 owner 可管理归档，或文件属于其他店铺'
 if(/413/.test(s))return '超过导出大小、记录数或时间限制，请缩小范围；完整归档可能需管理员系统备份'
 if(/429/.test(s))return '请求过于频繁，请稍后重试'
 if(/storage_limit/.test(s))return '已达到10份有效归档上限，请等待文件过期或联系管理员'
 if(/incompatible_archive_version/.test(s))return '不兼容的归档版本，无法进行预检查'
 if(/digest_mismatch/.test(s))return '文件摘要不一致，文件可能损坏或被修改'
 if(/400/.test(s))return '文件格式、必需字段或关联校验不通过，请核对本店归档及参数'
 if(/404/.test(s))return '归档不存在、已过期或不可下载'
 if(/409/.test(s))return '归档状态发生变化、生成中或编号冲突，请刷新历史核对'
 return '云端操作失败；不会使用本机数据替代，请检查网络、权限及后端迁移状态'
}
export function imageCheckSummary(r:any):string{return (r.imageObjectChecks||[]).map((i:any)=>i.key+'：'+(i.state==='exists'?'对象存在（不包含图片实体）':i.state==='missing'?'对象缺失':'无法确认')).join('\n')+'\n未检查图片数量：'+String(r.uncheckedImageCount||0)}
export async function shareArchiveFile(content:string,filename:string):Promise<void>{
 const context=supportIdentity()
 if(typeof content!=='string'||encodeURIComponent(content).replace(/%[a-f0-9]{2}/gi,'x').length>4*1024*1024||!/^merchant-(?:catalog-json|catalog-csv|settings-json|orders-json|archive-json)-(?:\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-)?[0-9a-f-]{36}\.(json|csv)$/.test(filename))throw Error('invalid_archive_file')
 const path=wx.env.USER_DATA_PATH+'/'+filename
 await new Promise<void>((resolve,reject)=>wx.getFileSystemManager().writeFile({filePath:path,data:content,encoding:'utf8',success:()=>resolve(),fail:reject}))
 if(context!==supportIdentity())throw Error('context_changed')
 await new Promise<void>(resolve=>{const saved=()=>{wx.showModal({title:'文件已保存到小程序本地目录',content:'当前环境无法分享，请在支持文件分享的微信真机中使用。归档不等于灾难恢复备份。',showCancel:false});resolve()};if(typeof wx.shareFileMessage==='function')wx.shareFileMessage({filePath:path,fileName:filename,success:()=>resolve(),fail:saved});else saved()})
}
