import { getSessionToken,getCloudContext } from '../../modules/shared/runtime/context'
import { authorizedGet,logoutCurrentSession } from '../../modules/shared/runtime/auth'
const NICKNAME_KEY='stall_customer_nickname_v1' // Legacy local value; no longer used as account profile.
const PREF_KEY = 'stall_customer_order_notice_pref_v1'
Page({
  data: { orderNoticeEnabled: true,loggedIn:false,nickname:'',logoutBusy:false,profileBusy:false,profileStatus:'' },,
  async onShow() {
    const v = wx.getStorageSync(PREF_KEY)
    this.setData({ orderNoticeEnabled: v !== false, loggedIn:!!getSessionToken(),nickname:'',profileStatus:'' })
    if(!getSessionToken())return
    try{const cfg=getCloudContext();if(!cfg)throw Error('no_cloud_context');const profile=await authorizedGet(cfg.apiBase,'/v1/customer/profile');if(getSessionToken())this.setData({nickname:String(profile.nickname||'')})}
    catch(_){this.setData({profileStatus:'云端个人资料暂时无法读取，请确认服务器已更新。'})}
  },
  onNicknameInput(e:any){this.setData({nickname:String(e.detail.value||'').slice(0,30)})},
  async saveNickname(){
    if(!getSessionToken()||this.data.profileBusy)return
    const cfg=getCloudContext(),token=getSessionToken()
    const nickname=this.data.nickname.trim()
    if(!cfg||!token||nickname.length>30)return
    this.setData({profileBusy:true,profileStatus:''})
    try{
      const result:any=await new Promise((resolve,reject)=>wx.request({
        url:cfg.apiBase.replace(/\/$/,'')+'/v1/customer/profile',method:'PUT',
        header:{Authorization:'Bearer '+token,'content-type':'application/json'},
        data:{nickname},timeout:15000,
        success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error('http_'+r.statusCode)),fail:reject
      }))
      if(getSessionToken()!==token)return
      wx.removeStorageSync(NICKNAME_KEY)
      this.setData({nickname:String(result.nickname||''),profileStatus:'昵称已保存到云端'})
      wx.showToast({title:'云端保存成功',icon:'success'})
    }catch(_){if(getSessionToken()===token)this.setData({profileStatus:'保存失败，请稍后重试'})}
    finally{this.setData({profileBusy:false})}
  },
  logout(){
    if(this.data.logoutBusy||!this.data.loggedIn)return
    wx.showModal({title:'退出登录',content:'退出当前账号？',confirmText:'退出登录',success:async r=>{
      if(!r.confirm)return
      this.setData({logoutBusy:true,loggedIn:false,nickname:'',profileStatus:''})
      const cfg=getCloudContext()
      try{if(cfg)await logoutCurrentSession(cfg.apiBase)}
      finally{this.setData({logoutBusy:false});wx.showToast({title:'已退出当前设备',icon:'success'})}
    }})
  },
  toggleOrderNotice(e: any) {
    const enabled = !!e.detail.value
    wx.setStorageSync(PREF_KEY, enabled)
    this.setData({ orderNoticeEnabled: enabled })
  }
})
