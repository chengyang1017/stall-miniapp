import { getRemoteProducts, RemoteProduct } from '../../utils/remoteApi'
import { stockAllows } from '../../utils/store'

const CONFIG_KEY = 'stall_cloud_catalog_config_v1'
const DEV_LOCAL = /^http:\/\/(?:127\.0\.0\.1|localhost):8787$/
function allowedApi(url: string): boolean {
  return /^https:\/\/[^\s/]+/.test(url) || (wx.getSystemInfoSync().platform === 'devtools' && DEV_LOCAL.test(url))
}
type ProductView = RemoteProduct & { priceText: string; count: number; subtotalText: string }
function validConfig(value: any): value is { apiBase: string; storeSlug: string } {
  return !!value && typeof value.apiBase === 'string' && allowedApi(value.apiBase) &&
    typeof value.storeSlug === 'string' && /^[a-z0-9][a-z0-9-]{1,62}$/.test(value.storeSlug)
}
Page({
  data: {
    busy: false, status: '准备读取云端商品', apiBase: '', storeSlug: '',
    products: [] as ProductView[], selected: null as ProductView | null,
    totalText: '0.00', totalCount: 0, lastUpdated: '',
    quantities: {} as Record<string, number>, stale: true
  },
  onShow() {
    const cfg = wx.getStorageSync(CONFIG_KEY)
    if (!validConfig(cfg)) {
      this.setData({ status: '请先到商家管理中心的云端商品连接页填写 API 和店铺标识', products: [], stale: true })
      return
    }
    this.setData({ apiBase: cfg.apiBase, storeSlug: cfg.storeSlug })
    this.refresh()
  },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()) },
  async refresh() {
    const cfg = { apiBase: this.data.apiBase, storeSlug: this.data.storeSlug }
    if (!validConfig(cfg) || this.data.busy) return
    this.setData({ busy: true, stale: true, status: '正在从服务器核对商品和价格…' })
    try {
      const result = await getRemoteProducts(cfg.apiBase, cfg.storeSlug)
      const items = result.filter(p => typeof p.id === 'string' && Number.isSafeInteger(p.priceCents) && p.priceCents >= 0 && typeof p.name === 'string')
      const quantities: Record<string, number> = {}
      for (const item of items) if (!item.soldOut && stockAllows(item) && this.data.quantities[item.id] > 0) quantities[item.id] = Math.min(this.data.quantities[item.id],item.stockMode==='finite'?Number(item.stockQuantity):99)
      const products = items.map(p => ({ ...p, count: quantities[p.id] || 0, priceText: (p.priceCents / 100).toFixed(2), subtotalText: '0.00' }))
      const selected = this.data.selected ? products.find(p => p.id === this.data.selected!.id) || null : null
      this.setData({ products, quantities, selected, stale: false, status: `已同步 ${products.length} 件商品`, lastUpdated: new Date().toLocaleString() })
      this.recalculate()
    } catch (_) {
      // Prevent displaying stale prices as if they were current.
      this.setData({ stale: true, status: '网络读取失败，请检查后端和网络；当前不可确认价格' })
    } finally { this.setData({ busy: false }) }
  },
  recalculate() {
    let totalCents = 0
    let totalCount = 0
    const products = this.data.products.map(p => {
      const count = p.soldOut || !stockAllows(p) ? 0 : Math.max(0, Math.min(p.stockMode==='finite'?Math.min(99,Number(p.stockQuantity)):99, Number(this.data.quantities[p.id]) || 0))
      totalCents += p.priceCents * count
      totalCount += count
      return { ...p, count, subtotalText: (p.priceCents * count / 100).toFixed(2) }
    })
    this.setData({ products, totalCount, totalText: (totalCents / 100).toFixed(2) })
  },
  showDetail(e: any) {
    const id = String(e.currentTarget.dataset.id || '')
    this.setData({ selected: this.data.products.find(p => p.id === id) || null })
  },
  closeDetail() { this.setData({ selected: null }) },
  changeQuantity(e: any) {
    if (this.data.stale || this.data.busy) { wx.showToast({ title: '请先刷新云端价格', icon: 'none' }); return }
    const id = String(e.currentTarget.dataset.id || '')
    const step = Number(e.currentTarget.dataset.step)
    const product = this.data.products.find(p => p.id === id)
    if (!product || product.soldOut || !stockAllows(product) || (step !== 1 && step !== -1)) return
    const next = Math.max(0, Math.min(99, (this.data.quantities[id] || 0) + step))
    if(!stockAllows(product,next))return
    this.setData({ quantities: { ...this.data.quantities, [id]: next } })
    this.recalculate()
  },
  async previewOrder() {
    if (this.data.busy || !this.data.totalCount) return
    const oldTotal = this.data.totalText
    await this.refresh()
    if (this.data.stale) { wx.showToast({ title: '无法验证最新价格', icon: 'none' }); return }
    wx.showModal({ title: '仅为购物车预览',
      content: `服务器最新商品合计 ¥${this.data.totalText}${oldTotal !== this.data.totalText ? '（价格或数量发生变化）' : ''}。正式下单尚未开放，下一阶段需要由后端创建订单并再次校验价格。`,
      showCancel: false })
  }
})
