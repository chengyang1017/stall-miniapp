import { supportConfig,customerSupportGet,supportIdentity } from '../../modules/customer/api/support'
Page({
  data:{supportUnread:null as number|null,cloudSupport:false},
  serial:0,
  async onShow(){const serial=++this.serial,identity=supportIdentity(),cfg=supportConfig();this.setData({cloudSupport:!!cfg,supportUnread:null});if(!cfg)return;try{const r=await customerSupportGet('unread');if(serial===this.serial&&identity===supportIdentity())this.setData({supportUnread:r.unread})}catch(_){/* No local fallback or fabricated unread count. */}},
  onHide(){this.serial++;this.setData({supportUnread:null})},
  openOrders() {
    wx.switchTab({ url: '/pages/orders/orders' })
  }
})
