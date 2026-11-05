import { customerOrdersConfig, customerOrdersRequest } from '../../modules/customer/api/orders'
import { sandboxPaymentRequest } from '../../modules/shared/api/sandboxPayment'
import { sandboxPaymentView, sandboxReceiptText } from '../../modules/shared/domain/sandboxPayment'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Page({
  visible:false,
  serial:0,
  data:{
    loading:false,error:'',receipts:[] as any[],
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
    const content=receipt?sandboxReceiptText(receipt):''
    if(!content)return
    wx.setClipboardData({data:content,fail:()=>wx.showToast({title:'复制失败，请重试',icon:'none'})})
  },
  async loadPage(reset:boolean){
    if(!this.visible||this.data.loading&&!reset)return
    const cfg=customerOrdersConfig(),identity=supportIdentity(),serial=++this.serial
    if(reset)this.setData({loading:false,error:'',receipts:[],nextCursor:'',hasMore:false,scanned:0,partial:false})
    if(!cfg){this.setData({error:'当前未连接云端店铺，无法读取测试小票'});return}
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
      // Limit requests: four concurrently, never request receipts for unpaid orders.
      const eligible=orders.filter((o:any)=>['paid','partially_refunded','refunded'].includes(o.paymentStatus))
      for(let offset=0;offset<eligible.length;offset+=4){
        const group=await Promise.all(eligible.slice(offset,offset+4).map(async(o:any)=>{
          try{
            const response=await sandboxPaymentRequest(cfg,o.id)
            return {order:o,receipts:sandboxPaymentView(response).receipts}
          }catch(_){return null}
        }))
        if(!current())return
        for(const item of group){
          if(!item){incomplete=true;continue}
          for(const receipt of item.receipts){
            if(receipt.sandbox!==true||receipt.orderId!==item.order.id||!receipt.id||!receipt.sha256)continue
            found.push({...receipt,orderId:item.order.id})
          }
        }
      }
      if(!current())return
      const prior=reset?[]:this.data.receipts
      const seen=new Set(prior.map((r:any)=>r.id))
      const combined=[...prior]
      for(const receipt of found)if(!seen.has(receipt.id)){seen.add(receipt.id);combined.push(receipt)}
      this.setData({receipts:combined,hasMore:result.hasMore,nextCursor:result.hasMore?result.nextCursor:'',
        scanned:(reset?0:this.data.scanned)+orders.length,partial:(reset?false:this.data.partial)||incomplete,
        error:incomplete?'部分小票暂无法读取，请稍后刷新核对':''})
    }catch(_){
      if(current())this.setData({error:'小票列表读取失败，请检查网络或登录状态后刷新'})
    }finally{if(current())this.setData({loading:false})}
  }
})
