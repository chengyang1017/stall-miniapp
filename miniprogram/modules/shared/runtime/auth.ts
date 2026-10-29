// Shared session and authorized GET transport; no role grant or page navigation.
// Never embed WX_APPSECRET here or trust a client-supplied merchant role.
const TOKEN_KEY = 'stall_server_session_v1'
import { registerSessionCacheReset } from './sessionLifecycle'
import { rememberSessionScope } from './sessionScope'
import { CLOUD_ONLY } from '../../../config/cloud'
import { assertPreviewWechatApp,previewApiAllowed } from './phonePreview'
export function requestIdentity():string{const c=wx.getStorageSync('stall_cloud_catalog_config_v1') as any;return JSON.stringify([wx.getStorageSync(TOKEN_KEY),c?.apiBase,c?.storeSlug])}
function isLocalDevApi(apiBase: string): boolean {
  if (CLOUD_ONLY) return false
  // Mini Program runtimes need not provide the browser URL constructor.
  // Permit loopback HTTP only inside the WeChat developer simulator.
  const isLoopback = /^http:\/\/(?:127\.0\.0\.1|localhost):8787\/?$/.test(String(apiBase).trim())
  if (!isLoopback) return false
  try { return wx.getSystemInfoSync().platform === 'devtools' }
  catch (_) { return false }
}
export function setLocalDevToken(apiBase: string, token: string): void {
  if (!isLocalDevApi(apiBase) || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw new Error('invalid_development_token')
  wx.setStorageSync(TOKEN_KEY, token)
  rememberSessionScope(token)
}
export function localDevAllowed(apiBase: string): boolean { return isLocalDevApi(apiBase) }

export function loginWithWechat(apiBase: string): Promise<void> {
  try { if (!previewApiAllowed(apiBase)) throw Error('untrusted_preview_endpoint'); assertPreviewWechatApp() }
  catch (error) { return Promise.reject(error) }
  const identity = requestIdentity()
  return new Promise((resolve, reject) => {
    wx.login({ success: login => {
      if (!login.code) return reject(new Error('wx_login_failed'))
      if (identity !== requestIdentity()) return reject(new Error('session_or_store_changed'))
      wx.request({
        url: `${apiBase.replace(/\/$/, '')}/v1/auth/wechat`,
        method: 'POST', data: { code: login.code }, timeout: 15000,
        success: (res: any) => {
          if (identity !== requestIdentity()) return reject(new Error('session_or_store_changed'))
          if (res.statusCode !== 200 || !res.data || typeof res.data.token !== 'string') {
            const code = typeof res.data?.error === 'string' ? res.data.error : 'unknown'
            const allowed = ['auth_not_configured','wechat_auth_failed','invalid_code','service_unavailable','too_large','invalid_json','unknown']
            return reject(new Error('login_http_'+String(res.statusCode)+'_'+(allowed.includes(code)?code:'unknown')))
          }
          wx.setStorageSync(TOKEN_KEY, res.data.token)
          rememberSessionScope(res.data.token,res.data.cacheScope)
          resolve()
        }, fail: (err:any) => reject(new Error('login_network_'+(String(err?.errMsg||'').includes('domain')?'domain':'unavailable')))
      })
    }, fail: (_err:any) => reject(new Error('wx_login_api_failed')) })
  })
}

// Short-lived, in-memory UI proof. It never grants an API permission or caches category edits.
let permissionScope='',permissionGeneration=0
const permissionProofs=new Map<string,{at:number;value:any}>()
const permissionRequests=new Map<string,Promise<any>>()
registerSessionCacheReset(()=>{permissionGeneration++;permissionScope='';permissionProofs.clear();permissionRequests.clear()})
export function hasRecentMerchantPermission(apiBase:string,storeSlug:string):boolean {
 if(!previewApiAllowed(apiBase)||!wx.getStorageSync(TOKEN_KEY))return false
 const scope=requestIdentity()+'|'+apiBase,proof=permissionProofs.get(scope+'|/v1/merchant/stores/'+storeSlug+'/categories')
 return scope===permissionScope&&!!proof&&Date.now()>=proof.at&&Date.now()-proof.at<15000
}
export function authorizedGet(apiBase: string, path: string, query?: Record<string,string|number|boolean>, permissionOnly=false): Promise<any> {
  if (!previewApiAllowed(apiBase)) return Promise.reject(Error('untrusted_preview_endpoint'))
  const identity=requestIdentity()
  if (!/^\/v1\/[a-zA-Z0-9/_-]+$/.test(path)) return Promise.reject(new Error('invalid_path'))
  const token = wx.getStorageSync(TOKEN_KEY)
  if (!token || typeof token !== 'string') return Promise.reject(new Error('not_logged_in'))
  const scope=identity+'|'+apiBase
  if(scope!==permissionScope){permissionGeneration++;permissionScope=scope;permissionProofs.clear();permissionRequests.clear()}
  const generation=permissionGeneration
  const proofKey=scope+'|'+path
  const eligible=permissionOnly&&!query&&/^\/v1\/merchant\/stores\/[a-z0-9-]+\/categories$/.test(path)
  if(eligible){
    const proof=permissionProofs.get(proofKey)
    if(proof&&Date.now()>=proof.at&&Date.now()-proof.at<15000)return Promise.resolve(proof.value)
    const active=permissionRequests.get(proofKey);if(active)return active
  }
  const suffix = query ? '?' + Object.keys(query).map(key=>encodeURIComponent(key)+'='+encodeURIComponent(String(query[key]))).join('&') : ''
  const request:Promise<any>=new Promise((resolve, reject) => wx.request({
    url: `${apiBase.replace(/\/$/, '')}${path}${suffix}`,
    method: 'GET', timeout: 15000, header: { Authorization: `Bearer ${token}` },
    success: (res: any) => identity!==requestIdentity()?reject(Error('session_or_store_changed')):res.statusCode === 200 ? resolve(res.data) : reject(new Error(`http_${res.statusCode}${res.data && res.data.error ? '_' + res.data.error : ''}`)),
    fail: reject
  }))
  if(!eligible)return request.catch(error=>{if(/^http_40[13](?:_|$)/.test(String(error&&error.message)))permissionProofs.clear();throw error})
  const tracked=request.then(value=>{
    if(generation===permissionGeneration&&identity===requestIdentity()&&permissionScope===scope&&value&&Array.isArray(value.items))permissionProofs.set(proofKey,{at:Date.now(),value})
    return value
  },error=>{permissionProofs.delete(proofKey);throw error}).finally(()=>{if(permissionRequests.get(proofKey)===tracked)permissionRequests.delete(proofKey)})
  permissionRequests.set(proofKey,tracked)
  return tracked
}
