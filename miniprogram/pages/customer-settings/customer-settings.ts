import {getSessionToken,getCloudContext} from '../../modules/shared/runtime/context'
import {logoutCurrentSession} from '../../modules/shared/runtime/auth'
const PREF_KEY='stall_customer_order_notice_pref_v1'
Page({
 data:{orderNoticeEnabled:true,loggedIn:false,logoutBusy:false,privacyExpanded:false},
 onShow(){this.setData({loggedIn:!!getSessionToken(),orderNoticeEnabled:wx.getStorageSync(PREF_KEY)!==false})},
 toggleOrderNotice(e:any){const v=!!e.detail.value;wx.setStorageSync(PREF_KEY,v);this.setData({orderNoticeEnabled:v})},
 togglePrivacy(){this.setData({privacyExpanded:!this.data.privacyExpanded})},
 logout(){
  if(this.data.logoutBusy||!this.data.loggedIn)return
  wx.showModal({title:'退出登录',content:'退出当前账号？',confirmText:'退出登录',success:async result=>{
   if(!result.confirm)return
   this.setData({logoutBusy:true,loggedIn:false})
   const cfg=getCloudContext()
   try{if(cfg)await logoutCurrentSession(cfg.apiBase)}
   finally{this.setData({logoutBusy:false});wx.showToast({title:'已退出当前设备',icon:'success'})}
  }})
 }
})