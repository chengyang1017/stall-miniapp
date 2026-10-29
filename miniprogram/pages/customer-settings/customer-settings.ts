import { getSessionToken,getCloudContext } from '../../modules/shared/runtime/context'\nimport { logoutCurrentSession } from '../../modules/shared/runtime/auth'\nconst NICKNAME_KEY='stall_customer_nickname_v1'\nconst PREF_KEY = 'stall_customer_order_notice_pref_v1'
Page({
  data: { orderNoticeEnabled: true,loggedIn:false,nickname:'',logoutBusy:false },
  onShow() {
    const v = wx.getStorageSync(PREF_KEY)
    this.setData({ orderNoticeEnabled: v !== false, loggedIn:!!getSessionToken(),nickname:String(wx.getStorageSync(NICKNAME_KEY)||'') })
  },
  onNicknameInput(e:any){this.setData({nickname:String(e.detail.value||'').slice(0,30)})},
  saveNickname(){
    if(!this.data.loggedIn)return
    const name=this.data.nickname.trim()
    if(name.length>30)return
    if(name)wx.setStorageSync(NICKNAME_KEY,name)
    else wx.removeStorageSync(NICKNAME_KEY)
    wx.showToast({title:'昵称已保存到本机',icon:'none'})
  },
  logout(){
    if(this.data.logoutBusy||!this.data.loggedIn)return
    wx.showModal({title:'退出登录',content:'退出当前账号？',confirmText:'退出登录',success:async r=>{
      if(!r.confirm)return
      this.setData({logoutBusy:true,loggedIn:false})
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
