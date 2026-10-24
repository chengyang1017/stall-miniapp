import { loadWorkflowOrders, workflowLabel } from '../../utils/orderWorkflow'

// All figures are derived from demo orders stored on this device only.
// Payment is currently always `unpaid`: never represent order value as received revenue.
function localDay(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
function nowDay(): string { return localDay(new Date().toISOString()) }
function amountInCents(value: any): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}
function yuan(cents: number): string { return (cents / 100).toFixed(2) }
function csvCell(value: unknown): string {
  let s = String(value == null ? '' : value)
  // Prevent spreadsheet formula execution from untrusted customer / product text.
  if (/^[\s]*[=+@\-]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}
function orderStatus(o: any): string { return String(o.fulfillmentStatus || 'new') }
function isCancelled(o: any): boolean {
  return ['cancelled', 'canceled', 'refunded'].includes(orderStatus(o))
}
function isReceived(o: any): boolean {
  return ['paid', 'received', 'success'].includes(String(o.paymentStatus || '')) && !isCancelled(o)
}
function filenameDay(v: string): string { return v.replace(/[^0-9-]/g, '') }

Page({
  data: {
    day: nowDay(), allDates: false,
    rows: [] as Array<any>, count: 0, pending: 0, delivered: 0, cancelled: 0,
    orderValue: '0.00', received: '0.00', unpaid: '0.00',
    notice: '当前仅统计本机演示订单，未接入真实支付。'
  },
  onShow() { this.refresh() },
  onPullDownRefresh() { this.refresh(); wx.stopPullDownRefresh() },
  chooseDay(e: any) { this.setData({ day: String(e.detail.value || nowDay()), allDates: false }); this.refresh() },
  selectToday() { this.setData({ day: nowDay(), allDates: false }); this.refresh() },
  selectAll() { this.setData({ allDates: true }); this.refresh() },
  matchingOrders(): any[] {
    return loadWorkflowOrders().filter(o => this.data.allDates || localDay(o.createdAt) === this.data.day)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  },
  refresh() {
    const orders = this.matchingOrders()
    let orderValue = 0, received = 0, unpaid = 0, cancelled = 0, delivered = 0
    const rows = orders.map(o => {
      const cents = amountInCents(o.totalText)
      const cancelledOrder = isCancelled(o)
      if (cancelledOrder) cancelled++
      else {
        orderValue += cents
        if (isReceived(o)) received += cents
        else unpaid += cents
      }
      if (orderStatus(o) === 'delivered') delivered++
      const items = (Array.isArray(o.items) ? o.items : []).map(i => `${i.name} ×${i.quantity}`).join('、')
      return {
        id: o.id, date: localDay(o.createdAt),
        time: (() => { const d = new Date(o.createdAt); return Number.isFinite(d.getTime()) ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : '' })(),
        name: o.receiverName || '', items, amount: yuan(cents),
        payment: isReceived(o) ? '已收款' : String(o.paymentStatus || 'unpaid') === 'unpaid' ? '未支付' : '支付状态未确认',
        status: workflowLabel(o.fulfillmentStatus), raw: o
      }
    })
    this.setData({ rows, count: orders.length, pending: orders.filter(o => orderStatus(o) === 'new').length,
      delivered, cancelled, orderValue: yuan(orderValue), received: yuan(received), unpaid: yuan(unpaid) })
  },
  exportCsv() {
    const rows = this.data.rows as Array<any>
    if (!rows.length) return wx.showToast({ title: '没有可导出的订单', icon: 'none' })
    const header = ['订单编号','下单日期','时间','顾客','商品','订单金额','支付状态','履约状态','联系电话','配送区域','地址','备注']
    const records = rows.map(r => {
      const o = r.raw
      return [r.id,r.date,r.time,r.name,r.items,r.amount,r.payment,r.status,o.phone||'',o.area||'',o.detail||'',o.note||'']
    })
    const csv = '\uFEFF' + [header,...records].map(r => r.map(csvCell).join(',')).join('\r\n')
    const filename = `stall-bills-${this.data.allDates ? 'all' : filenameDay(this.data.day)}-${Date.now()}.csv`
    const path = `${wx.env.USER_DATA_PATH}/${filename}`
    wx.getFileSystemManager().writeFile({
      filePath: path, data: csv, encoding: 'utf8',
      success: () => {
        // File sharing support varies by WeChat client; retain the saved file on failure.
        if (typeof wx.shareFileMessage === 'function') {
          wx.shareFileMessage({ filePath: path, fileName: filename,
            fail: () => wx.showModal({ title: 'CSV 已生成', content: '文件已保存在小程序本地文件目录，但当前微信环境无法分享文件。请在真机微信中再试。', showCancel: false }) })
        } else {
          wx.showModal({ title: 'CSV 已生成', content: '当前环境不支持分享文件。请使用支持文件分享的微信真机版本。', showCancel: false })
        }
      },
      fail: () => wx.showToast({ title: '导出文件失败', icon: 'none' })
    })
  }
})
