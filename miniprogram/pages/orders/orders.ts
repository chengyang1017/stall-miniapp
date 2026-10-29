import { paymentLabel } from '../../modules/shared/domain/payment'
import { customerOrdersConfig, customerOrdersRequest } from '../../modules/customer/api/orders' // PHASE35_CUSTOMER_ORDERS
import { loadWorkflowOrders, chinaTime } from '../../modules/customer/demo/orders'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'

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
    paymentText: paymentLabel(o),
    createdText: created ? chinaTime(created) : '',
    showEta: status === 'delivering' && !!o.estimatedArrival,
    etaText: String(o.estimatedArrival || ''),
    itemSummary: rows.slice(0, 2).map((x: any) => String(x.name || '商品') + ' × ' + String(x.quantity || 1)).join('、') + (rows.length > 2 ? ' 等' : ''),
    totalText: String(o.totalText || '0.00'),
    other: isOther(o)
  }
}
function normalizeCloudOrder(value: unknown): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_order')
  const order = value as Record<string, unknown>
  if (typeof order.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order.id)) throw Error('invalid_order_id')
  // PostgreSQL bigint is returned as decimal text; reject coercible non-money
  // values such as null, booleans, empty text, fractions and unsafe integers.
  const raw = order.totalCents
  if (typeof raw !== 'number' && !(typeof raw === 'string' && /^\d+$/.test(raw))) throw Error('invalid_order_total')
  const cents = Number(raw)
  if (!Number.isSafeInteger(cents) || cents < 0) throw Error('invalid_order_total')
  return normalize({ ...order, id: order.id.toLowerCase(), totalText: (cents / 100).toFixed(2) })
}
Page({
  serial:0,visible:false,listContext:'',
  data: {
    cloudMode:false,loading:false,error:'',hasMore:false,nextCursor:'',
    tabs: TABS.map(t => ({ ...t, count: 0 })),
    activeTab: 'all' as OrderTab,
    allOrders: [] as any[],
    visibleOrders: [] as any[],
    entryFulfillment:'',createdId: ''
  },
  onLoad(options: Record<string, string | undefined>) {
    this.setData({ createdId: options.created || '',activeTab:TABS.some(t=>t.key===options.tab)?options.tab as OrderTab:'all',entryFulfillment:['pending','delivering','refund'].includes(options.fulfillment||'')?options.fulfillment||'':'' })
  },
  entryMatches(o:any){const filter=this.data.entryFulfillment;if(!filter)return true;const status=fulfillment(o);return filter==='pending'?payment(o)==='paid'&&['new','accepted','preparing'].includes(status):filter==='delivering'?status==='delivering':payment(o).includes('refund')||status==='refunded'},
  onShow() {
    this.visible=true
    const entry=wx.getStorageSync('stall_order_tab_entry_v1') as any
    if(entry&&typeof entry==='object'){
      wx.removeStorageSync('stall_order_tab_entry_v1')
      const tab=TABS.some(t=>t.key===entry.tab)?entry.tab as OrderTab:'all'
      const fulfillment=['pending','delivering','refund'].includes(entry.fulfillment)?entry.fulfillment:''
      this.setData({activeTab:tab,entryFulfillment:fulfillment,createdId:typeof entry.created==='string'?entry.created:''})
    }
    this.refresh()
  },
  onHide(){this.visible=false;this.serial++;if(this.data.cloudMode||customerOrdersConfig())this.setData({allOrders:[],visibleOrders:[],loading:false,nextCursor:'',hasMore:false,tabs:TABS.map(t=>({...t,count:0}))})},
  onUnload(){this.visible=false;this.serial++;this.listContext=''},
  onPullDownRefresh(){this.refresh().finally(()=>wx.stopPullDownRefresh())},
  onReachBottom(){this.loadMore()},
  syncListContext(): boolean {
    const cloud = !!customerOrdersConfig()
    const context = cloud ? 'cloud:' + supportIdentity() : 'local'
    if (context === this.listContext) return false
    const hadContext = !!this.listContext
    this.serial++
    this.listContext = context
    this.setData({cloudMode:cloud,allOrders:[],visibleOrders:[],loading:false,error:'',nextCursor:'',hasMore:false,
      tabs:TABS.map(t=>({...t,count:0})),...hadContext?{createdId:''}:{}})
    return true
  },
  currentCloudRequest(serial:number,context:string): boolean {
    if (!this.visible || serial !== this.serial) return false
    if (context !== supportIdentity()) { this.syncListContext(); return false }
    return this.listContext === 'cloud:' + context
  },
  async loadMore(){
    if (!this.visible) return
    const changed = this.syncListContext()
    if (!customerOrdersConfig()) { if (changed) await this.refresh(); return }
    if (changed) { await this.loadCloudPage(true); return }
    if (!this.data.loading && this.data.hasMore && this.data.nextCursor) await this.loadCloudPage(false)
  },
  async loadCloudPage(reset:boolean){
    if (!this.visible) return
    if (this.syncListContext()) reset = true
    const cloud=customerOrdersConfig()
    if(!cloud||(!reset&&this.data.loading))return
    const serial=reset?++this.serial:this.serial,context=supportIdentity(),tab=this.data.activeTab
    this.setData({cloudMode:true,error:'',loading:true,...reset?{allOrders:[],visibleOrders:[],nextCursor:'',hasMore:false,tabs:TABS.map(t=>({...t,count:0}))}:{}})
    try{
      const data=await customerOrdersRequest(cloud,undefined,{tab,limit:20,...!reset?{cursor:this.data.nextCursor}:{}})
      if(!this.currentCloudRequest(serial,context))return
      if(!data||!Array.isArray(data.orders)||typeof data.hasMore!=='boolean'||data.hasMore&&(typeof data.nextCursor!=='string'||!/^[A-Za-z0-9_-]{1,600}$/.test(data.nextCursor)))throw Error('invalid_order_page')
      const incoming=data.orders.map(normalizeCloudOrder)
      const orders=reset?[]:[...this.data.allOrders],seen=new Set(orders.map(o=>o.id))
      for (const order of incoming) {
        if (seen.has(order.id)) continue
        seen.add(order.id)
        orders.push(order)
      }
      this.setData({allOrders:orders,visibleOrders:orders.filter(o=>this.entryMatches(o)),hasMore:data.hasMore,nextCursor:data.hasMore?data.nextCursor:'',tabs:TABS.map(t=>({...t,count:Number(data.counts&&data.counts[t.key])||0}))})
    }catch(_){if(this.currentCloudRequest(serial,context))this.setData({error:'云端订单加载失败，请检查登录后重试；已读取的订单仍保留，未读取本机订单'})}
    finally{if(serial===this.serial)this.setData({loading:false})}
  },
  async refresh() {
    if(customerOrdersConfig()){await this.loadCloudPage(true);return}
    this.syncListContext()
    this.serial++
    this.setData({cloudMode:false,loading:false,error:'',hasMore:false,nextCursor:''})
    const orders = (loadWorkflowOrders() as any[]).map(normalize)
    orders.sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0))
    this.setData({
      allOrders: orders,
      tabs: TABS.map(t => ({ ...t, count: orders.filter(o => matched(o, t.key)).length })),
      visibleOrders: orders.filter(o => matched(o, this.data.activeTab)&&this.entryMatches(o))
    })
  },
  switchTab(e: any) {
    const next = String(e.currentTarget.dataset.tab || 'all') as OrderTab
    if (!TABS.some(t => t.key === next)) return
    const changed = this.syncListContext()
    this.setData({ activeTab: next,entryFulfillment:'' })
    if(customerOrdersConfig())this.loadCloudPage(true)
    else if(changed)this.refresh()
    else this.setData({visibleOrders:this.data.allOrders.filter(o=>matched(o,next))})
  },
  openOrder(e: any) {
    const id = String(e.currentTarget.dataset.id || '')
    if (!id) return
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + encodeURIComponent(id) })
  }
})
