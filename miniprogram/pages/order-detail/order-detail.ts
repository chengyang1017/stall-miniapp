import { paymentLabel } from '../../modules/shared/domain/payment'
import { createSandboxCheckout, SandboxChannel } from '../../modules/customer/api/sandboxPayment'
import { sandboxPaymentRequest } from '../../modules/shared/api/sandboxPayment'
import { sandboxPaymentView, sandboxReceiptText } from '../../modules/shared/domain/sandboxPayment'
import { supportKey } from '../../modules/shared/domain/support'
import { proofUrl } from '../../modules/customer/api/proof' // PHASE38_PROOF_READ
import { customerOrdersConfig, customerOrdersRequest,stagingOrderPayment } from '../../modules/customer/api/orders' // PHASE35_CUSTOMER_ORDERS
import { loadWorkflowOrders, chinaTime } from '../../modules/customer/demo/orders'
import { cloudIdentity as supportIdentity, getCloudContext } from '../../modules/shared/runtime/context'
function workflowText(st: string): string {
  const labels: {[key: string]: string} = {new:'待接单',accepted:'已接单',preparing:'备货中',delivering:'配送中',delivered:'已送达',cancelled:'已取消',canceled:'已取消',abnormal:'配送异常',exception:'配送异常',refunded:'已退款'}
  return labels[st] || '待接单'
}
Page({
  sandboxPollTimer:null as ReturnType<typeof setTimeout>|null,
  sandboxPollRemaining:0,
  stopSandboxPolling(message=''){
    if(this.sandboxPollTimer){clearTimeout(this.sandboxPollTimer);this.sandboxPollTimer=null}
    this.sandboxPollRemaining=0
    this.setData({sandboxPollText:message})
  },
  scheduleSandboxPolling(){
    if(this.sandboxPollTimer){clearTimeout(this.sandboxPollTimer);this.sandboxPollTimer=null}
    if(!this.detailVisible||this.phoneReadOnly||!this.data.cloudMode)return
    const attempts=this.data.sandbox?.attempts||[]
    const latest=attempts[attempts.length-1]
    // Only the server can confirm payment. A Checkout URL or return to the
    // mini program never means that Stripe has collected the money.
    if(this.data.order.paymentStatus!=='unpaid'){
      this.stopSandboxPolling(this.data.order.paymentStatus==='paid'?'服务端已确认测试付款':'')
      return
    }
    if(!latest||!['creating','open','processing'].includes(latest.status)){
      this.stopSandboxPolling(latest?.status==='review'?'支付结果需要人工核查，请勿重复付款':'')
      return
    }
    if(this.sandboxPollRemaining<=0){
      this.stopSandboxPolling('自动查询已结束；可手动刷新支付状态')
      return
    }
    this.setData({sandboxPollText:'正在自动核对 Stripe Sandbox 付款结果…'})
    const identity=supportIdentity(),serial=this.detailSerial,id=String(this.data.order.id)
    this.sandboxPollTimer=setTimeout(()=>{
      this.sandboxPollTimer=null
      if(!this.detailVisible||serial!==this.detailSerial||identity!==supportIdentity()||id!==String(this.data.order.id))return
      this.sandboxPollRemaining--
      this.loadSandboxPayment()
    },5000)
  },
  togglePaymentHistory(){this.setData({paymentHistoryExpanded:!this.data.paymentHistoryExpanded})},
  toggleReceiptDetails(e:any){
    const id=String(e.currentTarget.dataset.id||'')
    if(!id||!this.data.sandbox?.receipts?.some((r:any)=>r.id===id))return
    this.setData({receiptExpandedId:this.data.receiptExpandedId===id?'':id})
  },
  copySandboxReceipt(e:any){
    if(!this.detailVisible||this.phoneReadOnly)return
    const id=String(e.currentTarget.dataset.id||'')
    const receipt=this.data.sandbox?.receipts?.find((r:any)=>r.id===id&&r.orderId===this.data.order.id)
    const content=receipt?sandboxReceiptText(receipt):''
    if(!content)return
    wx.setClipboardData({data:content,fail:()=>wx.showToast({title:'复制小票失败，请重试',icon:'none'})})
  },
  async loadSandboxPayment(){
    const cfg=customerOrdersConfig(),serial=this.detailSerial,identity=supportIdentity(),id=String(this.data.order.id)
    if(!cfg||this.phoneReadOnly)return
    try{const result=await sandboxPaymentRequest(cfg,id)
      if(!this.detailVisible||serial!==this.detailSerial||identity!==supportIdentity())return
      const latest=await customerOrdersRequest(cfg,id)
      if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity()){
        this.setData({sandbox:sandboxPaymentView(result),sandboxUnavailable:false,sandboxError:'',
         order:{...this.data.order,paymentStatus:latest.order.paymentStatus,paymentSource:latest.order.paymentSource},paymentText:paymentLabel(latest.order)})
        this.scheduleSandboxPolling()
      }
    }catch(error:any){if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity()){
      const reason=String(error?.message||error)
      const unavailable=/^http_404(?:_|$)/.test(reason)
      this.setData({sandbox:null,sandboxUnavailable:unavailable,sandboxError:unavailable
        ?'当前店铺尚未接通 Stripe Sandbox 测试服务，不能创建测试付款链接；请由管理员完成隔离环境配置。'
        :'Sandbox 支付状态尚未核实，请检查网络或服务端配置后刷新；不要重复付款'})
    }}
  },
  copyActiveSandboxCheckout(){
    if(!this.detailVisible||this.phoneReadOnly||this.data.order.paymentStatus!=='unpaid')return
    const url=this.data.sandbox?.resumeCheckout?.url
    if(typeof url!=='string'||!/^https:\/\/checkout\.stripe\.com\//.test(url))return
    wx.setClipboardData({data:url,fail:()=>wx.showToast({title:'复制付款链接失败',icon:'none'})})
  },
  sandboxKeys:{} as Record<string,string>,sandboxBusy:false,
  async confirmSandboxChange(){
    return new Promise<boolean>(resolve=>wx.showModal({
      title:'更换测试支付方式',
      content:'将先向 Stripe 核验并取消当前未付款会话。只有确认取消后才能创建新渠道的测试链接；若已收款或结果未确认，不会再次发起付款。',
      confirmText:'确认更换',cancelText:'返回',
      success:(r:any)=>resolve(r.confirm===true),fail:()=>resolve(false)
    }))
  },
  async cancelSandboxPayment(){
    const cfg=customerOrdersConfig(),serial=this.detailSerial,identity=supportIdentity(),id=String(this.data.order.id)
    if(!cfg||this.phoneReadOnly||this.sandboxBusy||!this.detailVisible)return
    const confirmed=await this.confirmSandboxChange()
    if(!confirmed||!this.detailVisible||serial!==this.detailSerial||identity!==supportIdentity())return
    this.stopSandboxPolling()
    this.sandboxBusy=true
    const current=()=>this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity()&&id===String(this.data.order.id)
    this.setData({sandboxActionBusy:true,sandboxError:'',sandboxActionText:'正在核验并取消原测试付款…'})
    try{
      await sandboxPaymentRequest(cfg,id,false,'sandbox-cancel')
      if(!current())return
      await this.loadSandboxPayment()
      if(!current())return
      if(this.data.sandbox?.resumeCheckout||this.data.sandbox?.stale||this.data.order.paymentStatus!=='unpaid'){
        this.setData({sandboxActionText:'付款状态已变化，请查看最新结果后再操作'})
        return
      }
      this.setData({sandboxActionText:'原测试付款已取消，现在可选择其他方式'})
    }catch(_){
      if(current())this.setData({sandboxActionText:'',sandboxError:'取消结果未确认，不能更换渠道。请先刷新付款状态'})
    }finally{
      this.sandboxBusy=false
      if(current())this.setData({sandboxActionBusy:false})
    }
  },
  async switchSandboxChannel(e:any){
    const cfg=customerOrdersConfig(),id=String(this.data.order.id),channel=String(e.currentTarget.dataset.channel||'') as SandboxChannel
    const serial=this.detailSerial,identity=supportIdentity()
    if(!cfg||!['card','alipay','wechat_pay'].includes(channel)||this.phoneReadOnly||!this.detailVisible||this.sandboxBusy||this.data.order.paymentStatus!=='unpaid'||!this.data.sandbox?.resumeCheckout)return
    if(channel===this.data.sandbox.resumeCheckout.channel){this.copyActiveSandboxCheckout();return}
    if(!await this.confirmSandboxChange())return
    const current=()=>this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity()&&id===String(this.data.order.id)
    if(!current())return
    this.stopSandboxPolling()
    this.sandboxBusy=true
    this.setData({sandboxActionBusy:true,sandboxError:'',sandboxActionText:'正在核验并取消原测试付款…'})
    try{
      await sandboxPaymentRequest(cfg,id,false,'sandbox-cancel')
      if(!current())return
      await this.loadSandboxPayment()
      if(!current())return
      if(this.data.sandbox?.stale||this.data.sandbox?.resumeCheckout||this.data.order.paymentStatus!=='unpaid'||
         (this.data.sandbox?.attempts||[]).some((a:any)=>['creating','open','processing','review'].includes(a.status))){
        this.setData({sandboxActionText:'付款状态仍待核对，未创建新付款链接'})
        return
      }
      this.setData({sandboxActionText:'原付款已取消，正在准备新渠道…'})
      // Keep the same operation lock while switching to prevent double taps.
      await this.createSandboxCheckoutLink(cfg,id,channel,current)
    }catch(_){
      if(current())this.setData({sandboxActionText:'',sandboxError:'更换结果未确认，请先刷新状态，不要重复付款'})
    }finally{
      this.sandboxBusy=false
      if(current())this.setData({sandboxActionBusy:false})
    }
  },
  async createSandboxCheckoutLink(cfg:any,id:string,channel:SandboxChannel,current:()=>boolean){
    const identity=supportIdentity(),key=[identity,id,channel].join(':')
    if(!this.sandboxKeys[key])this.sandboxKeys[key]='sandbox_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)
    const url=await createSandboxCheckout(cfg,id,channel,this.sandboxKeys[key])
    if(!current())return
    this.setData({sandboxActionText:'测试链接已准备，复制后请使用外部浏览器打开'})
    wx.showModal({title:'Stripe Sandbox 外部测试',content:'这不是小程序原生付款。请复制链接至外部浏览器测试，返回订单页后以服务端查询结果为准。',confirmText:'复制链接',success:(r:any)=>{
      if(r.confirm&&current())wx.setClipboardData({data:url})
    }})
  },
  retrySandboxCheckout(){
    const channel=this.data.sandbox?.retryChannel
    if(!['card','alipay','wechat_pay'].includes(channel))return
    this.openSandboxCheckout({currentTarget:{dataset:{channel}}})
  },
  async openSandboxCheckout(e:any){
    const cfg=customerOrdersConfig(),channel=e.currentTarget.dataset.channel as SandboxChannel
    if(!cfg||this.phoneReadOnly||this.sandboxBusy||this.data.sandboxActionBusy||!this.detailVisible||this.data.order.paymentStatus!=='unpaid'||this.data.sandboxUnavailable)return
    if(this.data.sandbox?.resumeCheckout){
      wx.showToast({title:'请先继续原付款或更换渠道',icon:'none'});return
    }
    // After a failed, expired or cancelled Checkout create a new attempt.
    // A processing or review attempt is never a safe retry point.
    if(this.data.sandbox?.requiresPaymentReview){
      wx.showToast({title:'付款状态待核对，暂不可重试',icon:'none'});return
    }
    const attempt=(this.data.sandbox?.attempts||[]).slice(-1)[0]
    if(this.data.sandbox?.stale||attempt&&['creating','open','processing','review'].includes(attempt.status)){
      wx.showToast({title:'原付款结果待核对，请先刷新',icon:'none'});return
    }
    const identity=supportIdentity(),serial=this.detailSerial,id=String(this.data.order.id)
    const current=()=>this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity()&&id===String(this.data.order.id)
    this.stopSandboxPolling()
    this.sandboxBusy=true
    this.setData({sandboxActionBusy:true,sandboxActionText:'正在准备测试付款链接…'})
    try{
      await this.createSandboxCheckoutLink(cfg,id,channel,current)
    }catch(_){
      if(current())this.setData({sandboxActionText:'',sandboxError:'测试入口不可用或结果未知，请刷新订单再试'})
    }finally{
      this.sandboxBusy=false
      if(current()){
        this.setData({sandboxActionBusy:false})
        this.sandboxPollRemaining=12
        await this.loadSandboxPayment()
      }
    }
  },
  phoneReadOnly:false,detailSerial:0,detailVisible:false,detailContext:'',simulationKey:'',simulationOperation:0,
  data: { sandbox:null as any,receiptExpandedId:'',paymentHistoryExpanded:false,sandboxError:'',sandboxPollText:'',sandboxActionBusy:false,sandboxActionText:'',sandboxChannel:'card',sandboxUnavailable:false,phoneReadOnly:false,simulationAuthorized:false,simulationEligible:false,simulationBusy:false,simulationError:'', found: false, detailLoading:false,detailError:'',detailNotFound:false, order: {} as any, items: [] as any[], statusText: '', paymentText: '', createdText: '', deliveredText: '', issueText: '', proofImage: '',proofError:'',proofLoading:false,cloudMode:false },
  onLoad(options: Record<string, string | undefined>) {
    this.phoneReadOnly=options.phone==='1'
    this.setData({phoneReadOnly:this.phoneReadOnly})
    if(['card','alipay','wechat_pay'].includes(options.sandboxChannel||''))this.setData({sandboxChannel:options.sandboxChannel})
    this.setData({ order: { id: options.id || '' } })
  },
  reloadOrderDetail(){if(this.detailVisible&&!this.data.detailLoading)this.onShow()},
  async onShow() {
    this.stopSandboxPolling()
    this.sandboxPollRemaining=12
    this.detailVisible=true;const serial=++this.detailSerial,identity=supportIdentity()
    const id = String(this.data.order.id || '')
    const cloud=customerOrdersConfig()
    this.setData({detailLoading:true,detailError:'',detailNotFound:false})
    if(this.detailContext!==JSON.stringify([identity,id])){this.detailContext=JSON.stringify([identity,id]);this.simulationKey='';this.simulationOperation++;this.setData({sandbox:null,sandboxUnavailable:false,sandboxError:'',sandboxActionText:'',found:false,order:{id},items:[],simulationAuthorized:false,simulationEligible:false,simulationBusy:false,simulationError:''})}
    this.setData({cloudMode:!!cloud,proofImage:'',proofError:'',proofLoading:false})
    if(this.loadSandboxPayment)this.loadSandboxPayment()
    if(cloud&&this.phoneReadOnly){
      const cfg=getCloudContext(),saved=wx.getStorageSync('stall_customer_phone_session_v1') as any
      if(!cfg||!saved||saved.apiBase!==cfg.apiBase||typeof saved.token!=='string'){this.setData({detailLoading:false,detailError:'手机号登录状态已失效，请重新登录'});return}
      const token=saved.token
      wx.request({url:cfg.apiBase.replace(/\/$/,'')+'/v1/customer/account/stores/'+cfg.storeSlug+'/orders/'+encodeURIComponent(id),method:'GET',timeout:15000,header:{Authorization:'Bearer '+token},
        success:(r:any)=>{
          const cur=wx.getStorageSync('stall_customer_phone_session_v1') as any
          if(!this.detailVisible||serial!==this.detailSerial||cur?.token!==token||cur?.apiBase!==cfg.apiBase)return
          if(r.statusCode!==200||!r.data?.order){this.setData({found:false,detailLoading:false,detailNotFound:r.statusCode===404,detailError:r.statusCode===404?'订单不存在或当前账号无权查看':'手机号订单详情读取失败，请重试'});return}
          const o=r.data.order,addr=o.contactSnapshot||{},slot=o.deliverySlotSnapshot||{}
          this.setData({found:true,detailLoading:false,detailError:'',detailNotFound:false,order:{...o,receiverName:addr.receiverName||'',phone:addr.phone||'',area:addr.areaName||slot.areaName||'',detail:addr.detail||'',totalText:(Number(o.totalCents)/100).toFixed(2)},items:(r.data.items||[]).map((i:any)=>({...i,subtotal:(Number(i.lineTotalCents)/100).toFixed(2)})),statusText:workflowText(String(o.fulfillmentStatus||'new')),paymentText:paymentLabel(o),createdText:o.createdAt?chinaTime(o.createdAt):'',deliveredText:o.deliveredAt?chinaTime(o.deliveredAt):'',issueText:String(o.issueReason||''),simulationAuthorized:false,proofImage:''})
        },fail:()=>{if(this.detailVisible&&serial===this.detailSerial)this.setData({detailLoading:false,detailError:'网络异常，订单详情尚未加载，请点击重试'})}})
      return
    }
    if (cloud) {
      // Preserve this same-context detail while refreshing; 401/403 still clear it.
      try {
        const result=await customerOrdersRequest(cloud,id)
        if(!this.detailVisible||serial!==this.detailSerial||identity!==supportIdentity())return
        if(!result?.order||String(result.order.id)!==id)throw Error('invalid_order_detail_response')
        const o=result.order
        const address=o.contactSnapshot || {}
        const slot=o.deliverySlotSnapshot || {}
        const items=(Array.isArray(result.items)?result.items:[]).map((i:any)=>({
          ...i,subtotal:(Number(i.lineTotalCents)/100).toFixed(2)
        }))
        const st=String(o.fulfillmentStatus||'new')
        this.setData({found:true,detailLoading:false,detailError:'',detailNotFound:false,order:{...o,receiverName:address.receiverName||'',phone:address.phone||'',
          area:address.areaName||slot.areaName||address.areaId||'',detail:address.detail||'',note:String(address.note||''), /* PHASE41_ORDER_NOTES */slotText:[slot.date,slot.label,slot.start,slot.end].filter(Boolean).join(' '),
          totalText:(Number(o.totalCents)/100).toFixed(2)},items,
          statusText:o.paymentStatus==='unpaid'&&st==='new'?'待支付':workflowText(st),paymentText:paymentLabel(o),
          createdText:o.createdAt?chinaTime(o.createdAt):'',deliveredText:o.deliveredAt?chinaTime(o.deliveredAt):'',
          issueText:String(o.issueReason||''),proofImage:'' /* PHASE40_ISSUE_REASON */})
        this.loadSimulationCapability(serial,identity,id)
        if(String(o.fulfillmentStatus||'')==='delivered'){
          this.renewProof()
        }
      }catch(error){if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity()){
        const message=String(error),missing=/http_404/.test(message),auth=/http_40[13]|not_logged_in/.test(message)
        this.setData({detailLoading:false,detailNotFound:missing,detailError:missing?'订单不存在或当前账号无权查看':auth?'登录状态已失效，请重新登录后查看订单':'订单详情读取失败，请检查网络并重试',...(auth||missing?{found:false,order:{id},items:[],simulationAuthorized:false,simulationEligible:false}:{})})
      }}
      return
    }
    const o = (loadWorkflowOrders() as any[]).find(item => item.id === id)
    if (!o) { this.setData({ found: false,detailLoading:false,detailNotFound:true,detailError:'本地未找到该订单' }); return }
    const status = String(o.fulfillmentStatus || 'new')
    const paymentStatus = String(o.paymentStatus || 'unpaid')
    const publicOrder={...o};delete publicOrder.merchantNote;delete publicOrder.merchantNoteVersion
    this.setData({
      found: true,detailLoading:false,detailError:'',detailNotFound:false,
      order: publicOrder,
      items: Array.isArray(o.items) ? o.items : [],
      statusText: paymentStatus !== 'paid' && status === 'new' ? '待支付' : workflowText(status),
      paymentText: paymentStatus === 'paid' ? '已付款' : '待付款（演示）',
      createdText: o.createdAt ? chinaTime(String(o.createdAt)) : '',
      deliveredText: o.deliveredAt ? chinaTime(String(o.deliveredAt)) : '',
      issueText: String(o.issueReason || ''),
      proofImage: String(o.deliveryPhoto || o.deliveryPhotoPath || o.proofImage || o.proofImageUrl || o.proofPhoto || o.deliveredPhoto || '')
    })
  },
  onHide(){this.stopSandboxPolling();this.detailVisible=false;this.detailSerial++;this.setData({sandbox:null,sandboxUnavailable:false,sandboxError:'',sandboxActionBusy:false,sandboxActionText:'',proofImage:'',proofLoading:false,proofError:''})},
  onUnload(){this.stopSandboxPolling();this.detailVisible=false;this.detailSerial++;this.simulationOperation++},
  async loadSimulationCapability(serial:number,identity:string,id:string){
    const cfg=customerOrdersConfig();if(!cfg)return
    try{const capability=await stagingOrderPayment(cfg,id);if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity())this.setData({simulationAuthorized:true,simulationEligible:capability.eligible})}
    catch(_){if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity())this.setData({simulationAuthorized:false,simulationEligible:false})}
  },
  async confirmSimulation(){
    const cfg=customerOrdersConfig(),identity=supportIdentity(),id=String(this.data.order.id||'')
    if(this.phoneReadOnly||!cfg||!this.detailVisible||this.detailContext!==JSON.stringify([identity,id])||!this.data.simulationAuthorized||!this.data.simulationEligible||this.data.simulationBusy)return
    const operation=++this.simulationOperation;this.setData({simulationBusy:true,simulationError:''})
    try{
      const ok=await new Promise<boolean>(resolve=>wx.showModal({title:'Staging测试操作',content:'仅模拟支付确认，不涉及真实扣款或到账。是否继续？',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
      if(!ok||!this.detailVisible||identity!==supportIdentity()||operation!==this.simulationOperation)return
      this.simulationKey=this.simulationKey||supportKey()
      await stagingOrderPayment(cfg,id,this.simulationKey)
      if(this.detailVisible&&identity===supportIdentity()&&operation===this.simulationOperation){this.simulationKey='';this.setData({simulationEligible:false});await this.onShow()}
    }catch(error){if(this.detailVisible&&identity===supportIdentity()&&operation===this.simulationOperation)this.setData({.../401|403/.test(String(error))?{simulationAuthorized:false,simulationEligible:false}:{},simulationError:/401|403/.test(String(error))?'身份或测试授权已失效，请重新登录并核对授权':'模拟确认失败或结果未知，请刷新订单核对；可复用原请求安全重试'})}
    finally{if(operation===this.simulationOperation&&identity===supportIdentity())this.setData({simulationBusy:false})}
  },
  proofReadError(){this.setData({proofImage:'',proofError:'凭证链接过期或读取失败，请重新获取'})},
  async renewProof(){
    const cfg=customerOrdersConfig(),serial=this.detailSerial,identity=supportIdentity(),id=String(this.data.order.id||'')
    if(this.phoneReadOnly||!cfg||this.data.proofLoading||!this.data.found)return
    this.setData({proofLoading:true,proofError:''})
    try{const url=await proofUrl(id);if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity())this.setData({proofImage:url})}catch(_){if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity())this.setData({proofError:'凭证暂不可用；请检查身份或稍后重新获取。'})}finally{if(serial===this.detailSerial)this.setData({proofLoading:false})}
  },
  async previewProof() {
    if(this.data.cloudMode)await this.renewProof()
    if (!this.data.proofImage) return
    wx.previewImage({ current: this.data.proofImage, urls: [this.data.proofImage] })
  }
})
