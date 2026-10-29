import { getSessionToken,getCloudContext } from '../../modules/shared/runtime/context'
import { authorizedGet,logoutCurrentSession } from '../../modules/shared/runtime/auth'
const NICKNAME_KEY='stall_customer_nickname_v1' // Legacy local value; no longer used as account profile.
const PREF_KEY = 'stall_customer_order_notice_pref_v1'
Page({
  data: { orderNoticeEnabled: true,loggedIn:false,nickname:'',logoutBusy:false,profileBusy:false,profileStatus:'' },
  profileReadSerial:0,
  editSerial:0,
  async onShow() {
    const token=getSessionToken(), loggedIn=!!token
    const v=wx.getStorageSync(PREF_KEY)
    const serial=++this.profileReadSerial
    const editAtStart=this.editSerial
    this.setData({orderNoticeEnabled:v!==false,loggedIn,profileStatus:loggedIn?'正在读取云端昵称…':'',...(loggedIn?{}:{nickname:''})})
    if(!token)return
    try {
      const cfg=getCloudContext()
      if(!cfg)throw Error('missing_api')
      const profile=await authorizedGet(cfg.apiBase,'/v1/customer/profile')
      if(serial!==this.profileReadSerial||getSessionToken()!==token||this.editSerial!==editAtStart)return
      this.setData({nickname:String(profile.nickname||''),profileStatus:''})
    } catch(error:any) {
      if(serial===this.profileReadSerial&&getSessionToken()===token)
        this.setData({profileStatus:'读取云端昵称失败：'+String(error?.message||error).slice(0,80)})
    }
  },
  onNicknameInput(e:any){this.editSerial++;this.setData({nickname:String(e.detail.value||'').slice(0,30),profileStatus:''})},
  async saveNickname(){
    if(!getSessionToken()||this.data.profileBusy)return
    const cfg=getCloudContext(),token=getSessionToken()
    const nickname=this.data.nickname.trim()
    if(!cfg||!token||nickname.length>30)return
    ++this.profileReadSerial
    this.setData({profileBusy:true,profileStatus:'正在保存到云端…'})
    try {
      const result:any=await new Promise((resolve,reject)=>wx.request({
        url:cfg.apiBase.replace(/\/$/,'')+'/v1/customer/profile',method:'PUT',
        header:{Authorization:'Bearer '+token,'content-type':'application/json'},
        data:{nickname},timeout:15000,
        success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error('保存接口 HTTP '+r.statusCode+' '+String(r.data?.error||''))),
        fail:(err:any)=>reject(Error(String(err?.errMsg||'网络错误')))
      }))
      if(getSessionToken()!==token)return
      if(result?.nickname!==nickname)throw Error('服务器返回的昵称不一致')
      const confirmed=await authorizedGet(cfg.apiBase,'/v1/customer/profile')
      if(getSessionToken()!==token)return
      if(confirmed?.nickname!==nickname)throw Error('云端重新读取的昵称不一致')
      wx.removeStorageSync(NICKNAME_KEY)
      this.setData({nickname,profileStatus:'云端保存成功，重新进入仍会保留'})
      wx.showToast({title:'云端保存成功',icon:'success'})
    } catch(error:any) {
      if(getSessionToken()===token)this.setData({profileStatus:'保存未确认：'+String(error?.message||error).slice(0,100)})
    } finally {this.setData({profileBusy:false})}
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
