import { paymentLabel } from '../../modules/shared/domain/payment'
import { createSandboxCheckout, SandboxChannel } from '../../modules/customer/api/sandboxPayment'
import { sandboxPaymentRequest } from '../../modules/shared/api/sandboxPayment'
import { sandboxPaymentView } from '../../modules/shared/domain/sandboxPayment'
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
  async loadSandboxPayment(){
    const cfg=customerOrdersConfig(),serial=this.detailSerial,identity=supportIdentity(),id=String(this.data.order.id)
    if(!cfg||this.phoneReadOnly)return
    try{const result=await sandboxPaymentRequest(cfg,id)
      if(!this.detailVisible||serial!==this.detailSerial||identity!==supportIdentity())return
      const latest=await customerOrdersRequest(cfg,id)
      if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity())this.setData({sandbox:sandboxPaymentView(result),sandboxError:'',
       order:{...this.data.order,paymentStatus:latest.order.paymentStatus,paymentSource:latest.order.paymentSource},paymentText:paymentLabel(latest.order)})
    }catch(_){if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity())this.setData({sandbox:null,sandboxError:'Sandbox 服务未启用、未授权或网络不可用；未确认新的付款结果'})}
  },
  async cancelSandboxPayment(){
    const cfg=customerOrdersConfig(),serial=this.detailSerial,identity=supportIdentity()
    if(!cfg||this.phoneReadOnly||this.sandboxBusy)return
    this.sandboxBusy=true
    try{await sandboxPaymentRequest(cfg,String(this.data.order.id),false,'sandbox-cancel')
      if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity())await this.loadSandboxPayment()
    }catch(_){if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity())this.setData({sandboxError:'取消结果未确认，请刷新状态后再试'})}
    finally{this.sandboxBusy=false}
  },
  sandboxKeys:{} as Record<string,string>,sandboxBusy:false,
  async openSandboxCheckout(e:any){
    const cfg=customerOrdersConfig(),channel=e.currentTarget.dataset.channel as SandboxChannel
    if(!cfg||this.phoneReadOnly||this.sandboxBusy||!this.detailVisible||this.data.order.paymentStatus!=='unpaid')return
    const identity=supportIdentity(),serial=this.detailSerial,id=String(this.data.order.id)
    const current=()=>this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity()
    const key=[identity,id,channel].join(':')
    if(!this.sandboxKeys[key])this.sandboxKeys[key]='sandbox_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)
    this.sandboxBusy=true
    try{
      const url=await createSandboxCheckout(cfg,id,channel,this.sandboxKeys[key])
      if(!current())return
      wx.showModal({title:'Stripe Sandbox 外部测试',content:'链接仅用于外部浏览器测试，不是小程序原生付款。完成或取消后返回并刷新订单；付款结果以服务器核验为准。',confirmText:'复制链接',success:(r:any)=>{
        if(r.confirm&&current())wx.setClipboardData({data:url})
      }})
    }catch(_){if(current())wx.showToast({title:'测试入口不可用，或结果未知；请刷新订单后重试',icon:'none'})}
    finally{this.sandboxBusy=false;if(current())await this.loadSandboxPayment()}
  },
  phoneReadOnly:false,detailSerial:0,detailVisible:false,detailContext:'',simulationKey:'',simulationOperation:0,
  data: { sandbox:null as any,sandboxError:'',sandboxChannel:'card',phoneReadOnly:false,simulationAuthorized:false,simulationEligible:false,simulationBusy:false,simulationError:'', found: false, order: {} as any, items: [] as any[], statusText: '', paymentText: '', createdText: '', deliveredText: '', issueText: '', proofImage: '',proofError:'',proofLoading:false,cloudMode:false },
  onLoad(options: Record<string, string | undefined>) {
    this.phoneReadOnly=options.phone==='1'
    this.setData({phoneReadOnly:this.phoneReadOnly})
    if(['card','alipay','wechat_pay'].includes(options.sandboxChannel||''))this.setData({sandboxChannel:options.sandboxChannel})
    this.setData({ order: { id: options.id || '' } })
  },
  async onShow() {
    this.detailVisible=true;const serial=++this.detailSerial,identity=supportIdentity()
    const id = String(this.data.order.id || '')
    const cloud=customerOrdersConfig()
    if(this.detailContext!==JSON.stringify([identity,id])){this.detailContext=JSON.stringify([identity,id]);this.simulationKey='';this.simulationOperation++;this.setData({sandbox:null,sandboxError:'',found:false,order:{id},items:[],simulationAuthorized:false,simulationEligible:false,simulationBusy:false,simulationError:''})}
    this.setData({cloudMode:!!cloud,proofImage:'',proofError:'',proofLoading:false})
    if(this.loadSandboxPayment)this.loadSandboxPayment()
    if(cloud&&this.phoneReadOnly){
      const cfg=getCloudContext(),saved=wx.getStorageSync('stall_customer_phone_session_v1') as any
      if(!cfg||!saved||saved.apiBase!==cfg.apiBase||typeof saved.token!=='string'){this.setData({found:false});return}
      const token=saved.token
      wx.request({url:cfg.apiBase.replace(/\/$/,'')+'/v1/customer/account/stores/'+cfg.storeSlug+'/orders/'+encodeURIComponent(id),method:'GET',timeout:15000,header:{Authorization:'Bearer '+token},
        success:(r:any)=>{
          const cur=wx.getStorageSync('stall_customer_phone_session_v1') as any
          if(!this.detailVisible||serial!==this.detailSerial||cur?.token!==token||cur?.apiBase!==cfg.apiBase)return
          if(r.statusCode!==200||!r.data?.order){this.setData({found:false});wx.showToast({title:'手机号订单详情不可用',icon:'none'});return}
          const o=r.data.order,addr=o.contactSnapshot||{},slot=o.deliverySlotSnapshot||{}
          this.setData({found:true,order:{...o,receiverName:addr.receiverName||'',phone:addr.phone||'',area:addr.areaName||slot.areaName||'',detail:addr.detail||'',totalText:(Number(o.totalCents)/100).toFixed(2)},items:(r.data.items||[]).map((i:any)=>({...i,subtotal:(Number(i.lineTotalCents)/100).toFixed(2)})),statusText:workflowText(String(o.fulfillmentStatus||'new')),paymentText:paymentLabel(o),createdText:o.createdAt?chinaTime(o.createdAt):'',deliveredText:o.deliveredAt?chinaTime(o.deliveredAt):'',issueText:String(o.issueReason||''),simulationAuthorized:false,proofImage:''})
        },fail:()=>wx.showToast({title:'订单详情网络异常',icon:'none'})})
      return
    }
    if (cloud) {
      // Preserve this same-context detail while refreshing; 401/403 still clear it.
      try {
        const result=await customerOrdersRequest(cloud,id)
        if(!this.detailVisible||serial!==this.detailSerial||identity!==supportIdentity())return
        const o=result.order || {}
        const address=o.contactSnapshot || {}
        const slot=o.deliverySlotSnapshot || {}
        const items=(Array.isArray(result.items)?result.items:[]).map((i:any)=>({
          ...i,subtotal:(Number(i.lineTotalCents)/100).toFixed(2)
        }))
        const st=String(o.fulfillmentStatus||'new')
        this.setData({found:true,order:{...o,receiverName:address.receiverName||'',phone:address.phone||'',
          area:address.areaName||slot.areaName||address.areaId||'',detail:address.detail||'',note:String(address.note||''), /* PHASE41_ORDER_NOTES */slotText:[slot.date,slot.label,slot.start,slot.end].filter(Boolean).join(' '),
          totalText:(Number(o.totalCents)/100).toFixed(2)},items,
          statusText:o.paymentStatus==='unpaid'&&st==='new'?'待支付':workflowText(st),paymentText:paymentLabel(o),
          createdText:o.createdAt?chinaTime(o.createdAt):'',deliveredText:o.deliveredAt?chinaTime(o.deliveredAt):'',
          issueText:String(o.issueReason||''),proofImage:'' /* PHASE40_ISSUE_REASON */})
        this.loadSimulationCapability(serial,identity,id)
        if(String(o.fulfillmentStatus||'')==='delivered'){
          this.renewProof()
        }
      }catch(error){if(this.detailVisible&&serial===this.detailSerial&&identity===supportIdentity()){if(/401|403/.test(String(error)))this.setData({found:false,order:{id},items:[],simulationAuthorized:false,simulationEligible:false});wx.showToast({title:'订单详情加载失败',icon:'none'})}}
      return
    }
    const o = (loadWorkflowOrders() as any[]).find(item => item.id === id)
    if (!o) { this.setData({ found: false }); return }
    const status = String(o.fulfillmentStatus || 'new')
    const paymentStatus = String(o.paymentStatus || 'unpaid')
    const publicOrder={...o};delete publicOrder.merchantNote;delete publicOrder.merchantNoteVersion
    this.setData({
      found: true,
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
  onHide(){this.detailVisible=false;this.detailSerial++;this.setData({sandbox:null,sandboxError:'',proofImage:'',proofLoading:false,proofError:''})},
  onUnload(){this.detailVisible=false;this.detailSerial++;this.simulationOperation++},
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
