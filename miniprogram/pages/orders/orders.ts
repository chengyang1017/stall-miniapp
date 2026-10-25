import { customerOrdersConfig, customerOrdersRequest } from '../../utils/customerOrdersApi' // PHASE35_CUSTOMER_ORDERS
import { loadWorkflowOrders, chinaTime } from '../../utils/orderWorkflow'
import { supportIdentity } from '../../utils/supportCloud'

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
  return ({unpaid:'待支付',paid:'待接单',refunded:'已退款',partially_refunded:'部分退款'} as Record<string,string>)[payment(o)]||'状态待核实'
}
function normalize(o: any): any {
  const status = fulfillment(o)
  const created = String(o.createdAt || '')
  const rows = Array.isArray(o.items) ? o.items : []
  const publicOrder={...o};delete publicOrder.merchantNote;delete publicOrder.merchantNoteVersion
  return {
    ...publicOrder,
    id: String(o.id || ''),
    statusText: statusLabel(o),
    paymentText: ({unpaid:'待付款',paid:'已付款',refunded:'已退款',partially_refunded:'部分退款'} as Record<string,string>)[payment(o)]||'支付状态待核实',
    createdText: created ? chinaTime(created) : '',
    showEta: status === 'delivering' && !!o.estimatedArrival,
    etaText: String(o.estimatedArrival || ''),
    itemSummary: rows.slice(0, 2).map((x: any) => String(x.name || '商品') + ' × ' + String(x.quantity || 1)).join('、') + (rows.length > 2 ? ' 等' : ''),
    totalText: String(o.totalText || '0.00'),
    other: isOther(o)
  }
}
Page({
  serial:0,visible:false,
  data: {
    cloudMode:false,loading:false,error:'',hasMore:false,nextCursor:'',
    tabs: TABS.map(t => ({ ...t, count: 0 })),
    activeTab: 'all' as OrderTab,
    allOrders: [] as any[],
    visibleOrders: [] as any[],
    createdId: ''
  },
  onLoad(options: Record<string, string | undefined>) {
    this.setData({ createdId: options.created || '' })
  },
  onShow() {this.visible=true;this.refresh()},
  onHide(){this.visible=false;this.serial++;if(customerOrdersConfig())this.setData({allOrders:[],visibleOrders:[],loading:false,nextCursor:'',hasMore:false,tabs:TABS.map(t=>({...t,count:0}))})},
  onUnload(){this.visible=false;this.serial++},
  onPullDownRefresh(){this.refresh().finally(()=>wx.stopPullDownRefresh())},
  onReachBottom(){this.loadMore()},
  async loadMore(){if(customerOrdersConfig()&&!this.data.loading&&this.data.hasMore&&this.data.nextCursor)await this.loadCloudPage(false)},
  async loadCloudPage(reset:boolean){
    const cloud=customerOrdersConfig()
    if(!cloud||(!reset&&this.data.loading))return
    const serial=reset?++this.serial:this.serial,context=supportIdentity(),tab=this.data.activeTab
    this.setData({cloudMode:true,error:'',loading:true,...reset?{allOrders:[],visibleOrders:[],nextCursor:'',hasMore:false,tabs:TABS.map(t=>({...t,count:0}))}:{}})
    try{
      const data=await customerOrdersRequest(cloud,undefined,{tab,limit:20,...!reset?{cursor:this.data.nextCursor}:{}})
      if(!this.visible||serial!==this.serial||context!==supportIdentity())return
      if(!data||!Array.isArray(data.orders)||typeof data.hasMore!=='boolean'||data.hasMore&&typeof data.nextCursor!=='string')throw Error('invalid_order_page')
      const incoming=data.orders.map((o:any)=>normalize({...o,totalText:(Number(o.totalCents)/100).toFixed(2)}))
      const base=reset?[]:this.data.allOrders,seen=new Set(base.map(o=>o.id))
      const orders=base.concat(incoming.filter((o:any)=>!seen.has(o.id)))
      this.setData({allOrders:orders,visibleOrders:orders,hasMore:data.hasMore,nextCursor:data.nextCursor||'',tabs:TABS.map(t=>({...t,count:Number(data.counts&&data.counts[t.key])||0}))})
    }catch(_){if(this.visible&&serial===this.serial&&context===supportIdentity())this.setData({error:'云端订单加载失败，请检查登录后重试；已读取的订单仍保留，未读取本机订单'})}
    finally{if(serial===this.serial)this.setData({loading:false})}
  },
  async refresh() {
    if(customerOrdersConfig()){await this.loadCloudPage(true);return}
    this.serial++
    this.setData({cloudMode:false,loading:false,error:'',hasMore:false,nextCursor:''})
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
    this.setData({ activeTab: next })
    if(customerOrdersConfig())this.loadCloudPage(true)
    else this.setData({visibleOrders:this.data.allOrders.filter(o=>matched(o,next))})
  },
  openOrder(e: any) {
    const id = String(e.currentTarget.dataset.id || '')
    if (!id) return
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + encodeURIComponent(id) })
  }
})
