import { requestIdentity,localDevAllowed } from '../../shared/runtime/auth'
import { previewApiAllowed } from '../../shared/runtime/phonePreview'
const TOKEN_KEY='stall_server_session_v1'
// Write requests always go through the server authorization checks.
export function authorizedMutation(apiBase: string, path: string, method: 'POST'|'PATCH'|'DELETE', data?: Record<string, any>): Promise<any> {
  if (!previewApiAllowed(apiBase)) return Promise.reject(Error('untrusted_preview_endpoint'))
  const identity=requestIdentity()
  if (!(/^https:\/\//.test(apiBase) || localDevAllowed(apiBase)) || !(/^\/v1\/merchant\/stores\/[a-z0-9-]+\/(products|categories|drafts|image-uploads)(?:\/[0-9a-f-]{36}(?:\/inventory)?)?$/.test(path)||/^\/v1\/merchant\/stores\/[a-z0-9-]+\/image-uploads\/[0-9a-f-]{36}\/complete$/.test(path))) {
    return Promise.reject(new Error('invalid_endpoint'))
  }
  const token = wx.getStorageSync(TOKEN_KEY)
  if (typeof token !== 'string' || !token) return Promise.reject(new Error('not_logged_in'))
  return new Promise((resolve, reject) => wx.request({
    url: `${apiBase.replace(/\/$/, '')}${path}`,
    method: method as WechatMiniprogram.RequestOption['method'], data: data || {}, timeout: 15000,
    header: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    success: (res: any) => identity!==requestIdentity()?reject(Error('session_or_store_changed_write_unconfirmed')):res.statusCode >= 200 && res.statusCode < 300 ? resolve(res.data) : reject(new Error(`http_${res.statusCode}${res.data && res.data.error ? '_' + res.data.error : ''}`)),
    fail: reject
  }))
}
