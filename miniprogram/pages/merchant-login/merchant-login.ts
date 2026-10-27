import { loginWithWechat, authorizedGet, setLocalDevToken, localDevAllowed, requestIdentity } from '../../modules/shared/runtime/auth'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { clearSessionCaches } from '../../modules/shared/runtime/sessionLifecycle'

const CONFIG_KEY = 'stall_cloud_catalog_config_v1'
const TOKEN_KEY = 'stall_server_session_v1'
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/
function validBase(base: string): boolean {
  return /^https:\/\/[^\s/]+/.test(base) || localDevAllowed(base)
}
Page({
  pageVisible: false, operationSerial: 0,
  data: { apiBase: '', storeSlug: '', devToken: '', showLocalDev: false,
    busy: false, authenticated: false, status: '尚未验证商家身份' },
  onShow() {
    this.pageVisible = true
    const config = wx.getStorageSync(CONFIG_KEY) as any
    const apiBase = config && typeof config.apiBase === 'string' ? config.apiBase : ''
    const storeSlug = config && typeof config.storeSlug === 'string' ? config.storeSlug : ''
    this.setData({ apiBase, storeSlug, authenticated: false, showLocalDev: localDevAllowed(apiBase) && storeSlug === 'stall-demo' })
    if (apiBase && storeSlug && wx.getStorageSync(TOKEN_KEY)) this.verifyExisting()
  },
  onHide() { this.pageVisible = false; this.operationSerial++; this.setData({busy:false,authenticated:false,devToken:''}) },
  onUnload() { this.onHide() },
  onBaseInput(e: any) { if(this.data.busy)return; const apiBase = String(e.detail.value || '').trim(); this.setData({ apiBase, showLocalDev: localDevAllowed(apiBase) && this.data.storeSlug === 'stall-demo', authenticated: false }) },
  onSlugInput(e: any) { if(this.data.busy)return; const storeSlug = String(e.detail.value || '').trim().toLowerCase(); this.setData({ storeSlug, showLocalDev: localDevAllowed(this.data.apiBase) && storeSlug === 'stall-demo', authenticated: false }) },
  onTokenInput(e: any) { if(this.data.busy)return; this.setData({ devToken: String(e.detail.value || '').trim() }) },
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
  async verifyExisting(openWorkspace = false) {
    if (this.data.busy || !this.config()) return
    const serial = ++this.operationSerial, identity = requestIdentity()
    const apiBase = this.data.apiBase, storeSlug = this.data.storeSlug
    const current = () => this.pageVisible && serial === this.operationSerial && identity === requestIdentity()
    this.setData({ busy: true, authenticated: false, status: '正在核实商家权限…' })
    try {
      const basePath = `/v1/merchant/stores/${storeSlug}`
      const result = await authorizedGet(apiBase, `${basePath}/categories`)
      if (!current()) return
      if (!result || !Array.isArray(result.items)) throw new Error('invalid_response')
      this.setData({ authenticated: true, status: `已登录，具有 ${this.data.storeSlug} 店铺访问权限` })
      // Passive session verification must not navigate away from Account & Permissions.
      // Only an explicit login action chooses the merchant workspace.
      if (openWorkspace) {
        wx.setStorageSync('stall_merchant_home_preference_v1', this.data.apiBase + '|' + this.data.storeSlug)
        wx.navigateTo({url:'/pages/admin/admin'})
      }
    } catch (_) {
      if (!current()) return
      this.setData({ authenticated: false, status: '登录未通过或会话已失效，请重新登录' })
    } finally { if(this.pageVisible && serial === this.operationSerial)this.setData({ busy: false }) }
  },
  async loginWechat() {
    if (this.data.busy || !this.config()) return
    const serial = ++this.operationSerial
    this.setData({ busy: true, authenticated: false, status: '正在进行微信登录…' })
    try {
      await loginWithWechat(this.data.apiBase, () => this.pageVisible && serial === this.operationSerial)
      if (!this.pageVisible || serial !== this.operationSerial) return
      this.setData({ busy: false })
      await this.verifyExisting(true)
    } catch (_) { if(this.pageVisible && serial === this.operationSerial)this.setData({ busy: false, status: '微信登录失败或当前店铺/会话已变化，请核对后重试' }) }
  },
  async loginDev() {
    if (this.data.busy || !localDevAllowed(this.data.apiBase) || this.data.storeSlug !== 'stall-demo' || !this.config()) return
    try {
      setLocalDevToken(this.data.apiBase, this.data.devToken)
      this.setData({ devToken: '' })
      await this.verifyExisting(true)
    } catch (_) { this.setData({ authenticated: false, status: '测试会话无效或已失效' }) }
  },
  async logout() {
    if(this.data.busy)return
    const serial=++this.operationSerial
    const token=wx.getStorageSync(TOKEN_KEY),cfg=getCloudContext();let revoked=false
    this.setData({busy:true})
    try{if(cfg&&typeof token==='string'&&token){await new Promise<void>((resolve,reject)=>wx.request({url:cfg.apiBase+'/v1/auth/logout',method:'POST',timeout:15000,header:{Authorization:`Bearer ${token}`},success:r=>r.statusCode===200?resolve():reject(Error('logout_unconfirmed')),fail:reject}));revoked=true}}
    catch(_){/* Still remove this device's session; do not claim remote revocation. */}
    finally{
      if(wx.getStorageSync(TOKEN_KEY)===token){
        wx.removeStorageSync('stall_merchant_home_preference_v1');wx.removeStorageSync(TOKEN_KEY);wx.removeStorageSync('stall_server_cache_scope_v1');clearSessionCaches()
        if(this.pageVisible&&serial===this.operationSerial)this.setData({authenticated:false,devToken:'',status:revoked?'服务器会话已撤销，已退出登录':'已退出本机登录；服务器会话撤销未确认，请检查网络'})
      }
      if(this.pageVisible&&serial===this.operationSerial)this.setData({busy:false})
    }
  }
})
