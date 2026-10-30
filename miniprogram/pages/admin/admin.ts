import { getMinimumOrder, saveMinimumOrder } from '../../modules/merchant/demo/settings'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { merchantBusiness, patchMerchantBusiness, businessContextKey } from '../../modules/merchant/api/business'
import { fetchMerchantPendingCount } from '../../modules/merchant/api/orders'
import { loadWorkflowOrders } from '../../modules/merchant/demo/orders'
import { merchantSupportGet,supportIdentity } from '../../modules/merchant/api/support'
import { authorizedGet,hasRecentMerchantPermission } from '../../modules/shared/runtime/auth'
import { CAN_OPEN_CUSTOMER,openCustomerShop } from '../../modules/integration/singleAppHost'
Page({
  openCustomerShop(){
    if(!CAN_OPEN_CUSTOMER)return
    const cfg=getCloudContext()
    if(cfg)wx.setStorageSync('stall_merchant_home_preference_v1','customer|'+cfg.apiBase+'|'+cfg.storeSlug)
    openCustomerShop()
  },
 // Page-local proof only: bound to API, store and session; shows reuse a short-lived shared proof or recheck the server.
 accessSerial:0,accessContext:'',
 revision:null as string|null, serial:0,pendingSerial:0, loadedContext:'',supportSerial:0,supportTimer:0 as any,
 data:{canOpenCustomer:CAN_OPEN_CUSTOMER,workspaceAuthorized:false,accessLoading:false,accessError:'',supportUnread:null as number|null,supportError:'',minimumOrderInput:'0.00',minimumEditing:false,pendingNewOrderCount:null as number|null,pendingLoading:false,pendingError:'',settingsLoading:false,settingsSaving:false,settingsReady:false,settingsError:'',cloudMode:false},
 async onShow(){
  const cfg=getCloudContext(),serial=++this.accessSerial,identity=supportIdentity()
  const retained=this.accessContext===identity&&this.data.workspaceAuthorized||!!cfg&&hasRecentMerchantPermission(cfg.apiBase,cfg.storeSlug)
  if(this.accessContext!==identity){
   this.accessContext=identity;this.serial++;this.pendingSerial++;this.supportSerial++;clearTimeout(this.supportTimer);this.revision=null;this.loadedContext=''
   this.setData({workspaceAuthorized:false,settingsReady:false,minimumOrderInput:'',pendingNewOrderCount:null,supportUnread:null})
  }
  this.setData({workspaceAuthorized:retained,accessLoading:!!cfg&&!retained,accessError:''})
  if(cfg){
   try{const r=await authorizedGet(cfg.apiBase,'/v1/merchant/stores/'+cfg.storeSlug+'/categories',undefined,true);if(serial!==this.accessSerial||identity!==supportIdentity())return;if(!r||!Array.isArray(r.items))throw Error('invalid_permission_response')}
   catch(error){
    if(serial!==this.accessSerial||identity!==supportIdentity())return
    const denied=/^(?:Error: )?(?:http_40[13](?:_|$)|not_logged_in$)/.test(String(error))
    if(denied){this.serial++;this.pendingSerial++;this.supportSerial++;clearTimeout(this.supportTimer);this.setData({workspaceAuthorized:false,settingsReady:false,minimumOrderInput:'',pendingNewOrderCount:null,supportUnread:null});this.loadedContext='';this.revision=null}
    if(/^(?:Error: )?http_401(?:_|$)/.test(String(error))){wx.removeStorageSync('stall_server_session_v1');wx.removeStorageSync('stall_server_cache_scope_v1');wx.removeStorageSync('stall_merchant_home_preference_v1')}
    this.setData({accessLoading:false,accessError:denied?'未取得此店铺商家权限或会话已失效，请验证账号':retained?'权限暂时无法同步，当前页面已保留，请检查网络后重试':'暂时无法验证商家权限，请检查网络后重试'})
    return
   }
  }
  if(serial!==this.accessSerial||identity!==supportIdentity())return
  this.setData({workspaceAuthorized:true,accessLoading:false})
  this.refreshNewOrderNotice();if(!this.data.settingsReady)this.refreshMinimum();this.refreshSupport()
 },
 async refreshSupport(){clearTimeout(this.supportTimer);const serial=++this.supportSerial,identity=supportIdentity();this.setData({supportError:''});if(!getCloudContext())return;try{const r=await merchantSupportGet('unread');if(serial===this.supportSerial&&identity===supportIdentity())this.setData({supportUnread:r.unread})}catch(_){if(serial===this.supportSerial&&identity===supportIdentity())this.setData({supportError:'未读读取失败，进入客服重试'})}finally{if(serial===this.supportSerial)this.supportTimer=setTimeout(()=>this.refreshSupport(),30000)}},
 onHide(){this.accessSerial++;this.serial++;this.pendingSerial++;this.supportSerial++;clearTimeout(this.supportTimer);this.setData({accessLoading:false})},
 onUnload(){this.accessSerial++;this.serial++;this.pendingSerial++;this.supportSerial++;clearTimeout(this.supportTimer)},
 onMinimumOrderInput(e:any){if(!this.data.settingsSaving)this.setData({minimumOrderInput:String(e.detail.value||'')})},
 async refreshMinimum(){
  const cfg=getCloudContext(),serial=++this.serial,context=businessContextKey();this.loadedContext=context
  this.setData({cloudMode:!!cfg,settingsLoading:!!cfg,settingsReady:!cfg,settingsError:'',minimumOrderInput:cfg?'':getMinimumOrder().toFixed(2)})
  if(!cfg)return
  try{const r=await merchantBusiness(cfg);if(serial!==this.serial||context!==businessContextKey())return;this.revision=r.revision||null;this.setData({minimumOrderInput:(r.minimumOrderCents/100).toFixed(2),settingsReady:true})}
  catch(_){if(serial===this.serial&&context===businessContextKey())this.setData({settingsError:'云端起送金额读取失败，请检查权限后重试'})}
  finally{if(serial===this.serial&&context===businessContextKey())this.setData({settingsLoading:false})}
 },
 async saveMinimumOrder(){
  if(this.data.settingsSaving||!this.data.settingsReady)return
  const raw=this.data.minimumOrderInput.trim()
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)>999999){wx.showToast({title:'请输入有效金额（最多两位小数）',icon:'none'});return}
  const cfg=getCloudContext(),context=businessContextKey()
  if(context!==this.loadedContext){this.refreshMinimum();return}
  this.setData({settingsSaving:true,settingsError:''})
  try{
   if(cfg)this.revision=await patchMerchantBusiness(cfg,this.revision,{minimumOrderCents:Math.round(Number(raw)*100)})
   else saveMinimumOrder(Number(raw))
   if(context!==businessContextKey())throw Error('context_changed')
   this.setData({minimumOrderInput:Number(raw).toFixed(2),minimumEditing:false});wx.showToast({title:'起送金额已保存',icon:'success'})
  }catch(_){this.setData({settingsError:'保存失败，输入已保留；设置可能已变化，请刷新核对后重试',settingsReady:false})}
  finally{this.setData({settingsSaving:false})}
 },
 async refreshNewOrderNotice(){
  const cfg=getCloudContext(),context=businessContextKey(),serial=++this.pendingSerial
  this.setData({pendingLoading:!!cfg,pendingError:''})
  try{
   const count=cfg?await fetchMerchantPendingCount(cfg):loadWorkflowOrders().filter(o=>String(o.fulfillmentStatus||'new')==='new').length
   if(serial!==this.pendingSerial||context!==businessContextKey())return
   this.setData({pendingNewOrderCount:count})
  }catch(_){if(serial===this.pendingSerial&&context===businessContextKey())this.setData({pendingError:'待处理订单读取失败，当前数量可能过期，请进入订单管理核对'})}
  finally{if(serial===this.pendingSerial&&context===businessContextKey())this.setData({pendingLoading:false})}
 }
})
