import { loadWorkflowOrders, chinaTime } from '../../utils/orderWorkflow'
function workflowText(st: string): string {
  const labels: {[key: string]: string} = {new:'待接单',accepted:'已接单',preparing:'备货中',delivering:'配送中',delivered:'已送达',cancelled:'已取消',canceled:'已取消',abnormal:'配送异常',exception:'配送异常',refunded:'已退款'}
  return labels[st] || '待接单'
}
Page({
  data: { found: false, order: {} as any, items: [] as any[], statusText: '', paymentText: '', createdText: '', deliveredText: '', issueText: '', proofImage: '' },
  onLoad(options: Record<string, string | undefined>) {
    this.setData({ order: { id: options.id || '' } })
  },
  onShow() {
    const id = String(this.data.order.id || '')
    const o = (loadWorkflowOrders() as any[]).find(item => item.id === id)
    if (!o) { this.setData({ found: false }); return }
    const status = String(o.fulfillmentStatus || 'new')
    const paymentStatus = String(o.paymentStatus || 'unpaid')
    this.setData({
      found: true,
      order: o,
      items: Array.isArray(o.items) ? o.items : [],
      statusText: paymentStatus !== 'paid' && status === 'new' ? '待支付' : workflowText(status),
      paymentText: paymentStatus === 'paid' ? '已付款' : '待付款（演示）',
      createdText: o.createdAt ? chinaTime(String(o.createdAt)) : '',
      deliveredText: o.deliveredAt ? chinaTime(String(o.deliveredAt)) : '',
      issueText: String(o.issueReason || ''),
      proofImage: String(o.deliveryPhoto || o.deliveryPhotoPath || o.proofImage || o.proofImageUrl || o.proofPhoto || o.deliveredPhoto || '')
    })
  },
  previewProof() {
    if (!this.data.proofImage) return
    wx.previewImage({ current: this.data.proofImage, urls: [this.data.proofImage] })
  }
})