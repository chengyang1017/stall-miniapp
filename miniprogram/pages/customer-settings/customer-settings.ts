const PREF_KEY = 'stall_customer_order_notice_pref_v1'
Page({
  data: { orderNoticeEnabled: true },
  onShow() {
    const v = wx.getStorageSync(PREF_KEY)
    this.setData({ orderNoticeEnabled: v !== false })
  },
  toggleOrderNotice(e: any) {
    const enabled = !!e.detail.value
    wx.setStorageSync(PREF_KEY, enabled)
    this.setData({ orderNoticeEnabled: enabled })
  }
})
