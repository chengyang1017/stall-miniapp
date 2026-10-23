Page({
  onShow() { this.refreshNewOrderNotice() },

  // ADMIN_NEW_ORDER_NOTICE_V2
  refreshNewOrderNotice() {
    const stored: any = wx.getStorageSync('stall_demo_orders_v1')
    const orders: any[] = Array.isArray(stored) ? stored : (stored && Array.isArray(stored.orders) ? stored.orders : [])
    const pending = orders.filter((o: any) => String(o.fulfillmentStatus || 'new') === 'new').length
    this.setData({ pendingNewOrderCount: pending })
  },
})
