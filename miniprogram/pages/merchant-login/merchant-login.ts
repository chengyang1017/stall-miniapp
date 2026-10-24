import { loginWithWechat, authorizedGet, setLocalDevToken, localDevAllowed } from '../../utils/authApi'

const CONFIG_KEY = 'stall_cloud_catalog_config_v1'
const TOKEN_KEY = 'stall_server_session_v1'
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/
function validBase(base: string): boolean {
  return /^https:\/\/[^\s/]+/.test(base) || localDevAllowed(base)
}
Page({
  data: { apiBase: '', storeSlug: '', devToken: '', showLocalDev: false,
    busy: false, authenticated: false, status: '尚未验证商家身份' },
  onShow() {
    const config = wx.getStorageSync(CONFIG_KEY) as any
    const apiBase = config && typeof config.apiBase === 'string' ? config.apiBase : ''
    const storeSlug = config && typeof config.storeSlug === 'string' ? config.storeSlug : ''
    this.setData({ apiBase, storeSlug, showLocalDev: localDevAllowed(apiBase) && storeSlug === 'stall-demo' })
    if (apiBase && storeSlug && wx.getStorageSync(TOKEN_KEY)) this.verifyExisting()
  },
  onBaseInput(e: any) { const apiBase = String(e.detail.value || '').trim(); this.setData({ apiBase, showLocalDev: localDevAllowed(apiBase) && this.data.storeSlug === 'stall-demo', authenticated: false }) },
  onSlugInput(e: any) { const storeSlug = String(e.detail.value || '').trim().toLowerCase(); this.setData({ storeSlug, showLocalDev: localDevAllowed(this.data.apiBase) && storeSlug === 'stall-demo', authenticated: false }) },
  onTokenInput(e: any) { this.setData({ devToken: String(e.detail.value || '').trim() }) },
  config(): boolean {
    const apiBase = String(this.data.apiBase).replace(/\/+$/, '')
    const storeSlug = this.data.storeSlug
    if (!validBase(apiBase) || !SLUG.test(storeSlug)) {
      wx.showToast({ title: '请填写有效地址和店铺标识', icon: 'none' }); return false
    }
    this.setData({ apiBase })
    wx.setStorageSync(CONFIG_KEY, { apiBase, storeSlug })
    return true
  },
  async verifyExisting() {
    if (!this.config()) return
    this.setData({ busy: true, status: '正在核实商家权限…' })
    try {
      const basePath = `/v1/merchant/stores/${this.data.storeSlug}`
      const result = await authorizedGet(this.data.apiBase, `${basePath}/categories`)
      if (!result || !Array.isArray(result.items)) throw new Error('invalid_response')
      this.setData({ authenticated: true, status: `已登录，具有 ${this.data.storeSlug} 店铺访问权限` })
    } catch (_) {
      this.setData({ authenticated: false, status: '登录未通过或会话已失效，请重新登录' })
    } finally { this.setData({ busy: false }) }
  },
  async loginWechat() {
    if (this.data.busy || !this.config()) return
    this.setData({ busy: true, authenticated: false, status: '正在进行微信登录…' })
    try {
      await loginWithWechat(this.data.apiBase)
      this.setData({ busy: false })
      await this.verifyExisting()
    } catch (_) { this.setData({ busy: false, status: '微信登录失败，请检查后端微信配置及店铺授权' }) }
  },
  async loginDev() {
    if (this.data.busy || !localDevAllowed(this.data.apiBase) || this.data.storeSlug !== 'stall-demo' || !this.config()) return
    try {
      setLocalDevToken(this.data.apiBase, this.data.devToken)
      this.setData({ devToken: '' })
      await this.verifyExisting()
    } catch (_) { this.setData({ authenticated: false, status: '测试会话无效或已失效' }) }
  },
  logout() {
    wx.removeStorageSync(TOKEN_KEY)
    this.setData({ authenticated: false, devToken: '', status: '已退出本机登录' })
  }
})
