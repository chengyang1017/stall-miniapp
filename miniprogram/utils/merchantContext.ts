// Merchant boundary: shared by merchant pages today, movable to merchant miniapp later.
// This contains only client configuration. Authorization MUST be checked by the server.
import { localDevAllowed } from './authApi'

export interface MerchantContext { apiBase: string; storeSlug: string }
const KEY = 'stall_cloud_catalog_config_v1'
export function getMerchantContext(): MerchantContext | null {
  const value = wx.getStorageSync(KEY) as any
  if (!value || typeof value.apiBase !== 'string' || typeof value.storeSlug !== 'string') return null
  const apiBase = value.apiBase.trim().replace(/\/$/, '')
  const storeSlug = value.storeSlug.trim()
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug)) return null
  if (!/^https:\/\//.test(apiBase) && !localDevAllowed(apiBase)) return null
  return { apiBase, storeSlug }
}
// Shared merchant session reader; actual authorization remains server-side.
export function getMerchantSessionToken(): string | null {
  const token = wx.getStorageSync('stall_server_session_v1')
  return typeof token === 'string' && token.length > 0 ? token : null
}
