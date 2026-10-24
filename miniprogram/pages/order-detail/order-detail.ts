import { cloudProofUrl } from '../../utils/cloudProofRead' // PHASE38_PROOF_READ
import { customerOrdersConfig, customerOrdersRequest } from '../../utils/customerOrdersApi' // PHASE35_CUSTOMER_ORDERS
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
  async onShow() {
    const id = String(this.data.order.id || '')
    const cloud=customerOrdersConfig()
    if (cloud) {
      this.setData({found:false})
      try {
        const result=await customerOrdersRequest(cloud,id)
        const o=result.order || {}
        const address=o.contactSnapshot || {}
        const slot=o.deliverySlotSnapshot || {}
        const items=(Array.isArray(result.items)?result.items:[]).map((i:any)=>({
          ...i,subtotal:(Number(i.lineTotalCents)/100).toFixed(2)
        }))
        const st=String(o.fulfillmentStatus||'new')
        const paid=o.paymentStatus==='paid'
        this.setData({found:true,order:{...o,receiverName:address.receiverName||'',phone:address.phone||'',
          area:address.areaId||'',detail:address.detail||'',note:String(address.note||''), /* PHASE41_ORDER_NOTES */slotText:[slot.date,slot.label,slot.start,slot.end].filter(Boolean).join(' '),
          totalText:(Number(o.totalCents)/100).toFixed(2)},items,
          statusText:!paid&&st==='new'?'待支付':workflowText(st),paymentText:paid?'已付款':'待付款',
          createdText:o.createdAt?chinaTime(o.createdAt):'',deliveredText:o.deliveredAt?chinaTime(o.deliveredAt):'',
          issueText:String(o.issueReason||''),proofImage:'' /* PHASE40_ISSUE_REASON */})
        if(String(o.fulfillmentStatus||'')==='delivered'){
          cloudProofUrl(cloud.apiBase,cloud.storeSlug,id,false).then((url:string)=>{
            if(String(this.data.order.id||'')===id)this.setData({proofImage:url})
          }).catch(()=>{})
        }
      }catch(_){this.setData({found:false});wx.showToast({title:'订单详情加载失败',icon:'none'})}
      return
    }
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