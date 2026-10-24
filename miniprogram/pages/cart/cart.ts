import { loadStore } from '../../utils/store'
import { clearDirectPurchase } from '../../utils/directPurchase'

import {
  getCartDetails,
  changeQuantity,
  CartDisplayItem
} from '../../utils/cart'

Page({
  data: {
    // UNIFIED_PLACEHOLDER_THUMB_V1
    placeholderStyle: 'premium',
    customPlaceholderUrl: '',
    items: [] as CartDisplayItem[],
    totalText: '0.00',
    totalCount: 0
  },

  onShow() {
    this.setData({ placeholderStyle: String(wx.getStorageSync('stall_placeholder_style_v1') || 'premium'), customPlaceholderUrl: String(wx.getStorageSync('stall_placeholder_custom_v1') || '') })

    this.refresh()
  },

  refresh() {
    const cart = getCartDetails()
    // CART_THUMB_AND_FOOTER_V1
    const productImages = loadStore().products
    const displayItems = cart.items.map((item) => {
      const product = productImages.find((p) => p.id === item.productId)
      return { ...item, imageUrl: (product && (product as any).imageUrl) || '' }
    })

    this.setData({
      items: displayItems,
      totalText: cart.totalText,
      totalCount: cart.totalCount
    })
  },

  increase(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    changeQuantity(id, 1)
    this.refresh()
  },

  decrease(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    changeQuantity(id, -1)
    this.refresh()
  },

  // CART_CLEAR_V1
  clearCartConfirmed() {
    if (!this.data.totalCount) return
    wx.showModal({
      title: '\u6e05\u7a7a\u8d2d\u7269\u8f66',
      content: '\u786e\u5b9a\u79fb\u9664\u8d2d\u7269\u8f66\u4e2d\u7684\u5168\u90e8\u5546\u54c1\u5417\uff1f',
      confirmColor: '#d84b47',
      success: (result) => {
        if (!result.confirm) return
        wx.removeStorageSync('stall_cart_v1')
        this.refresh()
        try { wx.removeTabBarBadge({ index: 1 }) } catch (_) { /* tab bar not ready */ }
        wx.showToast({ title: '\u5df2\u6e05\u7a7a', icon: 'success' })
      }
    })
  },
  checkout() {
    clearDirectPurchase()
    if (this.data.totalCount === 0) {
      wx.showToast({
        title: '购物车为空',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: '/pages/checkout/checkout'
    })
  }
})
