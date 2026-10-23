import { loadWorkflowOrders, chinaTime } from '../../utils/orderWorkflow'

const KEY = 'stall_demo_orders_v1'
Page({
  data: {
    orderId: '', merchant: false, found: false, isDelivering: false,
    photoPath: '', deliveredText: '', selectedPhoto: '', busy: false
  },
  onLoad(options: any) {
    this.setData({ orderId: String(options.id || ''), merchant: String(options.merchant || '') === '1' })
    this.refresh()
  },
  onShow() { this.refresh() },
  refresh() {
    const order = loadWorkflowOrders().find(o => o.id === this.data.orderId) as any
    if (!order) { this.setData({ found: false }); return }
    this.setData({
      found: true,
      isDelivering: (order.fulfillmentStatus || 'new') === 'delivering',
      photoPath: String(order.deliveryPhotoPath || ''),
      deliveredText: order.deliveredAt ? chinaTime(order.deliveredAt) : ''
    })
  },
  chooseProof() {
    if (!this.data.merchant || !this.data.isDelivering || this.data.photoPath || this.data.busy) return
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['camera', 'album'], success: (chosen) => {
      if (!chosen.tempFiles || !chosen.tempFiles.length) return
      const source = chosen.tempFiles[0].tempFilePath
      this.setData({ busy: true })
      wx.saveFile({ tempFilePath: source, success: (stored) => {
        this.setData({ selectedPhoto: stored.savedFilePath, busy: false })
      }, fail: () => {
        this.setData({ busy: false })
        wx.showToast({ title: '照片保存失败，请重试', icon: 'none' })
      } })
    } })
  },
  previewPhoto() {
    const path = this.data.selectedPhoto || this.data.photoPath
    if (path) wx.previewImage({ current: path, urls: [path] })
  },
  completeDelivery() {
    if (!this.data.merchant || !this.data.isDelivering || !this.data.selectedPhoto || this.data.busy) return
    wx.showModal({ title: '确认送达？', content: '确认照片已拍摄并保存，订单将标记为已送达（本地演示）。', success: r => {
      if (!r.confirm) return
      const orders = loadWorkflowOrders() as any[]
      const order = orders.find(o => o.id === this.data.orderId)
      if (!order || (order.fulfillmentStatus || 'new') !== 'delivering' || order.deliveryPhotoPath) {
        wx.showToast({ title: '订单状态已变化', icon: 'none' }); this.refresh(); return
      }
      order.deliveryPhotoPath = this.data.selectedPhoto
      order.fulfillmentStatus = 'delivered'
      order.deliveredAt = new Date().toISOString()
      try {
        wx.setStorageSync(KEY, orders)
        this.setData({ selectedPhoto: '' })
        this.refresh()
        wx.showToast({ title: '演示订单已送达', icon: 'success' })
      } catch (_error) {
        wx.showToast({ title: '订单保存失败', icon: 'none' })
      }
    } })
  }
})