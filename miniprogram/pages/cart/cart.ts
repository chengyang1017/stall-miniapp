
import {
  getCartDetails,
  changeQuantity,
  CartDisplayItem
} from '../../utils/cart'

Page({
  data: {
    items: [] as CartDisplayItem[],
    totalText: '0.00',
    totalCount: 0
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const cart = getCartDetails()

    this.setData({
      items: cart.items,
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

  checkout() {
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
