import { CLOUD_ONLY, PUBLIC_API_BASE, DEFAULT_STORE_SLUG, PREVIEW_APP_ID } from '../../../config/cloud'
export function initializePhonePreview():void {
  if (!CLOUD_ONLY) return
  const binding = PUBLIC_API_BASE + '|' + PREVIEW_APP_ID
  const current = wx.getStorageSync('stall_cloud_catalog_config_v1') as any
  if (wx.getStorageSync('stall_phone_preview_binding_v1') !== binding || current?.apiBase !== PUBLIC_API_BASE) {
    // Never reuse an earlier dev/other-origin token; do not delete or upload carts.
    for (const key of ['stall_server_session_v1','stall_server_cache_scope_v1','stall_merchant_home_preference_v1']) wx.removeStorageSync(key)
    wx.setStorageSync('stall_phone_preview_binding_v1', binding)
  }
  const slug = current?.apiBase === PUBLIC_API_BASE && typeof current?.storeSlug === 'string' && /^[a-z0-9][a-z0-9-]{1,62}$/.test(current.storeSlug) ? current.storeSlug : DEFAULT_STORE_SLUG
  wx.setStorageSync('stall_cloud_catalog_config_v1', { apiBase: PUBLIC_API_BASE, storeSlug: slug })
}
export function previewApiAllowed(base:string):boolean { return !CLOUD_ONLY || base.replace(/\/+$/,'') === PUBLIC_API_BASE }
export function assertPreviewWechatApp():void {
  if (CLOUD_ONLY && wx.getAccountInfoSync().miniProgram.appId !== PREVIEW_APP_ID) throw Error('preview_appid_mismatch')
}
