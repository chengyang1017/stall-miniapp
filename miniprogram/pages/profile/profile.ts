import { getCloudContext } from '../../modules/shared/runtime/context'
import { authorizedGet } from '../../modules/shared/runtime/auth'
import { supportConfig,customerSupportGet,supportIdentity } from '../../modules/customer/api/support'
Page({
  data:{supportUnread:null as number|null,cloudSupport:false,merchantAuthorized:false},
  serial:0,
  merchantSerial:0,
  merchantOpening:false,
  async checkMerchant(){
    const serial=++this.merchantSerial,cfg=getCloudContext(),identity=supportIdentity()
    this.setData({merchantAuthorized:false})
    if(!cfg)return
    try{
      const result=await authorizedGet(cfg.apiBase,'/v1/merchant/stores/'+cfg.storeSlug+'/categories')
      if(serial===this.merchantSerial&&identity===supportIdentity()&&result&&Array.isArray(result.items))this.setData({merchantAuthorized:true})
    }catch(_){/* A failed check never exposes the merchant shortcut. */}
  },
  async openMerchant(){
    if(!this.data.merchantAuthorized||this.merchantOpening)return
    const cfg=getCloudContext(),identity=supportIdentity(),serial=this.merchantSerial
    if(!cfg)return
    this.merchantOpening=true
    this.setData({merchantAuthorized:false})
    try{
      const result=await authorizedGet(cfg.apiBase,'/v1/merchant/stores/'+cfg.storeSlug+'/categories')
      if(serial!==this.merchantSerial||identity!==supportIdentity()||!result||!Array.isArray(result.items))return
      wx.setStorageSync('stall_merchant_home_preference_v1',cfg.apiBase+'|'+cfg.storeSlug)
      wx.navigateTo({url:'/pages/admin/admin'})
    }catch(_){if(serial===this.merchantSerial)wx.showToast({title:'商家权限验证失败',icon:'none'})}
    finally{this.merchantOpening=false}
  },
  async onShow(){const serial=++this.serial,identity=supportIdentity(),cfg=supportConfig();this.setData({cloudSupport:!!cfg,supportUnread:null});this.checkMerchant();if(!cfg)return;try{const r=await customerSupportGet('unread');if(serial===this.serial&&identity===supportIdentity())this.setData({supportUnread:r.unread})}catch(_){/* No local fallback or fabricated unread count. */}},
  onHide(){this.serial++;this.merchantSerial++;this.setData({supportUnread:null,merchantAuthorized:false})},
  openOrders() {
    wx.switchTab({ url: '/pages/orders/orders' })
  }
})
