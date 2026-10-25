import { getMinimumOrder, saveMinimumOrder } from '../../utils/minimumOrder'
import { getMerchantContext } from '../../utils/merchantContext'
import { merchantBusiness, patchMerchantBusiness, businessContextKey } from '../../utils/businessCloud'
import { fetchMerchantPendingCount } from '../../utils/merchantOrdersCloud'
import { loadWorkflowOrders } from '../../utils/orderWorkflow'
import { supportGet,supportIdentity } from '../../utils/supportCloud'
Page({
 revision:null as string|null, serial:0,pendingSerial:0, loadedContext:'',supportSerial:0,supportTimer:0 as any,
 data:{supportUnread:null as number|null,supportError:'',minimumOrderInput:'0.00',pendingNewOrderCount:null as number|null,pendingLoading:false,pendingError:'',settingsLoading:false,settingsSaving:false,settingsReady:false,settingsError:'',cloudMode:false},
 onShow(){this.refreshNewOrderNotice();this.refreshMinimum();this.refreshSupport()},
 async refreshSupport(){clearTimeout(this.supportTimer);const serial=++this.supportSerial,identity=supportIdentity();this.setData({supportUnread:null,supportError:''});if(!getMerchantContext())return;try{const r=await supportGet(true,'unread');if(serial===this.supportSerial&&identity===supportIdentity())this.setData({supportUnread:r.unread})}catch(_){if(serial===this.supportSerial&&identity===supportIdentity())this.setData({supportError:'未读读取失败，进入客服重试'})}finally{if(serial===this.supportSerial)this.supportTimer=setTimeout(()=>this.refreshSupport(),30000)}},
 onHide(){this.supportSerial++;clearTimeout(this.supportTimer);this.setData({supportUnread:null,supportError:''})},
 onUnload(){this.serial++;this.pendingSerial++;this.supportSerial++;clearTimeout(this.supportTimer)},
 onMinimumOrderInput(e:any){if(!this.data.settingsSaving)this.setData({minimumOrderInput:String(e.detail.value||'')})},
 async refreshMinimum(){
  const cfg=getMerchantContext(),serial=++this.serial,context=businessContextKey();this.loadedContext=context
  this.setData({cloudMode:!!cfg,settingsLoading:!!cfg,settingsReady:!cfg,settingsError:'',minimumOrderInput:cfg?'':getMinimumOrder().toFixed(2)})
  if(!cfg)return
  try{const r=await merchantBusiness(cfg);if(serial!==this.serial||context!==businessContextKey())return;this.revision=r.revision||null;this.setData({minimumOrderInput:(r.minimumOrderCents/100).toFixed(2),settingsReady:true})}
  catch(_){if(serial===this.serial)this.setData({settingsError:'云端起送金额读取失败，请检查权限后重试'})}
  finally{if(serial===this.serial)this.setData({settingsLoading:false})}
 },
 async saveMinimumOrder(){
  if(this.data.settingsSaving||!this.data.settingsReady)return
  const raw=this.data.minimumOrderInput.trim()
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)>999999){wx.showToast({title:'请输入有效金额（最多两位小数）',icon:'none'});return}
  const cfg=getMerchantContext(),context=businessContextKey()
  if(context!==this.loadedContext){this.refreshMinimum();return}
  this.setData({settingsSaving:true,settingsError:''})
  try{
   if(cfg)this.revision=await patchMerchantBusiness(cfg,this.revision,{minimumOrderCents:Math.round(Number(raw)*100)})
   else saveMinimumOrder(Number(raw))
   if(context!==businessContextKey())throw Error('context_changed')
   this.setData({minimumOrderInput:Number(raw).toFixed(2)});wx.showToast({title:'起送金额已保存',icon:'success'})
  }catch(_){this.setData({settingsError:'保存失败，输入已保留；设置可能已变化，请刷新核对后重试',settingsReady:false})}
  finally{this.setData({settingsSaving:false})}
 },
 async refreshNewOrderNotice(){
  const cfg=getMerchantContext(),context=businessContextKey(),serial=++this.pendingSerial
  this.setData({pendingNewOrderCount:null,pendingLoading:!!cfg,pendingError:''})
  try{
   const count=cfg?await fetchMerchantPendingCount(cfg):loadWorkflowOrders().filter(o=>String(o.fulfillmentStatus||'new')==='new').length
   if(serial!==this.pendingSerial||context!==businessContextKey())return
   this.setData({pendingNewOrderCount:count})
  }catch(_){if(serial===this.pendingSerial&&context===businessContextKey())this.setData({pendingNewOrderCount:null,pendingError:'待处理订单读取失败，点击订单管理核对'})}
  finally{if(serial===this.pendingSerial&&context===businessContextKey())this.setData({pendingLoading:false})}
 }
})
