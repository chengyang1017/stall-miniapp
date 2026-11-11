import { getMinimumOrder, saveMinimumOrder } from '../../modules/merchant/demo/settings'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { uploadMerchantImage } from '../../utils/cloudMerchantImage'
import { merchantBusiness, patchMerchantBusiness, businessContextKey } from '../../modules/merchant/api/business'
import { fetchMerchantOrderSummary } from '../../modules/merchant/api/orders'
import { loadWorkflowOrders } from '../../modules/merchant/demo/orders'
import { merchantSupportGet,supportIdentity } from '../../modules/merchant/api/support'
import { authorizedGet,hasRecentMerchantPermission } from '../../modules/shared/runtime/auth'
import { CAN_OPEN_CUSTOMER,openCustomerShop } from '../../modules/integration/singleAppHost'
type PromoBanner={key:string;url:string}
function promoItems(settings:any):PromoBanner[]{
 if(Array.isArray(settings?.promoBannerImages))return settings.promoBannerImages.filter((b:any)=>typeof b?.key==='string'&&typeof b?.url==='string'&&!!b.url).slice(0,10)
 return settings?.promoBannerImageKey&&settings?.promoBannerUrl?[{key:settings.promoBannerImageKey,url:settings.promoBannerUrl}]:[]
}
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
 data:{canOpenCustomer:CAN_OPEN_CUSTOMER,workspaceAuthorized:false,accessLoading:false,accessError:'',supportUnread:null as number|null,supportError:'',minimumOrderInput:'0.00',minimumEditing:false,homeSubtitle:'精选好物 · 便捷选购',homeSubtitleDraft:'',homeSubtitleEditing:false,homeSubtitleSaving:false,promoBannerUrl:'',promoBannerImageKey:null as string|null,promoBanners:[] as PromoBanner[],promoBannerBusy:false,promoBannerError:'',deliveryFeeEnabled:false,deliveryFeeInput:'0.00',deliveryFeeEditing:false,deliveryFeeSaving:false,pendingNewOrderCount:null as number|null,unpaidOrderCount:null as number|null,pendingLoading:false,pendingError:'',settingsLoading:false,settingsSaving:false,settingsReady:false,settingsError:'',shareDeliveryLocation:false,trackingSaving:false,cloudMode:false},
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
 async savePromoBanners(keys:string[]){
  const cfg=getCloudContext(),context=businessContextKey()
  if(!cfg||!this.data.settingsReady||context!==this.loadedContext)throw Error('settings_not_ready')
  if(keys.length>10||new Set(keys).size!==keys.length)throw Error('invalid_promo_banner_list')
  const revision=await patchMerchantBusiness(cfg,this.revision,{promoBannerImageKeys:keys})
  if(context!==businessContextKey())throw Error('merchant_context_changed')
  this.revision=revision
  const settings=await merchantBusiness(cfg)
  if(context!==businessContextKey())throw Error('merchant_context_changed')
  if(settings.revision!==revision)throw Error('configuration_changed')
  const banners=promoItems(settings)
  if(banners.map(b=>b.key).join('|')!==keys.join('|'))throw Error('banner_not_saved')
  this.revision=settings.revision||null
  this.setData({promoBanners:banners,promoBannerImageKey:banners[0]?.key||null,promoBannerUrl:banners[0]?.url||''})
 },
 bannerErrorText(error:any,stage:string):string{
  const raw=String(error?.message||error||'unknown')
  if(/image_must_be_under_5mb/.test(raw))return '图片不能超过5MB，请压缩后上传'
  if(/unsupported_image_format/.test(raw))return '请使用 JPG、PNG 或 WebP 图片'
  if(/invalid_upload_request_key|upload_request_conflict/.test(raw))return '上传请求冲突，请重新选择图片'
  if(/object_storage_not_configured|storage_not_configured|image_storage_check_unavailable/.test(raw))return '测试服务器的图片存储尚未就绪，请检查对象存储配置'
  if(/image_upload_not_verified|image_verification_failed|invalid_promo_banner_image/.test(raw))return '图片未通过服务器校验，请检查存储权限后重试'
  if(/invalid_promo_banner_list/.test(raw))return '最多10张图片，且不能重复，请重新操作'
  if(/invalid_business_patch/.test(raw))return '测试后端尚未部署多图横幅功能，请先更新后端'
  if(/promo_banner_public_image_base_required/.test(raw))return '图片公开访问地址未配置，暂时无法展示横幅'
  if(/http_401|not_logged_in/.test(raw))return '商家登录已过期，请重新登录'
  if(/http_403/.test(raw))return '当前账号没有上传或修改店铺图片的权限'
  if(/http_409|configuration_changed/.test(raw))return '店铺设置已变化，请刷新后重新上传'
  if(/http_413/.test(raw))return '图片太大，服务器拒绝上传'
  if(/http_503/.test(raw))return '图片服务暂不可用，请检查测试后端配置'
  if(/merchant_context_changed/.test(raw))return '店铺或登录身份已切换，请重新进入'
  return stage+'失败：'+raw.slice(0,100)
 },
 uploadPromoBanner(e:any){
  if(this.data.promoBannerBusy||!this.data.settingsReady||this.data.settingsSaving||this.data.homeSubtitleSaving)return
  const rawIndex=e?.currentTarget?.dataset?.index
  const index=rawIndex===undefined?-1:Number(rawIndex)
  const replacing=Number.isInteger(index)&&index>=0&&index<this.data.promoBanners.length
  if(!replacing&&this.data.promoBanners.length>=10){wx.showToast({title:'最多10张横幅',icon:'none'});return}
  const cfg=getCloudContext(),context=businessContextKey()
  if(!cfg||context!==this.loadedContext)return
  this.setData({promoBannerBusy:true,promoBannerError:''})
  wx.chooseImage({count:1,sizeType:['compressed'],sourceType:['album','camera'],success:async (result:any)=>{
   const file=result.tempFilePaths?.[0]
   if(!file||context!==businessContextKey()){if(context===businessContextKey())this.setData({promoBannerBusy:false});return}
   let stage='上传图片'
   try{
     const key=await uploadMerchantImage(cfg,file)
     if(context!==businessContextKey())return
     const keys=this.data.promoBanners.map(b=>b.key)
     if(replacing)keys[index]=key
     else keys.push(key)
     stage='保存横幅'
     await this.savePromoBanners(keys)
     if(context===businessContextKey())wx.showToast({title:'宣传图已保存',icon:'success'})
   }catch(error){if(context===businessContextKey()){
     this.setData({promoBannerError:this.bannerErrorText(error,stage)})
     wx.showToast({title:'操作失败，查看下方原因',icon:'none'})
     this.refreshMinimum()
   }}
   finally{if(context===businessContextKey())this.setData({promoBannerBusy:false})}
  },fail:(error:any)=>{
   if(context===businessContextKey()){
     if(!/cancel/i.test(String(error?.errMsg||'')))this.setData({promoBannerError:'选择图片失败：'+String(error?.errMsg||'请检查相册权限')})
     this.setData({promoBannerBusy:false})
   }
  }})
 },
 async changePromoOrder(e:any){
  if(this.data.promoBannerBusy||!this.data.settingsReady)return
  const index=Number(e.currentTarget?.dataset?.index),offset=Number(e.currentTarget?.dataset?.offset)
  const next=index+offset,banners=this.data.promoBanners
  if(!Number.isInteger(index)||![-1,1].includes(offset)||index<0||index>=banners.length||next<0||next>=banners.length)return
  const keys=banners.map(b=>b.key);[keys[index],keys[next]]=[keys[next],keys[index]]
  const context=businessContextKey();this.setData({promoBannerBusy:true,promoBannerError:''})
  try{await this.savePromoBanners(keys);if(context===businessContextKey())wx.showToast({title:'顺序已更新',icon:'success'})}
  catch(error){if(context===businessContextKey()){this.setData({promoBannerError:this.bannerErrorText(error,'调整顺序')});this.refreshMinimum()}}
  finally{if(context===businessContextKey())this.setData({promoBannerBusy:false})}
 },
 removePromoBanner(e:any){
  if(this.data.promoBannerBusy||!this.data.settingsReady)return
  const index=Number(e.currentTarget?.dataset?.index)
  if(!Number.isInteger(index)||index<0||index>=this.data.promoBanners.length)return
  wx.showModal({title:'删除宣传图',content:'只移除首页轮播中的这张图片，其他图片保留。',confirmText:'删除',success:async (result:any)=>{
   if(!result.confirm||this.data.promoBannerBusy)return
   const context=businessContextKey(),keys=this.data.promoBanners.map(b=>b.key).filter((_,i)=>i!==index)
   this.setData({promoBannerBusy:true,promoBannerError:''})
   try{await this.savePromoBanners(keys);if(context===businessContextKey())wx.showToast({title:'已移除',icon:'success'})}
   catch(error){if(context===businessContextKey()){this.setData({promoBannerError:this.bannerErrorText(error,'移除横幅')});this.refreshMinimum()}}
   finally{if(context===businessContextKey())this.setData({promoBannerBusy:false})}
  }})
 },
 hidePromoBanner(){
  if(this.data.promoBannerBusy||!this.data.settingsReady||!this.data.promoBanners.length)return
  wx.showModal({title:'隐藏全部横幅',content:'隐藏后顾客首页不再显示宣传图，折扣专区不受影响。',confirmText:'全部隐藏',success:async (result:any)=>{
   if(!result.confirm||this.data.promoBannerBusy)return
   const context=businessContextKey();this.setData({promoBannerBusy:true,promoBannerError:''})
   try{await this.savePromoBanners([]);if(context===businessContextKey())wx.showToast({title:'已隐藏',icon:'success'})}
   catch(error){if(context===businessContextKey()){this.setData({promoBannerError:this.bannerErrorText(error,'隐藏横幅')});this.refreshMinimum()}}
   finally{if(context===businessContextKey())this.setData({promoBannerBusy:false})}
  }})
 },
 onMinimumOrderInput(e:any){if(!this.data.settingsSaving)this.setData({minimumOrderInput:String(e.detail.value||'')})},
 async refreshMinimum(){
  const cfg=getCloudContext(),serial=++this.serial,context=businessContextKey();this.loadedContext=context
  this.setData({cloudMode:!!cfg,settingsLoading:!!cfg,settingsReady:!cfg,settingsError:'',minimumOrderInput:cfg?'':getMinimumOrder().toFixed(2)})
  if(!cfg)return
  try{const r=await merchantBusiness(cfg);if(serial!==this.serial||context!==businessContextKey())return;this.revision=r.revision||null;this.setData({minimumOrderInput:(r.minimumOrderCents/100).toFixed(2),deliveryFeeEnabled:r.deliveryFeeEnabled===true,deliveryFeeInput:(Math.max(0,r.deliveryFeeCents||0)/100).toFixed(2),deliveryFeeEditing:false,shareDeliveryLocation:r.shareDeliveryLocation===true,homeSubtitle:r.homeSubtitle||'精选好物 · 便捷选购',homeSubtitleDraft:r.homeSubtitle||'精选好物 · 便捷选购',homeSubtitleEditing:false,promoBannerUrl:r.promoBannerUrl||'',promoBannerImageKey:r.promoBannerImageKey||null,promoBanners:promoItems(r),settingsReady:true})}
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
