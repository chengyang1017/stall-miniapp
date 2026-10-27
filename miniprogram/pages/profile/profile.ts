import { getCloudContext } from '../../modules/shared/runtime/context'
import { authorizedGet,loginWithWechat } from '../../modules/shared/runtime/auth'
import { CLOUD_ONLY,PUBLIC_API_BASE } from '../../config/cloud'
import { supportConfig,customerSupportGet,supportIdentity } from '../../modules/customer/api/support'
import { CAN_OPEN_MERCHANT,openMerchantWorkspace } from '../../modules/integration/singleAppHost'
Page({
  data:{supportUnread:null as number|null,cloudSupport:false,merchantAuthorized:false,
    loginBusy:false,loginStatus:'',phonePreview:CLOUD_ONLY,previewApi:PUBLIC_API_BASE},
  loginSerial:0,
  serial:0,
  merchantSerial:0,
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
    this.setData({merchantAuthorized:false})
    if(!CAN_OPEN_MERCHANT||!cfg)return
    try{
      const result=await authorizedGet(cfg.apiBase,'/v1/merchant/stores/'+cfg.storeSlug+'/categories')
      if(serial===this.merchantSerial&&identity===supportIdentity()&&result&&Array.isArray(result.items))this.setData({merchantAuthorized:true})
    }catch(_){/* A failed check never exposes the merchant shortcut. */}
  },
  async openMerchant(){
    if(!CAN_OPEN_MERCHANT)return
    if(!this.data.merchantAuthorized||this.merchantOpening)return
    const cfg=getCloudContext(),identity=supportIdentity(),serial=this.merchantSerial
    if(!cfg)return
    this.merchantOpening=true
    this.setData({merchantAuthorized:false})
    try{
      const result=await authorizedGet(cfg.apiBase,'/v1/merchant/stores/'+cfg.storeSlug+'/categories')
      if(serial!==this.merchantSerial||identity!==supportIdentity()||!result||!Array.isArray(result.items))return
      wx.setStorageSync('stall_merchant_home_preference_v1',cfg.apiBase+'|'+cfg.storeSlug)
      openMerchantWorkspace()
    }catch(_){if(serial===this.merchantSerial)wx.showToast({title:'商家权限验证失败',icon:'none'})}
    finally{this.merchantOpening=false}
  },
  async onShow(){const serial=++this.serial,identity=supportIdentity(),cfg=supportConfig();this.setData({cloudSupport:!!cfg,supportUnread:null});this.checkMerchant();if(!cfg)return;try{const r=await customerSupportGet('unread');if(serial===this.serial&&identity===supportIdentity())this.setData({supportUnread:r.unread})}catch(_){/* No local fallback or fabricated unread count. */}},
  onHide(){this.serial++;this.merchantSerial++;this.loginSerial++;this.setData({supportUnread:null,merchantAuthorized:false,loginBusy:false})},
  openOrders() {
    wx.switchTab({ url: '/pages/orders/orders' })
  }
})
