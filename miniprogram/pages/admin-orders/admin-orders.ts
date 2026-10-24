import { loadWorkflowOrders, updateWorkflowOrder, workflowLabel, chinaTime } from '../../utils/orderWorkflow'
import { merchantOrderConfig, fetchMerchantOrders, updateMerchantOrder } from '../../utils/merchantOrdersCloud'
import { saveMerchantEta } from '../../utils/merchantEtaCloud' // PHASE37_ETA // PHASE36_CLOUD_MERCHANT_ORDERS

// orderStatusTabsV1: local demonstration status filters, newest first.
const orderTabs = [
  { key: 'latest', label: '最新' },
  { key: 'new', label: '待接单' },
  { key: 'accepted', label: '已接单' },
  { key: 'preparing', label: '备货中' },
  { key: 'delivering', label: '配送中' },
  { key: 'delivered', label: '已送达' },
  { key: 'other', label: '取消 / 异常' }
]
function orderState(o: any): string { return String(o.fulfillmentStatus || 'new') }
function orderSort(a: any, b: any): number {
  const ta = Date.parse(String(a.createdAt || '')) || 0
  const tb = Date.parse(String(b.createdAt || '')) || 0
  return tb - ta
}
function orderMatches(o: any, tab: string): boolean {
  if (tab === 'latest') return true
  const status = orderState(o)
  if (tab === 'other') return ['cancelled', 'canceled', 'abnormal', 'exception', 'refunded'].includes(status)
  return status === tab
}
function orderCount(orders: any[], key: string): number {
  return orders.filter(o => orderMatches(o, key)).length
}
// ORDER_SEARCH_V1: search visible fields without mutating persisted orders.
function orderSearchMatch(o: any, value: string): boolean {
  const q = String(value || '').trim().toLowerCase()
  if (!q) return true
  const fields = [o.id, o.receiverName, o.phone]
  return fields.some(v => String(v == null ? '' : v).toLowerCase().includes(q))
}
// ADMIN_ORDER_DATE_FILTER_V1
function orderDateMatches(order: any, selected: string): boolean {
  if (!selected) return true
  const raw = order.createdAt
  if (raw === undefined || raw === null || raw === '') return false
  const date = typeof raw === 'number'
    ? new Date(raw < 100000000000 ? raw * 1000 : raw)
    : new Date(raw)
  if (Number.isNaN(date.getTime())) return false
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}` === selected
}
Page({
  // ADMIN_ORDER_DATE_FILTER_V1: update only the presentation list.
  observers: {
    'searchResults, orderDateFilter': function(searchResults: any, orderDateFilter: string) {
      const result = (searchResults || []).filter((o: any) => orderDateMatches(o, orderDateFilter || ''))
      this.setData({ dateResults: result })
    }
  },
  selectOrderDate(e: any) {
    this.setData({ orderDateFilter: String(e.detail.value || '') })
  },
  // ADMIN_ORDER_TODAY_BUTTON_V1
  selectTodayOrders() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    this.setData({ orderDateFilter: `${year}-${month}-${day}` })
  },
  clearOrderDate() {
    this.setData({ orderDateFilter: '' })
  },
  data: {
    orders: [] as Array<any>,
    visibleOrders: [] as Array<any>,
    currentTab: 'latest',
    orderSearchText: '',
    searchResults: [] as Array<any>,
    orderDateFilter: '',
    dateResults: [] as Array<any>,
    orderTabs: orderTabs.map(tab => ({ ...tab, count: 0 })),
    etaInputs: {} as Record<string, string>,
    cloudMode: false, cloudError: '', cloudBusy: false
  },
  onShow() { this.refresh() },
  refresh() {
    const cfg=merchantOrderConfig()
    if(cfg){this.refreshCloud(cfg);return}
    this.setData({cloudMode:false,cloudError:''})
    const orders = loadWorkflowOrders().map(order => {
      const status = order.fulfillmentStatus || 'new'
      return {
        ...order,
        statusText: workflowLabel(status),
        issueReason: (order as any).issueReason || '',
        issueTimeText: (order as any).issueTime ? chinaTime((order as any).issueTime) : '',
        allowCancel: !['delivered', 'cancelled', 'canceled', 'abnormal'].includes(status),
        allowAbnormal: status === 'delivering',
        createdText: chinaTime(order.createdAt),
        deliveredText: order.deliveredAt ? chinaTime(order.deliveredAt) : '',
        nextStatus: ['cancelled', 'canceled', 'abnormal'].includes(status) ? '' : status === 'new' ? 'accepted' : status === 'accepted' ? 'preparing' : status === 'preparing' ? 'delivering' : status === 'delivering' ? 'delivered' : '',
        nextLabel: status === 'new' ? '接单' : status === 'accepted' ? '开始备货' : status === 'preparing' ? '开始配送' : status === 'delivering' ? '标记已送达（无照片，仅演示）' : '',
        etaValue: order.estimatedArrival || ''
      }
    })
        orders.sort(orderSort)
    this.setData({
      orders,
      visibleOrders: orders.filter(o => orderMatches(o, this.data.currentTab)),
      searchResults: orders.filter(o => orderMatches(o, this.data.currentTab)).filter(o => orderSearchMatch(o, this.data.orderSearchText)),
      orderTabs: orderTabs.map(tab => ({ ...tab, count: orderCount(orders, tab.key) }))
    })
  },
  // PHASE36_CLOUD_MERCHANT_ORDERS: preserve local filters and original order cards.
  async refreshCloud(cfg: {apiBase:string;storeSlug:string}) {
    this.setData({cloudMode:true,cloudBusy:true,cloudError:''})
    try {
      const records=await fetchMerchantOrders(cfg)
      const orders=records.map((o:any)=>{
        const status=String(o.fulfillmentStatus||'new')
        const contact=o.contactSnapshot||{}
        const slot=o.deliverySlotSnapshot||{}
        const canProceed=['new','accepted','preparing'].includes(status)
        return {...o,
          id:String(o.id),statusText:workflowLabel(status as any),
          totalText:(Number(o.totalCents||0)/100).toFixed(2),
          receiverName:String(contact.receiverName||''),phone:String(contact.phone||''),
          area:String(contact.areaId||''),detail:String(contact.detail||''),note:String(contact.note||''), // PHASE41_ORDER_NOTES
          slotText:[slot.date,slot.label,slot.start&&slot.end?slot.start+'–'+slot.end:''].filter(Boolean).join(' '),
          items:Array.isArray(o.items)?o.items:[],createdText:o.createdAt?chinaTime(String(o.createdAt)):'',
          deliveredText:o.deliveredAt?chinaTime(String(o.deliveredAt)):'',
          issueReason:String(o.issueReason||''),issueTimeText:'' /* PHASE40_ISSUE_REASON */,etaValue:String(o.estimatedArrival||''),
          allowCancel:['new','accepted','preparing'].includes(status),allowAbnormal:status==='delivering',
          nextStatus:canProceed?({new:'accepted',accepted:'preparing',preparing:'delivering'} as any)[status]:'',
          nextLabel:({new:'接单',accepted:'开始备货',preparing:'开始配送'} as any)[status]||''
        }
      }).sort(orderSort)
      this.setData({orders,cloudBusy:false,
        visibleOrders:orders.filter((o:any)=>orderMatches(o,this.data.currentTab)),
        searchResults:orders.filter((o:any)=>orderMatches(o,this.data.currentTab)).filter((o:any)=>orderSearchMatch(o,this.data.orderSearchText)),
        orderTabs:orderTabs.map(t=>({...t,count:orderCount(orders,t.key)}))})
    }catch(e:any){this.setData({orders:[],visibleOrders:[],searchResults:[],cloudBusy:false,
      cloudError:String(e?.message||'load_failed'),orderTabs:orderTabs.map(t=>({...t,count:0}))})}
  },
  // ORDER_SEARCH_V1
  orderSearchInput(e: any) {
    const orderSearchText = String(e.detail.value || '')
    const searchResults = this.data.orders
      .filter((o: any) => orderMatches(o, this.data.currentTab))
      .filter((o: any) => orderSearchMatch(o, orderSearchText))
    this.setData({ orderSearchText, searchResults })
  },
  clearOrderSearch() {
    const searchResults = this.data.orders.filter((o: any) => orderMatches(o, this.data.currentTab))
    this.setData({ orderSearchText: '', searchResults })
  },
  switchOrderTab(e: any) {
    const tab = String(e.currentTarget.dataset.tab || 'latest')
    if (!orderTabs.some(item => item.key === tab)) return
    this.setData({
      currentTab: tab,
      visibleOrders: this.data.orders.filter((o: any) => orderMatches(o, tab)),
      searchResults: this.data.orders.filter((o: any) => orderMatches(o, tab)).filter((o: any) => orderSearchMatch(o, this.data.orderSearchText))
    })
  },
  // stallCancelExceptionV1: demo-only cancellation and delivery issue recording.
  recordOrderIssue(e: any) {
    if(this.data.cloudMode){this.recordCloudIssue(e);return}
    const id = String(e.currentTarget.dataset.id || '')
    const type = String(e.currentTarget.dataset.type || '')
    if (type !== 'cancelled' && type !== 'abnormal') return
    const currentOrder = loadWorkflowOrders().find(o => o.id === id) as any
    if (!currentOrder) return
    const current = String(currentOrder.fulfillmentStatus || 'new')
    if (['delivered', 'cancelled', 'canceled', 'abnormal'].includes(current)) {
      wx.showToast({ title: '当前订单不可操作', icon: 'none' }); return
    }
    if (type === 'abnormal' && current !== 'delivering') {
      wx.showToast({ title: '仅配送中可标记异常', icon: 'none' }); return
    }
    wx.showModal({
      title: type === 'cancelled' ? '取消订单' : '记录配送异常',
      content: type === 'cancelled' ? '请填写取消原因（本地演示）' : '请填写配送异常原因（本地演示）',
      editable: true,
      placeholderText: '请输入原因',
      success: (result: any) => {
        if (!result.confirm) return
        const reason = String(result.content || '').trim()
        if (!reason || reason.length > 200) {
          wx.showToast({ title: '原因需为1至200字', icon: 'none' }); return
        }
        const orders = loadWorkflowOrders() as any[]
        const target = orders.find(o => o.id === id)
        if (!target || String(target.fulfillmentStatus || 'new') !== current) {
          wx.showToast({ title: '订单状态已变化', icon: 'none' }); this.refresh(); return
        }
        target.fulfillmentStatus = type
        target.issueReason = reason
        target.issueTime = new Date().toISOString()
        try {
          wx.setStorageSync('stall_demo_orders_v1', orders)
          this.refresh()
          wx.showToast({ title: '状态已记录', icon: 'success' })
        } catch (_error) {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  },
  recordCloudIssue(e:any){
    const cfg=merchantOrderConfig()
    const id=String(e.currentTarget.dataset.id||'')
    const type=String(e.currentTarget.dataset.type||'')
    if(!cfg||!['cancelled','abnormal'].includes(type))return
    wx.showModal({title:type==='cancelled'?'取消订单':'记录配送异常',editable:true,placeholderText:'请输入原因',
      success:async (result:any)=>{
        if(!result.confirm)return
        const reason=String(result.content||'').trim()
        if(!reason||reason.length>200)return wx.showToast({title:'原因需为1至200字',icon:'none'})
        try{await updateMerchantOrder(cfg,id,type,reason);this.refresh()}
        catch(e:any){wx.showModal({title:'操作失败',content:String(e?.message||'request_failed'),showCancel:false})}
      }})
  },
  etaInput(e: any) {
    const id = String(e.currentTarget.dataset.id)
    this.setData({ [`etaInputs.${id}`]: String(e.detail.value) })
  },
  saveEta(e: any) {
    if(this.data.cloudMode){
      const id=String(e.currentTarget.dataset.id||'')
      const value=String(this.data.etaInputs[id]!==undefined?this.data.etaInputs[id]:(this.data.orders.find((o:any)=>o.id===id)||{}).etaValue||'').trim()
      if(value.length>60)return wx.showToast({title:'预计时间过长',icon:'none'})
      saveMerchantEta(id,value).then(()=>{this.refresh();wx.showToast({title:'预计时间已保存',icon:'success'})})
        .catch((err:any)=>wx.showModal({title:'保存失败',content:String(err?.message||'request_failed'),showCancel:false}))
      return
    }
    const id = String(e.currentTarget.dataset.id)
    const value = (this.data.etaInputs[id] !== undefined ? this.data.etaInputs[id] : (this.data.orders.find((o: any) => o.id === id) || {}).etaValue || '').trim()
    if (!updateWorkflowOrder(id, 'eta', value)) return wx.showToast({ title: '当前状态不可设置预计时间', icon: 'none' })
    this.refresh()
    wx.showToast({ title: '预计时间已保存' })
  },
  async nextCloud(e:any){
    const cfg=merchantOrderConfig()
    const id=String(e.currentTarget.dataset.id||'')
    const status=String(e.currentTarget.dataset.status||'')
    if(!cfg||!['accepted','preparing','delivering'].includes(status))return
    try{await updateMerchantOrder(cfg,id,status);this.refresh()}
    catch(e:any){wx.showModal({title:'操作失败',content:String(e?.message||'request_failed'),showCancel:false})}
  },
  next(e: any) {
    if(this.data.cloudMode){this.nextCloud(e);return}
    const id = String(e.currentTarget.dataset.id)
    const status = String(e.currentTarget.dataset.status)
    if (!['accepted', 'preparing', 'delivering', 'delivered'].includes(status)) return
    const execute = () => {
      if (!updateWorkflowOrder(id, status as any)) return wx.showToast({ title: '订单状态已变化', icon: 'none' })
      this.refresh()
      wx.showToast({ title: '演示状态已更新' })
    }
    if (status === 'delivered') {
      wx.showToast({ title: '请进入送达照片页面完成配送', icon: 'none' })
      return
      wx.showModal({ title: '仅供流程演示', content: '此阶段尚未上传送达照片。该状态只是本地演示，不代表真实交付。', success: r => { if (r.confirm) execute() } })
    } else execute()
  }
})
