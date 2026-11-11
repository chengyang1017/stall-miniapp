import { customerOrdersConfig, customerOrdersRequest } from '../../modules/customer/api/orders'
import { sandboxPaymentRequest } from '../../modules/shared/api/sandboxPayment'
import { sandboxPaymentView, sandboxReceiptText } from '../../modules/shared/domain/sandboxPayment'
import { fetchWechatLiveReceipt, formatWechatLiveReceipt, WechatLiveReceipt } from '../../modules/shared/api/wechatLiveReceipt'
import { LIVE_WECHAT_PAY_ENABLED, PAYMENT_SANDBOX_UI_ENABLED } from '../../config/cloud'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const liveMode=LIVE_WECHAT_PAY_ENABLED
const sandboxMode=!liveMode&&PAYMENT_SANDBOX_UI_ENABLED
const cash=(cents:number)=>(cents/100).toFixed(2)

function verifiedLiveDisplay(receipt:WechatLiveReceipt,sha256:string,orderId:string):any|null{
  if(receipt?.type!=='wechat_payment_record'||receipt.provider!=='wechatpay:live'||receipt.invoice!==false||
     receipt.orderId!==orderId||!uuid.test(orderId)||!/^[a-f0-9]{64}$/.test(sha256)||!Array.isArray(receipt.lines))return null
  const moneyFields=[receipt.subtotalCents,receipt.deliveryFeeCents,receipt.totalCents,receipt.refundedCents,receipt.refundPendingCents,receipt.netCents]
  if(!moneyFields.every(n=>Number.isSafeInteger(n)&&n>=0))return null
  return {...receipt,id:receipt.orderId,sha256,sandbox:false,channelText:'微信支付',
    totalText:cash(receipt.totalCents),subtotalText:cash(receipt.subtotalCents),
    deliveryFeeText:cash(receipt.deliveryFeeCents),refundedText:cash(receipt.refundedCents),
    refundPendingText:cash(receipt.refundPendingCents),netText:cash(receipt.netCents),
    items:receipt.lines.map(line=>({...line,lineTotalText:cash(line.lineCents)}))}
}

Page({
  visible:false,
  serial:0,
  data:{
    liveMode,sandboxMode,loading:false,error:'',receipts:[] as any[],
    nextCursor:'',hasMore:false,scanned:0,partial:false
  },
  onShow(){this.visible=true;this.loadPage(true)},
  onHide(){this.visible=false;this.serial++;this.setData({loading:false,receipts:[],nextCursor:'',hasMore:false})},
  onUnload(){this.visible=false;this.serial++},
  onPullDownRefresh(){this.loadPage(true).finally(()=>wx.stopPullDownRefresh())},
  onReachBottom(){this.loadMore()},
  loadMore(){if(this.visible&&!this.data.loading&&this.data.hasMore)this.loadPage(false)},
  openOrder(e:any){
    const id=String(e.currentTarget.dataset.order||'')
    if(uuid.test(id))wx.navigateTo({url:'/pages/order-detail/order-detail?id='+encodeURIComponent(id)})
  },
  copyReceipt(e:any){
    if(!this.visible)return
    const id=String(e.currentTarget.dataset.id||'')
    const receipt=this.data.receipts.find((r:any)=>r.id===id)
    if(!receipt)return
    // Never relabel a Sandbox simulation as a real payment record.
    const content=receipt.sandbox===true?(sandboxMode?sandboxReceiptText(receipt):''):
      liveMode&&receipt.provider==='wechatpay:live'&&receipt.invoice===false&&receipt.orderId===id&&/^[a-f0-9]{64}$/.test(receipt.sha256||'')
        ?formatWechatLiveReceipt(receipt as WechatLiveReceipt):''
    if(!content)return
    wx.setClipboardData({data:content,fail:()=>wx.showToast({title:'复制失败，请重试',icon:'none'})})
  },
  async loadPage(reset:boolean){
    if(!this.visible||this.data.loading&&!reset)return
    const cfg=customerOrdersConfig(),identity=supportIdentity(),serial=++this.serial
    if(reset)this.setData({loading:false,error:'',receipts:[],nextCursor:'',hasMore:false,scanned:0,partial:false})
    if(!liveMode&&!sandboxMode){this.setData({error:'电子小票功能尚未开放，请在订单详情查看付款状态'});return}
    if(!cfg){this.setData({error:'当前未连接云端店铺，无法读取电子小票'});return}
    const cursor=reset?'':this.data.nextCursor
    if(!reset&&!cursor)return
    const current=()=>this.visible&&serial===this.serial&&identity===supportIdentity()
    this.setData({loading:true,error:''})
    try{
      const result=await customerOrdersRequest(cfg,undefined,{tab:'all',limit:20,...cursor?{cursor}:{}})
      if(!current())return
      if(!Array.isArray(result?.orders)||typeof result.hasMore!=='boolean'||
        result.hasMore&&(typeof result.nextCursor!=='string'||result.nextCursor.length>600))throw Error('invalid_orders_page')
      const orders=result.orders.filter((o:any)=>uuid.test(o?.id||''))
      const found:any[]=[]
      let incomplete=false
      // Read no more than four verified receipts at once, never request unpaid orders.
      // The server always verifies customer ownership and payment provenance.
      const eligible=orders.filter((o:any)=>['paid','partially_refunded','refunded'].includes(o.paymentStatus)&&
        (liveMode?o.paymentSource==='wechatpay:live':o.paymentSource==='stripe:sandbox'))
      for(let offset=0;offset<eligible.length;offset+=4){
        const group=await Promise.all(eligible.slice(offset,offset+4).map(async(o:any)=>{
          try{
            if(liveMode){
              const result=await fetchWechatLiveReceipt(cfg,o.id)
              const view=verifiedLiveDisplay(result.receipt,result.sha256,o.id)
              return view?[view]:null
            }
            const result=await sandboxPaymentRequest(cfg,o.id)
            return sandboxPaymentView(result).receipts.filter((r:any)=>
              r.sandbox===true&&r.orderId===o.id&&r.id&&/^[a-f0-9]{64}$/.test(r.sha256||''))
          }catch(_){return null}
        }))
        if(!current())return
        for(const groupReceipts of group){
          if(!groupReceipts){incomplete=true;continue}
          found.push(...groupReceipts)
        }
      }
      if(!current())return
      const prior=reset?[]:this.data.receipts
      const seen=new Set(prior.map((r:any)=>r.id))
      const combined=[...prior]
      for(const receipt of found)if(!seen.has(receipt.id)){seen.add(receipt.id);combined.push(receipt)}
      this.setData({receipts:combined,hasMore:result.hasMore,nextCursor:result.hasMore?result.nextCursor:'',
        scanned:(reset?0:this.data.scanned)+orders.length,partial:(reset?false:this.data.partial)||incomplete,
        error:incomplete?'部分电子小票暂无法核验，请稍后刷新核对':''})
    }catch(_){
      if(current())this.setData({error:'电子小票列表读取失败，请检查网络或登录状态后刷新'})
    }finally{if(current())this.setData({loading:false})}
  }
})
