import { cachedCustomerNickname,cacheCustomerNickname } from '../../modules/shared/runtime/customerNicknameCache'
import { getSessionToken,getCloudContext } from '../../modules/shared/runtime/context'
import { authorizedGet } from '../../modules/shared/runtime/auth'
const NICKNAME_KEY='stall_customer_nickname_v1' // Legacy local value; no longer used as account profile.
Page({
  data: { loggedIn:false,nickname:'',profileBusy:false,profileStatus:'',avatarStyle:'violet',avatarBusy:false,avatarStatus:'' },
  profileReadSerial:0,
  editSerial:0,
  async onShow() {
    const token=getSessionToken(), loggedIn=!!token
    const serial=++this.profileReadSerial
    const editAtStart=this.editSerial
    this.setData({loggedIn,profileStatus:'',nickname:loggedIn?cachedCustomerNickname():''})
    if(!token)return
    try {
      const cfg=getCloudContext()
      if(!cfg)throw Error('missing_api')
      const profile=await authorizedGet(cfg.apiBase,'/v1/customer/profile')
      if(serial!==this.profileReadSerial||getSessionToken()!==token||this.editSerial!==editAtStart)return
      cacheCustomerNickname(String(profile.nickname||''));this.setData({nickname:String(profile.nickname||''),profileStatus:'',avatarStyle:String(profile.avatarStyle||'violet')})
    } catch(error:any) {
      if(serial===this.profileReadSerial&&getSessionToken()===token)
        this.setData({profileStatus:'读取云端昵称失败：'+String(error?.message||error).slice(0,80)})
    }
  },
  async chooseAvatarStyle(e:any){
    if(!getSessionToken()||this.data.avatarBusy)return
    const style=String(e?.currentTarget?.dataset?.style||'')
    if(!['violet','blue','green','peach'].includes(style))return
    const cfg=getCloudContext(),token=getSessionToken()
    if(!cfg||!token)return
    this.setData({avatarBusy:true,avatarStatus:'正在保存头像样式…'})
    try{
      const result:any=await new Promise((resolve,reject)=>wx.request({
        url:cfg.apiBase.replace(/\/$/,'')+'/v1/customer/avatar-style',method:'PUT',
        header:{Authorization:'Bearer '+token,'content-type':'application/json'},
        data:{avatarStyle:style},timeout:15000,
        success:(r:any)=>r.statusCode===200?resolve(r.data):reject(Error('HTTP '+r.statusCode)),
        fail:reject
      }))
      if(getSessionToken()!==token)return
      if(result?.avatarStyle!==style)throw Error('服务器未确认')
      this.setData({avatarStyle:style,avatarStatus:'头像样式已保存到云端'})
    }catch(_){if(getSessionToken()===token)this.setData({avatarStatus:'保存头像失败，请重试'})}
    finally{this.setData({avatarBusy:false})}
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
      cacheCustomerNickname(nickname);this.setData({nickname,profileStatus:'云端保存成功，重新进入仍会保留'})
      wx.showToast({title:'云端保存成功',icon:'success'})
    } catch(error:any) {
      if(getSessionToken()===token)this.setData({profileStatus:'保存未确认：'+String(error?.message||error).slice(0,100)})
    } finally {this.setData({profileBusy:false})}
  },
})
