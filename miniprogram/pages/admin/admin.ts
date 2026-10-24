import { getMinimumOrder, saveMinimumOrder } from '../../utils/minimumOrder'

Page({
  data: { minimumOrderInput: '0.00' },
  onShow() { this.refreshNewOrderNotice(); this.setData({ minimumOrderInput: getMinimumOrder().toFixed(2) }) },
  onMinimumOrderInput(e: any) { this.setData({ minimumOrderInput: String(e.detail.value || '') }) },
  saveMinimumOrder() {
    const raw = String(this.data.minimumOrderInput).trim()
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) > 999999) {
      wx.showToast({ title: '请输入有效金额（最多两位小数）', icon: 'none' })
      return
    }
    saveMinimumOrder(Number(raw))
    this.setData({ minimumOrderInput: getMinimumOrder().toFixed(2) })
    wx.showToast({ title: '起送金额已保存', icon: 'success' })
  },

  // ADMIN_NEW_ORDER_NOTICE_V2
  refreshNewOrderNotice() {
    const stored: any = wx.getStorageSync('stall_demo_orders_v1')
    const orders: any[] = Array.isArray(stored) ? stored : (stored && Array.isArray(stored.orders) ? stored.orders : [])
    const pending = orders.filter((o: any) => String(o.fulfillmentStatus || 'new') === 'new').length
    this.setData({ pendingNewOrderCount: pending })
  },
})
