// Shared session and authorized GET transport; no role grant or page navigation.
// Never embed WX_APPSECRET here or trust a client-supplied merchant role.
const TOKEN_KEY = 'stall_server_session_v1'
import { rememberSessionScope } from './sessionScope'
export function requestIdentity():string{const c=wx.getStorageSync('stall_cloud_catalog_config_v1') as any;return JSON.stringify([wx.getStorageSync(TOKEN_KEY),c?.apiBase,c?.storeSlug])}
function isLocalDevApi(apiBase: string): boolean {
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
  return new Promise((resolve, reject) => {
    wx.login({ success: login => {
      if (!login.code) return reject(new Error('wx_login_failed'))
      wx.request({
        url: `${apiBase.replace(/\/$/, '')}/v1/auth/wechat`,
        method: 'POST', data: { code: login.code },
        success: (res: any) => {
          if (res.statusCode !== 200 || !res.data || typeof res.data.token !== 'string') return reject(new Error('server_login_failed'))
          wx.setStorageSync(TOKEN_KEY, res.data.token)
          rememberSessionScope(res.data.token,res.data.cacheScope)
          resolve()
        }, fail: reject
      })
    }, fail: reject })
  })
}

export function authorizedGet(apiBase: string, path: string, query?: Record<string,string|number|boolean>): Promise<any> {
  const identity=requestIdentity()
  if (!/^\/v1\/[a-zA-Z0-9/_-]+$/.test(path)) return Promise.reject(new Error('invalid_path'))
  const token = wx.getStorageSync(TOKEN_KEY)
  if (!token || typeof token !== 'string') return Promise.reject(new Error('not_logged_in'))
  const suffix = query ? '?' + Object.keys(query).map(key=>encodeURIComponent(key)+'='+encodeURIComponent(String(query[key]))).join('&') : ''
  return new Promise((resolve, reject) => wx.request({
    url: `${apiBase.replace(/\/$/, '')}${path}${suffix}`,
    method: 'GET', timeout: 15000, header: { Authorization: `Bearer ${token}` },
    success: (res: any) => identity!==requestIdentity()?reject(Error('session_or_store_changed')):res.statusCode === 200 ? resolve(res.data) : reject(new Error(`http_${res.statusCode}${res.data && res.data.error ? '_' + res.data.error : ''}`)),
    fail: reject
  }))
}

