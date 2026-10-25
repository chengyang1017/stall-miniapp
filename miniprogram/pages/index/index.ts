import { cloudCartConfig, changeCloudCart, cloudCartDetails, syncCloudBadge } from '../../utils/cloudCart' // PHASE33_CLOUD_CART
import { businessState } from '../../utils/storeHours' // STALL_HOURS_V1
import { getRemoteProducts } from '../../utils/remoteApi'

import {
  loadStore,
  effectivePrice,
  productIsPublished,
  stockAllows,
  money
} from '../../utils/store'

import {
  addToCart,
  getCartDetails
} from '../../utils/cart'

interface ProductView {
  inventoryText?:string
  id: string
  name: string
  imageUrl?: string
  original: string
  current: string
  discounted: boolean
  available: boolean
}

Page({
  data: {
    placeholderStyle: 'premium',
    customPlaceholderUrl: '',
    categories: [] as Array<{
      id: string
      name: string
    }>,

    selectedCategory: 'all',

    products: [] as ProductView[],
    discountedProducts: [] as ProductView[],
    cloudVisible: false, cloudBusy: false, cloudStatus: '',
    cloudProducts: [] as Array<{ id: string; name: string; priceText: string; soldOut: boolean; imageUrl: string }>,
    cloudMode: false, remoteRows: [] as Array<any>,

    cartCount: 0,
    cartTotal: '0.00'
  },

  onShow() {
    const cfg = wx.getStorageSync('stall_cloud_catalog_config_v1') as any
    if (cfg && cfg.apiBase && cfg.storeSlug) this.loadCloudHome()
    else { this.setData({ cloudMode: false }); this.refresh() }
  },

  refresh() {
    if (this.data.cloudMode) { this.renderCloudProducts(); return }
    this.setData({businessInfo:businessState()});
    const store = loadStore()

    const allProducts: ProductView[] =
      store.products.filter(p=>productIsPublished(p)).map(p => {
        const current = effectivePrice(p)

        return {
          id: p.id,
          name: p.name,
          imageUrl: p.imageUrl || '',
          original: money(p.price),
          current: money(current),
          discounted: current < p.price,
          available: productIsPublished(p) && !p.soldOut && stockAllows(p),
          inventoryText:(p.soldOut?'商家手动售罄 · ':'')+(p.stockMode==='finite'?(stockAllows(p)?`库存 ${p.stockQuantity} 件`:'缺货（库存为零）'):'不限库存')
        }
      })

    const selected = this.data.selectedCategory

    const products = allProducts.filter(p => {
      const original = store.products.find(
        item => item.id === p.id
      )

      return selected === 'all' ||
        (original && original.categoryId === selected)
    })

    const discountedProducts = allProducts.filter(
      p => p.discounted && p.available
    )

    const cart = getCartDetails()

    this.setData({
      placeholderStyle: wx.getStorageSync('stall_placeholder_style_v1') || 'premium',
      customPlaceholderUrl: wx.getStorageSync('stall_placeholder_custom_v1') || '',
      categories: store.categories,
      products,
      discountedProducts,
      cartCount: cart.totalCount,
      cartTotal: cart.totalText
    })
  },

  // Cloud catalog replaces the local listing when configured; checkout is disabled.
  async loadCloudHome() {
    const cfg = wx.getStorageSync('stall_cloud_catalog_config_v1') as any
    if (!cfg || !cfg.apiBase || !cfg.storeSlug) return
    this.setData({ cloudMode: true, cloudBusy: true, cloudStatus: '正在加载云端商品',
      businessInfo: businessState(), products: [], discountedProducts: [], categories: [],
      cartCount: 0, cartTotal: '0.00' })
    try {
      const rows = await getRemoteProducts(String(cfg.apiBase).trim(), String(cfg.storeSlug).trim())
      this.setData({ remoteRows: rows, cloudStatus: '', cloudBusy: false })
      this.renderCloudProducts()
    } catch (_) {
      this.setData({ remoteRows: [], products: [], categories: [], discountedProducts: [],
        cloudBusy: false, cloudStatus: '商品加载失败，请检查网络后重试' })
    }
  },

  async refreshCloudCartTotal() {
    const cfg = cloudCartConfig()
    if (!cfg) return
    try {
      const summary = await cloudCartDetails(cfg)
      this.setData({ cartCount: summary.totalCount, cartTotal: summary.totalText })
      syncCloudBadge(cfg.storeSlug)
    } catch (_) { this.setData({ cartCount: 0, cartTotal: '0.00' }) }
  },

  renderCloudProducts() {
    const rows = this.data.remoteRows || []
    // Category names and promotional prices require the dedicated catalog API.
    // Until those endpoints are integrated, display all products without fake labels.
    const products = rows.map((r: any) => ({
        id: r.id, name: r.name, imageUrl: r.imageUrl || '',
        original: (r.priceCents / 100).toFixed(2), current: (r.priceCents / 100).toFixed(2),
        discounted: false, available: !r.soldOut && stockAllows(r),
        inventoryText:(r.soldOut?'商家手动售罄 · ':'')+(r.stockMode==='finite'?(stockAllows(r)?`库存 ${r.stockQuantity} 件`:'缺货（库存为零）'):'不限库存')
      }))
    this.refreshCloudCartTotal()
    this.setData({ categories: [], selectedCategory: 'all', products, discountedProducts: [],
      placeholderStyle: wx.getStorageSync('stall_placeholder_style_v1') || 'premium',
      customPlaceholderUrl: wx.getStorageSync('stall_placeholder_custom_v1') || '' })
  },

  chooseCategory(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)

    this.setData({
      placeholderStyle: wx.getStorageSync('stall_placeholder_style_v1') || 'premium',
      customPlaceholderUrl: wx.getStorageSync('stall_placeholder_custom_v1') || '',
      selectedCategory: id
    })

    this.refresh()
  },

  async addCart(e: WechatMiniprogram.TouchEvent) {
    if (this.data.cloudMode) {
      const cfg = cloudCartConfig()
      const id = String(e.currentTarget.dataset.id || '')
      const row = (this.data.remoteRows || []).find((p: any) => String(p.id) === id)
      if (!cfg || !row || row.active === false || row.soldOut) { wx.showToast({ title: '商品已停售', icon: 'none' }); return }
      if (!await changeCloudCart(cfg.storeSlug, id, 1)) return
      this.refreshCloudCartTotal()
      { wx.showToast({ title: '已加入购物车', icon: 'success' }); return }
    }
    const id = String(e.currentTarget.dataset.id)

    const product = loadStore().products.find(
      p => p.id === id
    )

    if (!product || !productIsPublished(product) || product.soldOut || !stockAllows(product)) {
      wx.showToast({
        title: '商品已停售',
        icon: 'none'
      })
      return
    }

    if(!addToCart(id))return
    this.refresh()

    wx.showToast({
      title: '已加入购物车',
      icon: 'success'
    })
  },

  openProduct(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '')
    if (id) wx.navigateTo({ url: '/pages/product-detail/product-detail?id=' + encodeURIComponent(id) })
  },
  goCart() {

    wx.switchTab({
url: '/pages/cart/cart'
    })
  },

  goAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin'
    })
  }
})
