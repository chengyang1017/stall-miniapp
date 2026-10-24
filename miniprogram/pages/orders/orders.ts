import { customerOrdersConfig, customerOrdersRequest } from '../../utils/customerOrdersApi' // PHASE35_CUSTOMER_ORDERS
import { loadWorkflowOrders, chinaTime } from '../../utils/orderWorkflow'

type OrderTab = 'all' | 'unpaid' | 'active' | 'completed' | 'other'
const TABS: Array<{key: OrderTab; label: string}> = [
  { key: 'all', label: '全部' },
  { key: 'unpaid', label: '待付款' },
  { key: 'active', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'other', label: '取消/异常' }
]
function fulfillment(o: any): string { return String(o.fulfillmentStatus || 'new') }
function isOther(o: any): boolean { return ['cancelled','canceled','abnormal','exception','refunded'].indexOf(fulfillment(o)) >= 0 }
function payment(o: any): string { return String(o.paymentStatus || 'unpaid') }
function matched(o: any, tab: OrderTab): boolean {
  if (tab === 'all') return true
  if (tab === 'other') return isOther(o)
  if (tab === 'unpaid') return payment(o) !== 'paid' && !isOther(o)
  if (tab === 'completed') return fulfillment(o) === 'delivered' && !isOther(o)
  return payment(o) === 'paid' && ['new','accepted','preparing','delivering'].indexOf(fulfillment(o)) >= 0
}
function statusLabel(o: any): string {
  const st = fulfillment(o)
  if (st === 'cancelled' || st === 'canceled') return '已取消'
  if (st === 'abnormal' || st === 'exception') return '配送异常'
  if (st === 'refunded') return '已退款'
  if (st === 'delivered') return '已送达'
  if (st === 'delivering') return '配送中'
  if (st === 'preparing') return '备货中'
  if (st === 'accepted') return '已接单'
  return payment(o) === 'paid' ? '待接单' : '待支付'
}
function normalize(o: any): any {
  const status = fulfillment(o)
  const paid = payment(o) === 'paid'
  const created = String(o.createdAt || '')
  const rows = Array.isArray(o.items) ? o.items : []
  return {
    ...o,
    id: String(o.id || ''),
    statusText: statusLabel(o),
    paymentText: paid ? '已付款' : '待付款',
    createdText: created ? chinaTime(created) : '',
    showEta: status === 'delivering' && !!o.estimatedArrival,
    etaText: String(o.estimatedArrival || ''),
    itemSummary: rows.slice(0, 2).map((x: any) => String(x.name || '商品') + ' × ' + String(x.quantity || 1)).join('、') + (rows.length > 2 ? ' 等' : ''),
    totalText: String(o.totalText || '0.00'),
    other: isOther(o)
  }
}
Page({
  data: {
    tabs: TABS.map(t => ({ ...t, count: 0 })),
    activeTab: 'all' as OrderTab,
    allOrders: [] as any[],
    visibleOrders: [] as any[],
    createdId: ''
  },
  onLoad(options: Record<string, string | undefined>) {
    this.setData({ createdId: options.created || '' })
  },
  onShow() { this.refresh() },
  async refresh() {
    const cloud = customerOrdersConfig()
    if (cloud) {
      try {
        const data = await customerOrdersRequest(cloud)
        const orders = ((data && Array.isArray(data.orders)) ? data.orders : []).map((o:any)=>normalize({
          ...o, items:Array.isArray(o.items)?o.items:[], totalText:(Number(o.totalCents)/100).toFixed(2) // PHASE39_ORDER_LIST_PROOF_LINK
        }))
        this.setData({allOrders:orders,
          tabs:TABS.map(t=>({...t,count:orders.filter((o:any)=>matched(o,t.key)).length})),
          visibleOrders:orders.filter((o:any)=>matched(o,this.data.activeTab))})
      } catch (_) { this.setData({allOrders:[],visibleOrders:[],tabs:TABS.map(t=>({...t,count:0}))}); wx.showToast({title:'订单加载失败，请检查登录',icon:'none'}) }
      return
    }
    const orders = (loadWorkflowOrders() as any[]).map(normalize)
    orders.sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0))
    this.setData({
      allOrders: orders,
      tabs: TABS.map(t => ({ ...t, count: orders.filter(o => matched(o, t.key)).length })),
      visibleOrders: orders.filter(o => matched(o, this.data.activeTab))
    })
  },
  switchTab(e: any) {
    const next = String(e.currentTarget.dataset.tab || 'all') as OrderTab
    if (!TABS.some(t => t.key === next)) return
    this.setData({ activeTab: next, visibleOrders: this.data.allOrders.filter(o => matched(o, next)) })
  },
  openOrder(e: any) {
    const id = String(e.currentTarget.dataset.id || '')
    if (!id) return
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + encodeURIComponent(id) })
  }
})