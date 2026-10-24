import { loadStore, effectivePrice, money } from '../../utils/store'
import { addToCart } from '../../utils/cart'
import { setDirectPurchase } from '../../utils/directPurchase'

Page({
  data: {
    productId: '', name: '', original: '', current: '', discounted: false,
    available: false, quantity: 1, totalText: '0.00',
    categoryName: '', description: '', imageUrl: ''
  },
  onLoad(options: { id?: string }) { this.setData({ productId: decodeURIComponent(options.id || '') }) },
  onShow() { this.refresh() },
  refresh() {
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
    const product = loadStore().products.find(p => p.id === this.data.productId)
    if (!product || (!product.available || product.soldOut)) return wx.showToast({ title: '商品已停售', icon: 'none' })
    for (let i = 0; i < this.data.quantity; i++) addToCart(product.id)
    wx.showToast({ title: '已加入购物车', icon: 'success' })
  },
  buyNow() {
    const product = loadStore().products.find(p => p.id === this.data.productId)
    if (!product || (!product.available || product.soldOut)) return wx.showToast({ title: '商品已停售', icon: 'none' })
    setDirectPurchase(product.id, this.data.quantity)
    wx.navigateTo({ url: '/pages/checkout/checkout' })
  }
})
