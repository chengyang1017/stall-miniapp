import { businessState } from '../../utils/storeHours' // STALL_HOURS_V1

import {
  loadStore,
  effectivePrice,
  money
} from '../../utils/store'

import {
  addToCart,
  getCartDetails
} from '../../utils/cart'

interface ProductView {
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

    cartCount: 0,
    cartTotal: '0.00'
  },

  onShow() {
    this.refresh()
  },

  refresh() { this.setData({businessInfo:businessState()});
    const store = loadStore()

    const allProducts: ProductView[] =
      store.products.map(p => {
        const current = effectivePrice(p)

        return {
          id: p.id,
          name: p.name,
          imageUrl: p.imageUrl || '',
          original: money(p.price),
          current: money(current),
          discounted: current < p.price,
          available: p.available && !p.soldOut
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

  chooseCategory(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)

    this.setData({
      placeholderStyle: wx.getStorageSync('stall_placeholder_style_v1') || 'premium',
      customPlaceholderUrl: wx.getStorageSync('stall_placeholder_custom_v1') || '',
      selectedCategory: id
    })

    this.refresh()
  },

  addCart(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)

    const product = loadStore().products.find(
      p => p.id === id
    )

    if (!product || !product.available || product.soldOut) {
      wx.showToast({
        title: '商品已停售',
        icon: 'none'
      })
      return
    }

    addToCart(id)
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
