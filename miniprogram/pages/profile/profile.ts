import { getSessionToken } from '../../modules/shared/runtime/context'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { authorizedGet,loginWithWechat,hasRecentMerchantPermission } from '../../modules/shared/runtime/auth'
import { CLOUD_ONLY,PUBLIC_API_BASE } from '../../config/cloud'
import { supportConfig,customerSupportGet,supportIdentity } from '../../modules/customer/api/support'
import { CAN_OPEN_MERCHANT,openMerchantWorkspace } from '../../modules/integration/singleAppHost'
Page({
  data:{accountName:'未登录',accountSubtitle:'登录后管理订单与配送',orderEntries:[{label:'待付款',icon:'♧',tab:'unpaid',fulfillment:''},{label:'待发货',icon:'◇',tab:'active',fulfillment:'pending'},{label:'配送中',icon:'♧',tab:'active',fulfillment:'delivering'},{label:'已完成',icon:'✓',tab:'completed',fulfillment:''},{label:'售后/退款',icon:'↔',tab:'other',fulfillment:'refund'}],supportUnread:null as number|null,cloudSupport:false,merchantAuthorized:false,
    loginBusy:false,loginStatus:'',phonePreview:CLOUD_ONLY,previewApi:PUBLIC_API_BASE},
  loginSerial:0,
  serial:0,
  merchantSerial:0,merchantContext:'',
  merchantOpening:false,
  async loginWechat(){
    const cfg=getCloudContext()
    if(!cfg||this.data.loginBusy)return
    const serial=++this.loginSerial
    this.setData({loginBusy:true,loginStatus:'正在通过微信验证身份…',merchantAuthorized:false})
    try{
      await loginWithWechat(cfg.apiBase)
      const current=getCloudContext()
      if(serial!==this.loginSerial||!current||current.apiBase!==cfg.apiBase||current.storeSlug!==cfg.storeSlug)return
      this.setData({loginStatus:'微信身份已确认；商家入口需服务器另行授权'})
      await this.checkMerchant()
    }catch(_){if(serial===this.loginSerial)this.setData({loginStatus:'微信登录失败；请核对当前AppID、后端配置及合法域名，不使用本地Token'})}
    finally{if(serial===this.loginSerial)this.setData({loginBusy:false})}
  },
  async checkMerchant(){
    const serial=++this.merchantSerial,cfg=getCloudContext(),identity=supportIdentity()
    if(this.merchantContext!==identity||!CAN_OPEN_MERCHANT||!cfg)this.setData({merchantAuthorized:false})
    if(CAN_OPEN_MERCHANT&&cfg&&hasRecentMerchantPermission(cfg.apiBase,cfg.storeSlug))this.setData({merchantAuthorized:true})
    this.merchantContext=identity
    if(!CAN_OPEN_MERCHANT||!cfg)return
    try{
      const result=await authorizedGet(cfg.apiBase,'/v1/merchant/stores/'+cfg.storeSlug+'/categories',undefined,true)
      if(serial===this.merchantSerial&&identity===supportIdentity()&&result&&Array.isArray(result.items))this.setData({merchantAuthorized:true})
    }catch(error){
      if(serial!==this.merchantSerial||identity!==supportIdentity())return
      if(/^(?:Error: )?(?:http_40[13](?:_|$)|not_logged_in$)/.test(String(error)))this.setData({merchantAuthorized:false})
      if(/^(?:Error: )?http_401(?:_|$)/.test(String(error))){wx.removeStorageSync('stall_server_session_v1');wx.removeStorageSync('stall_server_cache_scope_v1');wx.removeStorageSync('stall_merchant_home_preference_v1')}
    }
  },
  async openMerchant(){
    if(!CAN_OPEN_MERCHANT)return
    if(!this.data.merchantAuthorized||this.merchantOpening)return
    const cfg=getCloudContext(),identity=supportIdentity(),serial=this.merchantSerial
    if(!cfg)return
    this.merchantOpening=true
    try{
      const result=await authorizedGet(cfg.apiBase,'/v1/merchant/stores/'+cfg.storeSlug+'/categories')
      if(serial!==this.merchantSerial||identity!==supportIdentity()||!result||!Array.isArray(result.items))return
      wx.setStorageSync('stall_merchant_home_preference_v1',cfg.apiBase+'|'+cfg.storeSlug)
      openMerchantWorkspace()
    }catch(error){
      if(serial!==this.merchantSerial||identity!==supportIdentity())return
      if(/^(?:Error: )?(?:http_40[13](?:_|$)|not_logged_in$)/.test(String(error)))this.setData({merchantAuthorized:false})
      if(/^(?:Error: )?http_401(?:_|$)/.test(String(error))){wx.removeStorageSync('stall_server_session_v1');wx.removeStorageSync('stall_server_cache_scope_v1');wx.removeStorageSync('stall_merchant_home_preference_v1')}
      wx.showToast({title:'商家权限验证失败',icon:'none'})
    }
    finally{this.merchantOpening=false}
  },
  async onShow(){this.setData({accountName:getSessionToken()?'微信用户':'未登录',accountSubtitle:getSessionToken()?'微信身份已连接':'登录后管理订单与配送'});const serial=++this.serial,identity=supportIdentity(),cfg=supportConfig();this.setData({cloudSupport:!!cfg,...this.merchantContext===identity?{}:{supportUnread:null}});this.checkMerchant();if(!cfg)return;try{const r=await customerSupportGet('unread');if(serial===this.serial&&identity===supportIdentity())this.setData({supportUnread:r.unread})}catch(_){/* No local fallback or fabricated unread count. */}},
  onHide(){this.serial++;this.merchantSerial++;this.loginSerial++;this.setData({loginBusy:false})},
  onUnload(){this.serial++;this.merchantSerial++;this.loginSerial++},
  openOrders(e:any) {
    const tab=String(e?.currentTarget?.dataset?.tab||'all'),fulfillment=String(e?.currentTarget?.dataset?.fulfillment||'')
    wx.setStorageSync('stall_order_tab_entry_v1',{tab,fulfillment})
    wx.switchTab({url:'/pages/orders/orders'})
  },
  unavailable(){wx.showToast({title:'该服务暂未开通',icon:'none'})},
  serviceInfo(e:any){const kind=String(e.currentTarget.dataset.kind);const content:Record<string,string>={faq:'在商品页或分类页加入购物车，选择商品后进入结算。配送区域、费用、库存和营业时间以店铺实时规则为准。订单进度可在「我的订单」中查看。',about:'本小程序提供店铺商品浏览、购物车、订单与配送服务。订单及配送信息由当前店铺管理。'};wx.showModal({title:kind==='faq'?'常见问题':'关于我们',content:content[kind]||'',showCancel:false})}

})
