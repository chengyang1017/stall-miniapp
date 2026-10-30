// Neutral endpoint/session context. This is configuration, never merchant authorization.
// This contains only client configuration. Authorization MUST be checked by the server.
import { localDevAllowed } from './auth'
import { CLOUD_ONLY, PUBLIC_API_BASE, DEFAULT_STORE_SLUG } from '../../../config/cloud'

export interface CloudContext { apiBase: string; storeSlug: string }
const KEY = 'stall_cloud_catalog_config_v1'
export function getCloudContext(): CloudContext | null {
  const value = wx.getStorageSync(KEY) as any
  if (CLOUD_ONLY) return { apiBase: PUBLIC_API_BASE, storeSlug: value?.apiBase === PUBLIC_API_BASE && typeof value?.storeSlug === 'string' && /^[a-z0-9][a-z0-9-]{1,62}$/.test(value.storeSlug) ? value.storeSlug : DEFAULT_STORE_SLUG }
  if (!value || typeof value.apiBase !== 'string' || typeof value.storeSlug !== 'string') return null
  const apiBase = value.apiBase.trim().replace(/\/$/, '')
  const storeSlug = value.storeSlug.trim()
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug)) return null
  if (!/^https:\/\//.test(apiBase) && !localDevAllowed(apiBase)) return null
  return { apiBase, storeSlug }
}
// Session reader for both roles; actual authorization remains server-side.
export function getSessionToken(): string | null {
  const token = wx.getStorageSync('stall_server_session_v1')
  return typeof token === 'string' && token.length > 0 ? token : null
}

export function cloudIdentity():string{const c=getCloudContext();return JSON.stringify([c&&c.apiBase,c&&c.storeSlug,getSessionToken()])}
