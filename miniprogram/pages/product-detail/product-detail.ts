import { loadStore, effectivePrice, money } from '../../utils/store'
import { addToCart } from '../../utils/cart'
import { setDirectPurchase } from '../../utils/directPurchase'
import { getRemoteProducts } from '../../utils/remoteApi' // PHASE32_REMOTE_DETAIL

Page({
  data: {
    productId: '', name: '', original: '', current: '', discounted: false,
    available: false, quantity: 1, totalText: '0.00',
    categoryName: '', description: '', imageUrl: '', cloudMode: false, cloudLoading: false, cloudError: '', cloudPriceCents: 0
  },
  onLoad(options: { id?: string }) { this.setData({ productId: decodeURIComponent(options.id || '') }) },
  onShow() { this.refresh() },
  async refresh() {
    // PHASE32_REMOTE_DETAIL: do not mix remote catalog with local cart.
    const cfg = wx.getStorageSync('stall_cloud_catalog_config_v1') as any
    if (cfg && typeof cfg.apiBase === 'string' && typeof cfg.storeSlug === 'string' && cfg.apiBase.trim() && cfg.storeSlug.trim()) {
      this.setData({ cloudMode: true, cloudLoading: true, cloudError: '', available: false })
      try {
        const products = await getRemoteProducts(cfg.apiBase.trim(), cfg.storeSlug.trim())
        const p = (products as any[]).find(x => String(x.id) === String(this.data.productId))
        if (!p) throw new Error('not_found')
        const price = Number(p.currentPriceCents !== undefined && p.currentPriceCents !== null ? p.currentPriceCents : p.priceCents)
        const original = Number(p.priceCents)
        if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(original) || original < 0) throw new Error('invalid_price')
        const n = Number(this.data.quantity)
        const qty = Number.isSafeInteger(n) && n >= 1 && n <= 99 ? n : 1
        this.setData({
          name: String(p.name || ''), current: (price / 100).toFixed(2), original: (original / 100).toFixed(2),
          discounted: price < original, available: p.active !== false && !p.soldOut,
          categoryName: typeof p.categoryName === 'string' ? p.categoryName : '',
          description: typeof p.description === 'string' ? p.description : '',
          imageUrl: typeof p.imageUrl === 'string' ? p.imageUrl : '',
          quantity: qty, cloudPriceCents: price, totalText: (price * qty / 100).toFixed(2),
          cloudLoading: false, cloudError: ''
        })
        wx.setNavigationBarTitle({ title: String(p.name || '商品详情') })
      } catch (_) {
        this.setData({ cloudLoading: false, cloudError: '商品加载失败，请返回商品列表重试', available: false,
          name: '', current: '0.00', original: '0.00', imageUrl: '', description: '' })
      }
      return
    }
    const store = loadStore()
    const product = store.products.find(p => p.id === this.data.productId)
    if (!product) { wx.showToast({ title: '商品不存在或已删除', icon: 'none' }); return }
    const current = effectivePrice(product)
    const extended = product as typeof product & { description?: string; imageUrl?: string }
    const category = store.categories.find(c => c.id === product.categoryId)
    this.setData({
      name: product.name, current: money(current), original: money(product.price),
      discounted: current < product.price, available: product.available && !product.soldOut,
      categoryName: category ? category.name : '', description: extended.description || '',
      imageUrl: extended.imageUrl || '',
      totalText: money(Math.round(current * this.data.quantity * 100) / 100)
    })
    wx.setNavigationBarTitle({ title: product.name })
  },
  decrease() { if (this.data.quantity <= 1) return; this.setData({ quantity: this.data.quantity - 1 }); this.refresh() },
  increase() { if (this.data.quantity >= 99) return; this.setData({ quantity: this.data.quantity + 1 }); this.refresh() },
  addCart() {
    if (this.data.cloudMode) return wx.showToast({ title: '云端购物车开发中', icon: 'none' })
    const product = loadStore().products.find(p => p.id === this.data.productId)
    if (!product || (!product.available || product.soldOut)) return wx.showToast({ title: '商品已停售', icon: 'none' })
    for (let i = 0; i < this.data.quantity; i++) addToCart(product.id)
    wx.showToast({ title: '已加入购物车', icon: 'success' })
  },
  buyNow() {
    if (this.data.cloudMode) return wx.showToast({ title: '云端结算开发中', icon: 'none' })
    const product = loadStore().products.find(p => p.id === this.data.productId)
    if (!product || (!product.available || product.soldOut)) return wx.showToast({ title: '商品已停售', icon: 'none' })
    setDirectPurchase(product.id, this.data.quantity)
    wx.navigateTo({ url: '/pages/checkout/checkout' })
  }
})
