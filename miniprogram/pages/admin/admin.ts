import { getMinimumOrder, saveMinimumOrder } from '../../modules/merchant/demo/settings'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { merchantBusiness, patchMerchantBusiness, businessContextKey } from '../../modules/merchant/api/business'
import { fetchMerchantOrderSummary } from '../../modules/merchant/api/orders'
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
 data:{canOpenCustomer:CAN_OPEN_CUSTOMER,workspaceAuthorized:false,accessLoading:false,accessError:'',supportUnread:null as number|null,supportError:'',minimumOrderInput:'0.00',minimumEditing:false,homeSubtitle:'精选好物 · 便捷选购',homeSubtitleDraft:'',homeSubtitleEditing:false,homeSubtitleSaving:false,deliveryFeeEnabled:false,deliveryFeeInput:'0.00',deliveryFeeEditing:false,deliveryFeeSaving:false,pendingNewOrderCount:null as number|null,unpaidOrderCount:null as number|null,pendingLoading:false,pendingError:'',settingsLoading:false,settingsSaving:false,settingsReady:false,settingsError:'',shareDeliveryLocation:false,trackingSaving:false,cloudMode:false},
 async onShow(){
  const cfg=getCloudContext(),serial=++this.accessSerial,identity=supportIdentity()
  const retained=this.accessContext===identity&&this.data.workspaceAuthorized||!!cfg&&hasRecentMerchantPermission(cfg.apiBase,cfg.storeSlug)
  if(this.accessContext!==identity){
   this.accessContext=identity;this.serial++;this.pendingSerial++;this.supportSerial++;clearTimeout(this.supportTimer);this.revision=null;this.loadedContext=''
   this.setData({workspaceAuthorized:false,settingsReady:false,minimumOrderInput:'',pendingNewOrderCount:null,unpaidOrderCount:null,supportUnread:null})
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
 onHomeSubtitleInput(e:any){if(!this.data.homeSubtitleSaving)this.setData({homeSubtitleDraft:String(e.detail.value||'').slice(0,50)})},
 beginHomeSubtitleEdit(){if(this.data.settingsReady&&!this.data.homeSubtitleSaving)this.setData({homeSubtitleDraft:this.data.homeSubtitle,homeSubtitleEditing:true})},
 cancelHomeSubtitleEdit(){if(!this.data.homeSubtitleSaving)this.setData({homeSubtitleEditing:false,homeSubtitleDraft:this.data.homeSubtitle})},
 async saveHomeSubtitle(){
  if(this.data.homeSubtitleSaving||this.data.settingsLoading||this.data.settingsSaving||!this.data.settingsReady)return
  const subtitle=String(this.data.homeSubtitleDraft||'').trim()
  if(subtitle.length>50||/[\u0000-\u001f\u007f]/.test(subtitle)){wx.showToast({title:'文案最多50字且不能包含控制字符',icon:'none'});return}
  const cfg=getCloudContext(),context=businessContextKey()
  if(!cfg||context!==this.loadedContext){this.refreshMinimum();return}
  this.setData({homeSubtitleSaving:true,settingsError:''})
  try{
    const revision=await patchMerchantBusiness(cfg,this.revision,{homeSubtitle:subtitle})
    if(context!==businessContextKey())return
    this.revision=revision
    this.setData({homeSubtitle:subtitle||'精选好物 · 便捷选购',homeSubtitleEditing:false})
    wx.showToast({title:'首页文案已保存',icon:'success'})
  }catch(_){if(context===businessContextKey()){this.setData({settingsReady:false,settingsError:'首页文案保存失败，请刷新确认当前设置'});this.refreshMinimum()}}
  finally{this.setData({homeSubtitleSaving:false})}
 },
 onMinimumOrderInput(e:any){if(!this.data.settingsSaving)this.setData({minimumOrderInput:String(e.detail.value||'')})},
 async refreshMinimum(){
  const cfg=getCloudContext(),serial=++this.serial,context=businessContextKey();this.loadedContext=context
  this.setData({cloudMode:!!cfg,settingsLoading:!!cfg,settingsReady:!cfg,settingsError:'',minimumOrderInput:cfg?'':getMinimumOrder().toFixed(2)})
  if(!cfg)return
  try{const r=await merchantBusiness(cfg);if(serial!==this.serial||context!==businessContextKey())return;this.revision=r.revision||null;this.setData({minimumOrderInput:(r.minimumOrderCents/100).toFixed(2),deliveryFeeEnabled:r.deliveryFeeEnabled===true,deliveryFeeInput:(Math.max(0,r.deliveryFeeCents||0)/100).toFixed(2),deliveryFeeEditing:false,shareDeliveryLocation:r.shareDeliveryLocation===true,homeSubtitle:r.homeSubtitle||'精选好物 · 便捷选购',homeSubtitleDraft:r.homeSubtitle||'精选好物 · 便捷选购',homeSubtitleEditing:false,settingsReady:true})}
  catch(_){if(serial===this.serial&&context===businessContextKey())this.setData({settingsError:'云端起送金额读取失败，请检查权限后重试'})}
  finally{if(serial===this.serial&&context===businessContextKey())this.setData({settingsLoading:false})}
 },
 async toggleTrackingVisibility(e:any){
   const desired=!!e.detail.value,cfg=getCloudContext(),context=businessContextKey()
   if(!cfg||!this.data.settingsReady||this.data.settingsSaving||this.data.trackingSaving||context!==this.loadedContext){this.setData({shareDeliveryLocation:this.data.shareDeliveryLocation});return}
   this.setData({trackingSaving:true,settingsError:''})
   try{this.revision=await patchMerchantBusiness(cfg,this.revision,{shareDeliveryLocation:desired});if(context!==businessContextKey())throw Error('context_changed');this.setData({shareDeliveryLocation:desired});wx.showToast({title:desired?'已允许共享':'已关闭共享',icon:'success'})}
   catch(_){this.setData({settingsReady:false,settingsError:'定位设置保存失败，请刷新核对服务器状态'});this.refreshMinimum()}
   finally{this.setData({trackingSaving:false})}
  },
  async toggleDeliveryFee(e:any){
   const enabled=!!e.detail.value,cfg=getCloudContext(),context=businessContextKey()
   if(!cfg||!this.data.settingsReady||this.data.deliveryFeeSaving||this.data.settingsSaving||this.data.trackingSaving||context!==this.loadedContext){this.setData({deliveryFeeEnabled:this.data.deliveryFeeEnabled});return}
   this.setData({deliveryFeeSaving:true,settingsError:''})
   try{this.revision=await patchMerchantBusiness(cfg,this.revision,{deliveryFeeEnabled:enabled});if(context!==businessContextKey())throw Error('context_changed');this.setData({deliveryFeeEnabled:enabled});wx.showToast({title:enabled?'已开启配送费':'配送费已关闭',icon:'success'})}
   catch(_){this.setData({settingsReady:false,settingsError:'配送费状态保存失败，请重新读取设置'});this.refreshMinimum()}
   finally{this.setData({deliveryFeeSaving:false})}
  },
  onDeliveryFeeInput(e:any){if(!this.data.deliveryFeeSaving)this.setData({deliveryFeeInput:String(e.detail.value||'')})},
  beginDeliveryFeeEdit(){if(this.data.settingsReady&&!this.data.settingsSaving&&!this.data.deliveryFeeSaving)this.setData({deliveryFeeEditing:true})},
  cancelDeliveryFeeEdit(){if(!this.data.deliveryFeeSaving)this.setData({deliveryFeeEditing:false})},
  async saveDeliveryFee(){
   if(this.data.deliveryFeeSaving||this.data.settingsSaving||!this.data.settingsReady)return
   const raw=this.data.deliveryFeeInput.trim()
   if(!/^[0-9]+(?:[.][0-9]{1,2})?$/.test(raw)||Number(raw)>1000){wx.showToast({title:'请输入 ¥0–1000 的金额',icon:'none'});return}
   const cfg=getCloudContext(),context=businessContextKey()
   if(!cfg||context!==this.loadedContext){this.refreshMinimum();return}
   this.setData({deliveryFeeSaving:true,settingsError:''})
   try{this.revision=await patchMerchantBusiness(cfg,this.revision,{deliveryFeeCents:Math.round(Number(raw)*100)});if(context!==businessContextKey())throw Error('context_changed');this.setData({deliveryFeeInput:Number(raw).toFixed(2),deliveryFeeEditing:false});wx.showToast({title:'配送费已保存',icon:'success'})}
   catch(_){this.setData({settingsReady:false,settingsError:'配送费保存失败，请重新读取设置'});this.refreshMinimum()}
   finally{this.setData({deliveryFeeSaving:false})}
  },
  beginMinimumEdit(){if(this.data.settingsReady&&!this.data.settingsLoading&&!this.data.settingsSaving)this.setData({minimumEditing:true})},
  cancelMinimumEdit(){if(!this.data.settingsSaving)this.setData({minimumEditing:false})},
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
   const summary=cfg?await fetchMerchantOrderSummary(cfg):{pendingCount:loadWorkflowOrders().filter(o=>String(o.fulfillmentStatus||'new')==='new'&&String(o.paymentStatus)==='paid').length,unpaidCount:loadWorkflowOrders().filter(o=>String(o.paymentStatus||'unpaid')==='unpaid').length}
   if(serial!==this.pendingSerial||context!==businessContextKey())return
   this.setData({pendingNewOrderCount:summary.pendingCount,unpaidOrderCount:summary.unpaidCount})
  }catch(_){if(serial===this.pendingSerial&&context===businessContextKey())this.setData({pendingError:'待处理订单读取失败，当前数量可能过期，请进入订单管理核对'})}
  finally{if(serial===this.pendingSerial&&context===businessContextKey())this.setData({pendingLoading:false})}
 }
})
