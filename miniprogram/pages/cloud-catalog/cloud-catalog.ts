import { getRemoteProducts, RemoteProduct } from '../../utils/remoteApi'
import { loginWithWechat, authorizedGet, authorizedMutation, setLocalDevToken, localDevAllowed } from '../../utils/authApi'
import { supportIdentity } from '../../utils/supportCloud'
import { getMerchantContext } from '../../utils/merchantContext'

const CONFIG_KEY = 'stall_cloud_catalog_config_v1'
const HTTPS = /^https:\/\/[^\s/]+(?:\:\d+)?(?:\/[^\s]*)?$/
const DEV_LOCAL = /^http:\/\/(?:127\.0\.0\.1|localhost):8787$/
function validApiBase(url: string): boolean {
  if (HTTPS.test(url)) return true
  return wx.getSystemInfoSync().platform === 'devtools' && DEV_LOCAL.test(url)
}
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/

type DisplayProduct = RemoteProduct & { priceText: string }
Page({
  onShow(){const c=getMerchantContext();this.setData({merchantReady:false,merchantProducts:[],categories:[],cloudOrders:[],selectedOrderId:'',orderDetailText:'',billSummary:null,productId:'',productName:'',productPrice:'',productImageKey:'',productImagePreview:'',merchantMessage:'维护诊断入口，请重新验证当前身份；日常经营使用商家工作台',...c?{apiBase:c.apiBase,storeSlug:c.storeSlug}:{}})},
  onHide(){this.setData({merchantReady:false,cloudOrders:[],orderDetailText:'',billSummary:null,merchantProducts:[],categories:[]})},
  data: {
    apiBase: '', storeSlug: '', status: '尚未连接', busy: false,
    products: [] as DisplayProduct[], merchantProducts: [] as DisplayProduct[],
    categories: [] as Array<{ id: string; name: string }>,
    merchantMessage: '商家账号验证尚未执行', merchantReady: false,
    categoryDraft: '', editingCategoryId: '', productId: '', productName: '',
    productPrice: '', productCategoryId: '', productActive: true, productSoldOut: false,
    productImageKey: '', productImagePreview: '', imageMessage: '尚未选择图片',
    cloudOrders: [] as Array<{ id: string; createdAt: string; totalText: string; paymentStatus: string; fulfillmentStatus: string; statusText: string; nextAction: string; nextLabel: string }>,
    orderMessage: '请先登录商家账号', orderBusy: false, pendingCloudOrders: 0,
    selectedOrderId: '', orderDetailText: '', orderReason: '',
    devTokenDraft: '', devTokenEnabled: false, billFrom: '', billTo: '', billBusy: false, billMessage: '尚未读取云端账单', billSummary: null as any
  },
  onDevTokenInput(e: any) { this.setData({ devTokenDraft: String(e.detail.value || '').trim() }) },
  async loginLocalDev() {
    if (!localDevAllowed(this.data.apiBase) || this.data.storeSlug !== 'stall-demo')
      { wx.showToast({title:'仅限本机模拟器 stall-demo',icon:'none'}); return }
    try {
      setLocalDevToken(this.data.apiBase, this.data.devTokenDraft)
      this.setData({devTokenDraft:''})
      await this.loadMerchantForExistingSession()
    } catch (_) { this.setData({merchantReady:false,merchantMessage:'测试会话无效或已过期'}) }
  },
  async loadMerchantForExistingSession() {
    const basePath = `/v1/merchant/stores/${this.data.storeSlug}`
    const [productResponse, categoryResponse] = await Promise.all([
      authorizedGet(this.data.apiBase, `${basePath}/products`),
      authorizedGet(this.data.apiBase, `${basePath}/categories`)
    ])
    if (!Array.isArray(productResponse.items) || !Array.isArray(categoryResponse.items)) throw new Error('invalid_response')
    this.setData({merchantProducts:productResponse.items.map((p: RemoteProduct)=>({...p,priceText:(p.priceCents/100).toFixed(2)})),
      categories:categoryResponse.items, merchantReady:true, merchantMessage:'开发测试会话已验证（15分钟）'})
  },
  onLoad() {
    const saved = wx.getStorageSync(CONFIG_KEY) as any
    if (saved && typeof saved.apiBase === 'string' && typeof saved.storeSlug === 'string') {
      this.setData({ apiBase: saved.apiBase, storeSlug: saved.storeSlug, devTokenEnabled: localDevAllowed(saved.apiBase) })
    }
  },
  onApiInput(e: any) { const apiBase=String(e.detail.value || '').trim(); this.setData({apiBase,devTokenEnabled:localDevAllowed(apiBase)}) },
  onSlugInput(e: any) { this.setData({ storeSlug: String(e.detail.value || '').trim().toLowerCase() }) },
  validConfig(): boolean {
    const apiBase = this.data.apiBase.replace(/\/+$/, '')
    if (!validApiBase(apiBase) || !SLUG.test(this.data.storeSlug)) {
      wx.showToast({ title: '请填写 HTTPS 地址和合法店铺标识', icon: 'none' }); return false
    }
    this.setData({ apiBase });
    wx.setStorageSync(CONFIG_KEY, { apiBase, storeSlug: this.data.storeSlug })
    return true
  },
  async loadProducts() {
    if (this.data.busy || !this.validConfig()) return
    this.setData({ busy: true, status: '正在读取云端商品…' })
    try {
      const products = await getRemoteProducts(this.data.apiBase, this.data.storeSlug)
      this.setData({ products: products.map(p => ({ ...p, priceText: (p.priceCents / 100).toFixed(2) })), status: `已连接，读取到 ${products.length} 件商品` })
    } catch (e) {
      this.setData({ status: '读取失败：请检查服务部署、HTTPS 域名白名单和店铺标识' })
    } finally { this.setData({ busy: false }) }
  },
  async testMerchant() {
    if (this.data.busy || !this.validConfig()) return
    this.setData({ busy: true, merchantMessage: '正在验证商家身份…' })
    try {
      await loginWithWechat(this.data.apiBase)
      const basePath = `/v1/merchant/stores/${this.data.storeSlug}`
      const [productResponse, categoryResponse] = await Promise.all([
        authorizedGet(this.data.apiBase, `${basePath}/products`),
        authorizedGet(this.data.apiBase, `${basePath}/categories`)
      ])
      if (!Array.isArray(productResponse.items) || !Array.isArray(categoryResponse.items)) throw new Error('invalid_response')
      this.setData({
        merchantProducts: productResponse.items.map((p: RemoteProduct) => ({ ...p, priceText: (p.priceCents / 100).toFixed(2) })),
        categories: categoryResponse.items,
        merchantReady: true,
        merchantMessage: `身份验证成功，商家商品 ${productResponse.items.length} 件，分类 ${categoryResponse.items.length} 个`
      })
    } catch (e) { this.setData({ merchantReady: false, merchantMessage: '验证失败：请检查微信配置、会话及店铺权限' }) }
    finally { this.setData({ busy: false }) }
  },
  onBillFrom(e: any) { this.setData({ billFrom: String(e.detail.value || '') }) },
  onBillTo(e: any) { this.setData({ billTo: String(e.detail.value || '') }) },
  async refreshBilling() {
    if (this.data.billBusy || !this.data.merchantReady || !this.validConfig()) return
    const from=this.data.billFrom || new Date().toISOString().slice(0,10)
    const to=this.data.billTo || from
    if(from>to) { wx.showToast({title:'日期范围错误',icon:'none'}); return }
    this.setData({billBusy:true,billMessage:'正在读取云端账单…'})
    try {
      const data=await authorizedGet(this.data.apiBase, `/v1/merchant/stores/${this.data.storeSlug}/billing`,{from,to})
      const x=data.summary
      if(!x || x.orderCents===undefined || x.paidCents===undefined) throw new Error('invalid_response')
      const money=(n:any)=>(Number(n)/100).toFixed(2)
      this.setData({billSummary:{count:Number(x.orderCount)||0,cancel:Number(x.cancelCount)||0,delivered:Number(x.deliveredCount)||0,order:money(x.orderCents),paid:money(x.paidCents),unpaid:money(x.unpaidCents)},billFrom:from,billTo:to,billMessage:`账单范围：${from} 至 ${to}`})
    } catch(_) {this.setData({billMessage:'云端账单读取失败，请检查后端和权限'})}
    finally {this.setData({billBusy:false})}
  },
  exportBilling() {
    const context=supportIdentity()
    if(this.data.billBusy || !this.data.merchantReady || !this.data.billSummary) return
    const token=wx.getStorageSync('stall_server_session_v1')
    if(typeof token!=='string'||!token) { wx.showToast({title:'请重新登录',icon:'none'}); return }
    const from=this.data.billFrom,to=this.data.billTo
    this.setData({billBusy:true,billMessage:'正在下载 CSV…'})
    wx.downloadFile({url:`${this.data.apiBase.replace(/\/+$/,'')}/v1/merchant/stores/${this.data.storeSlug}/billing/export?from=${from}&to=${to}`,header:{Authorization:`Bearer ${token}`},
      success:(result:any)=>{
        if(context!==supportIdentity()||!this.data.merchantReady)return
        if(result.statusCode!==200) {wx.showToast({title:'导出失败，请缩小日期范围',icon:'none'});return}
        wx.shareFileMessage({filePath:result.tempFilePath,fileName:`billing-${from}-${to}.csv`,fail:()=>wx.showToast({title:'文件分享失败',icon:'none'})})
      }, fail:()=>wx.showToast({title:'CSV 下载失败',icon:'none'}),complete:()=>this.setData({billBusy:false,billMessage:'如下载成功，请在微信分享面板保存 CSV'})})
  },
  // Cloud order console: never mutate local demo orders.
  async refreshCloudOrders() {
    if (this.data.orderBusy || !this.data.merchantReady || !this.validConfig()) return
    this.setData({ orderBusy: true, orderMessage: '正在读取云端订单…' })
    try {
      const result = await authorizedGet(this.data.apiBase, `/v1/merchant/stores/${this.data.storeSlug}/orders`)
      if (!Array.isArray(result.orders)) throw new Error('invalid_response')
      const labels: Record<string, string> = { new: '待接单', accepted: '已接单', preparing: '备货中', delivering: '配送中', delivered: '已送达', cancelled: '已取消', abnormal: '配送异常' }
      const actions: Record<string, string> = { new: 'accepted', accepted: 'preparing', preparing: 'delivering' }
      const actionLabels: Record<string, string> = { accepted: '接单', preparing: '开始备货', delivering: '开始配送' }
      const orders = result.orders.map((o: any) => {
        const status = String(o.fulfillmentStatus || 'new')
        const cents = Number(o.totalCents)
        return { id: String(o.id), createdAt: String(o.createdAt || ''),
          totalText: Number.isFinite(cents) ? (cents / 100).toFixed(2) : '--',
          paymentStatus: String(o.paymentStatus || 'unpaid'), fulfillmentStatus: status,
          statusText: labels[status] || status, nextAction: actions[status] || '',
          nextLabel: actionLabels[actions[status]] || '' }
      })
      this.setData({ cloudOrders: orders, pendingCloudOrders: Number(result.pendingCount) || 0,
        orderMessage: `已读取 ${orders.length} 笔云端订单${result.hasMore ? '（诊断页仅显示首30笔，完整分页请用订单管理）' : ''}` })
    } catch (_) { this.setData({ orderMessage: '读取失败：请检查登录状态、权限或后端连接' }) }
    finally { this.setData({ orderBusy: false }) }
  },
  async showCloudOrder(e: any) {
    if (this.data.orderBusy || !this.data.merchantReady) return
    const id = String(e.currentTarget.dataset.id || '')
    if (!this.data.cloudOrders.some(o => o.id === id)) return
    this.setData({ orderBusy: true, selectedOrderId: id, orderDetailText: '正在读取订单详情…' })
    try {
      const result = await authorizedGet(this.data.apiBase, `/v1/merchant/stores/${this.data.storeSlug}/orders/${id}`)
      const lines = Array.isArray(result.items) ? result.items : []
      const text = lines.map((x: any) => `${String(x.name || '商品')} × ${Number(x.quantity) || 0}　¥${(Number(x.lineTotalCents || 0) / 100).toFixed(2)}`).join('\n')
      this.setData({ orderDetailText: text || '暂无商品明细' })
    } catch (_) { this.setData({ orderDetailText: '详情读取失败' }) }
    finally { this.setData({ orderBusy: false }) }
  },
  inputCloudOrderReason(e: any) { this.setData({ orderReason: String(e.detail.value || '') }) },
  changeCloudOrderStatus(e: any) {
    if (this.data.orderBusy || !this.data.merchantReady) return
    const id = String(e.currentTarget.dataset.id || '')
    const next = String(e.currentTarget.dataset.next || '')
    const order = this.data.cloudOrders.find(o => o.id === id)
    const standard: Record<string, string> = { new: 'accepted', accepted: 'preparing', preparing: 'delivering' }
    if (!order || standard[order.fulfillmentStatus] !== next) return
    wx.showModal({ title: '确认修改云端订单？', content: `将订单 ${id.slice(0, 8)} 更新为${order.nextLabel}，仅服务器保存成功才生效。`, success: async (result: any) => {
      if (!result.confirm || this.data.orderBusy) return
      await this.submitCloudOrderStatus(id, next)
    } })
  },
  changeCloudOrderIssue(e: any) {
    if (this.data.orderBusy || !this.data.merchantReady) return
    const id = String(e.currentTarget.dataset.id || '')
    const next = String(e.currentTarget.dataset.next || '')
    const order = this.data.cloudOrders.find(o => o.id === id)
    const permitted = next === 'cancelled' ? ['new', 'accepted', 'preparing'] : next === 'abnormal' ? ['delivering'] : []
    if (!order || !permitted.includes(order.fulfillmentStatus)) return
    wx.showModal({ title: next === 'cancelled' ? '取消云端订单' : '登记配送异常', editable: true,
      placeholderText: '填写原因（1 至 200 字）', success: async (r: any) => {
        const reason = String(r.content || '').trim()
        if (!r.confirm) return
        if (!reason || reason.length > 200) { wx.showToast({ title: '请填写1至200字原因', icon: 'none' }); return }
        await this.submitCloudOrderStatus(id, next, reason)
      } })
  },
  async submitCloudOrderStatus(id: string, status: string, reason = '') {
    if (this.data.orderBusy || !this.data.merchantReady || !this.validConfig()) return
    const token = wx.getStorageSync('stall_server_session_v1')
    if (typeof token !== 'string' || !token) { wx.showToast({ title: '请重新登录', icon: 'none' }); return }
    this.setData({ orderBusy: true })
    try {
      const result: any = await new Promise((resolve, reject) => wx.request({
        url: `${this.data.apiBase.replace(/\/+$/, '')}/v1/merchant/stores/${this.data.storeSlug}/orders/${id}/status`,
        method: 'POST', timeout: 15000, header: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        data: { status, reason },
        success: (res: any) => res.statusCode === 200 && res.data && res.data.ok ? resolve(res.data) : reject(new Error(`http_${res.statusCode}`)),
        fail: reject
      }))
      if (!result.ok) throw new Error('not_confirmed')
      wx.showToast({ title: '云端订单已更新', icon: 'success' })
    } catch (_) {
      wx.showModal({ title: '状态未确认', content: '请刷新云端订单，核对最新状态后再操作，避免重复提交。', showCancel: false })
    } finally { this.setData({ orderBusy: false }) }
    await this.refreshCloudOrders()
  },
  inputCategory(e: any) { this.setData({ categoryDraft: String(e.detail.value || '') }) },
  inputProductName(e: any) { this.setData({ productName: String(e.detail.value || '') }) },
  inputProductPrice(e: any) { this.setData({ productPrice: String(e.detail.value || '') }) },
  chooseProductCategory(e: any) {
    const i = Number(e.detail.value)
    this.setData({ productCategoryId: (this.data.categories[i] || {}).id || '' })
  },
  toggleProductActive(e: any) { this.setData({ productActive: !!e.detail.value }) },
  toggleProductSoldOut(e: any) { this.setData({ productSoldOut: !!e.detail.value }) },
  editCategory(e: any) {
    const id = String(e.currentTarget.dataset.id || '')
    const found = this.data.categories.find(c => c.id === id)
    if (found) this.setData({ editingCategoryId: id, categoryDraft: found.name })
  },
  clearCategoryEdit() { this.setData({ editingCategoryId: '', categoryDraft: '' }) },
  editProduct(e: any) {
    const id = String(e.currentTarget.dataset.id || '')
    const p = this.data.merchantProducts.find(p => p.id === id)
    if (!p) return
    this.setData({ productId: p.id, productName: p.name, productPrice: (p.priceCents / 100).toFixed(2),
      productCategoryId: p.categoryId || '', productActive: (p as any).active !== false, productSoldOut: !!p.soldOut,
      productImageKey: p.imageObjectKey || '', productImagePreview: p.imageUrl || '', imageMessage: p.imageObjectKey ? '已关联云端图片' : '尚无图片' })
  },
  clearProductEdit() { this.setData({ productId: '', productName: '', productPrice: '', productCategoryId: '', productActive: true, productSoldOut: false, productImageKey: '', productImagePreview: '', imageMessage: '尚未选择图片' }) },
  async refreshMerchant() {
    const path = `/v1/merchant/stores/${this.data.storeSlug}`
    const [pr, cr] = await Promise.all([authorizedGet(this.data.apiBase, `${path}/products`), authorizedGet(this.data.apiBase, `${path}/categories`)])
    if (!Array.isArray(pr.items) || !Array.isArray(cr.items)) throw new Error('invalid_response')
    this.setData({ merchantProducts: pr.items.map((p: RemoteProduct) => ({ ...p, priceText: (p.priceCents / 100).toFixed(2) })), categories: cr.items })
  },
  async saveCategory() {
    if (this.data.busy || !this.data.merchantReady || !this.validConfig()) return
    const name = this.data.categoryDraft.trim()
    if (!name || name.length > 100) { wx.showToast({ title: '分类名称需为1-100字', icon: 'none' }); return }
    this.setData({ busy: true })
    try {
      const root = `/v1/merchant/stores/${this.data.storeSlug}/categories`
      await authorizedMutation(this.data.apiBase, this.data.editingCategoryId ? `${root}/${this.data.editingCategoryId}` : root, this.data.editingCategoryId ? 'PATCH' : 'POST', { name })
      await this.refreshMerchant(); this.clearCategoryEdit(); wx.showToast({ title: '分类已保存' })
    } catch (e) { wx.showModal({ title: '保存未完成', content: '请确认网络及商家权限，再刷新云端数据。', showCancel: false }) }
    finally { this.setData({ busy: false }) }
  },
  deleteCategory(e: any) {
    if (this.data.busy || !this.data.merchantReady) return
    const id = String(e.currentTarget.dataset.id || '')
    if (!this.data.categories.some(c => c.id === id)) return
    wx.showModal({ title: '删除云端分类？', content: '分类内若仍有商品，服务器会拒绝删除。', success: async r => {
      if (!r.confirm || this.data.busy) return
      this.setData({ busy: true })
      try { await authorizedMutation(this.data.apiBase, `/v1/merchant/stores/${this.data.storeSlug}/categories/${id}`, 'DELETE'); await this.refreshMerchant(); this.clearCategoryEdit(); wx.showToast({ title: '已删除' }) }
      catch (e) { wx.showToast({ title: '删除失败，可能仍有商品', icon: 'none' }) }
      finally { this.setData({ busy: false }) }
    } })
  },
  chooseCloudImage() {
    if (this.data.busy || !this.data.merchantReady || !this.validConfig()) return
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: result => {
        const filePath = result.tempFilePaths && result.tempFilePaths[0]
        if (filePath) this.uploadCloudImage(filePath)
      }, fail: () => wx.showToast({ title: '未选择图片', icon: 'none' }) })
  },
  async uploadCloudImage(filePath: string) {
    this.setData({ busy: true, imageMessage: '正在上传图片…' })
    try {
      const info: any = await new Promise((resolve, reject) => wx.getFileInfo({ filePath, success: resolve, fail: reject }))
      if (!info || !Number.isFinite(info.size) || info.size < 1 || info.size > 5 * 1024 * 1024) throw new Error('image_size')
      const ext = (filePath.split('?')[0].split('.').pop() || '').toLowerCase()
      const mime: any = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
      const contentType = mime[ext]
      if (!contentType) throw new Error('image_type')
      const endpoint = `/v1/merchant/stores/${this.data.storeSlug}/image-uploads`
      const signed = await authorizedMutation(this.data.apiBase, endpoint, 'POST', { contentType, sizeBytes: info.size })
      if (!signed || typeof signed.uploadUrl !== 'string' || typeof signed.key !== 'string') throw new Error('invalid_signature')
      const bytes: ArrayBuffer = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath, success: (r: any) => resolve(r.data as ArrayBuffer), fail: reject }))
      const uploaded: any = await new Promise((resolve, reject) => wx.request({
        url: signed.uploadUrl, method: 'PUT', data: bytes, timeout: 60000,
        header: { 'Content-Type': contentType }, success: resolve, fail: reject
      }))
      if (uploaded.statusCode < 200 || uploaded.statusCode >= 300) throw new Error('upload_failed')
      // Keep current image key unchanged until upload succeeded.
      this.setData({ productImageKey: signed.key, productImagePreview: filePath, imageMessage: '上传成功；保存商品后生效' })
    } catch (e) {
      this.setData({ imageMessage: '图片上传失败，请检查格式、网络及上传域名配置' })
      wx.showToast({ title: '图片上传失败', icon: 'none' })
    } finally { this.setData({ busy: false }) }
  },
  removeCloudImage() {
    if (this.data.busy) return
    this.setData({ productImageKey: '', productImagePreview: '', imageMessage: '已选择移除图片，保存商品后生效' })
  },
  async saveProduct() {
    if (this.data.busy || !this.data.merchantReady || !this.validConfig()) return
    if(!this.data.productId){wx.navigateTo({url:'/pages/admin-product-form/admin-product-form'});return}
    const name = this.data.productName.trim(), raw = this.data.productPrice.trim()
    const value = Number(raw), cents = Math.round(value * 100)
    if (!name || name.length > 200 || !/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isSafeInteger(cents) || cents < 0 || cents > 100000000) {
      { wx.showToast({ title: '请检查商品名称和价格', icon: 'none' }); return }
    }
    if (this.data.productCategoryId && !this.data.categories.some(c => c.id === this.data.productCategoryId)) { wx.showToast({ title: '请选择有效分类', icon: 'none' }); return }
    const data = { name, priceCents: cents, categoryId: this.data.productCategoryId || null, active: this.data.productActive, soldOut: this.data.productSoldOut, imageObjectKey: this.data.productImageKey || null }
    const root = `/v1/merchant/stores/${this.data.storeSlug}/products`
    this.setData({ busy: true })
    try {
      await authorizedMutation(this.data.apiBase, this.data.productId ? `${root}/${this.data.productId}` : root, this.data.productId ? 'PATCH' : 'POST', data)
      await this.refreshMerchant(); this.clearProductEdit(); wx.showToast({ title: '商品已保存' })
    } catch (e) { wx.showModal({ title: '保存未完成', content: '请核对服务端状态；不要重复点击以免新增重复商品。', showCancel: false }) }
    finally { this.setData({ busy: false }) }
  },
  disableProduct(e: any) {
    if (this.data.busy || !this.data.merchantReady) return
    const id = String(e.currentTarget.dataset.id || '')
    if (!this.data.merchantProducts.some(p => p.id === id)) return
    wx.showModal({ title: '停用商品？', content: '云端商品将停止销售，历史订单不删除。', success: async r => {
      if (!r.confirm || this.data.busy) return
      this.setData({ busy: true })
      try { await authorizedMutation(this.data.apiBase, `/v1/merchant/stores/${this.data.storeSlug}/products/${id}`, 'DELETE'); await this.refreshMerchant(); wx.showToast({ title: '已停用' }) }
      catch (e) { wx.showToast({ title: '停用失败', icon: 'none' }) }
      finally { this.setData({ busy: false }) }
    } })
  }

})
