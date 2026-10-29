import { cachedCustomerNickname,cacheCustomerNickname } from '../../modules/shared/runtime/customerNicknameCache'
import { getSessionToken,getCloudContext } from '../../modules/shared/runtime/context'
import { authorizedGet } from '../../modules/shared/runtime/auth'
const NICKNAME_KEY='stall_customer_nickname_v1' // Legacy local value; no longer used as account profile.
Page({
  data: { loggedIn:false,nickname:'',profileBusy:false,profileStatus:'',avatarStyle:'violet',avatarBusy:false,avatarStatus:'',avatarPhotoPath:'',photoBusy:false,photoStatus:'',phoneLoading:false,phoneBound:false,maskedPhone:'',phoneStatus:'' },
  profileReadSerial:0,
  editSerial:0,
  async onShow() {
    const token=getSessionToken(), loggedIn=!!token
    const serial=++this.profileReadSerial
    const editAtStart=this.editSerial
    this.setData({loggedIn,profileStatus:'',avatarPhotoPath:'',photoStatus:'',nickname:loggedIn?cachedCustomerNickname():'',phoneBound:false,maskedPhone:'',phoneStatus:''})
    if(!token)return
    this.loadPhoneStatus(token)
    try {
      const cfg=getCloudContext()
      if(!cfg)throw Error('missing_api')
      const profile=await authorizedGet(cfg.apiBase,'/v1/customer/profile')
      if(serial!==this.profileReadSerial||getSessionToken()!==token||this.editSerial!==editAtStart)return
      cacheCustomerNickname(String(profile.nickname||''));this.setData({nickname:String(profile.nickname||''),profileStatus:'',avatarStyle:String(profile.avatarStyle||'violet')});this.loadAvatarPhoto(token)
    } catch(error:any) {
      if(serial===this.profileReadSerial&&getSessionToken()===token)
        this.setData({profileStatus:'读取云端昵称失败：'+String(error?.message||error).slice(0,80)})
    }
  },
  async loadPhoneStatus(token:string){
    const cfg=getCloudContext()
    if(!cfg)return
    this.setData({phoneLoading:true})
    try{
      const result=await authorizedGet(cfg.apiBase,'/v1/customer/phone')
      if(getSessionToken()!==token)return
      this.setData({phoneBound:result.bound===true,maskedPhone:String(result.maskedPhone||''),phoneStatus:''})
    }catch(error:any){
      if(getSessionToken()===token)this.setData({phoneStatus:'手机号状态读取失败，请稍后重试'})
    }finally{if(getSessionToken()===token)this.setData({phoneLoading:false})}
  },
  bindWechatPhone(e:any){
    const code=String(e?.detail?.code||'')
    if(!code){
      this.setData({phoneStatus:'未获得微信手机号授权，请确认小程序已开通该能力'})
      return
    }
    const token=getSessionToken(),cfg=getCloudContext()
    if(!token||!cfg||this.data.phoneLoading)return
    this.setData({phoneLoading:true,phoneStatus:'正在通过微信官方验证手机号…'})
    wx.request({
      url:cfg.apiBase.replace(/\/$/,'')+'/v1/customer/phone/wechat-bind',
      method:'POST',header:{Authorization:'Bearer '+token,'content-type':'application/json'},
      data:{code},timeout:20000,
      success:(r:any)=>{
        if(getSessionToken()!==token)return
        if(r.statusCode===200&&r.data?.bound===true){
          this.setData({phoneBound:true,maskedPhone:String(r.data.maskedPhone||''),phoneStatus:'手机号已通过微信验证并绑定'})
          this.loadPhoneStatus(token)
        }else{
          const error=String(r.data?.error||r.statusCode)
          this.setData({phoneStatus:error==='phone_already_bound'?'该手机号已绑定其他账号，不能自动合并':'绑定未成功：'+error})
        }
      },
      fail:()=>{if(getSessionToken()===token)this.setData({phoneStatus:'连接服务器失败，请重试'})},
      complete:()=>{if(getSessionToken()===token)this.setData({phoneLoading:false})}
    })
  },
  showPhoneBindNotice(){
    wx.showModal({title:'手机号绑定',content:'手机号必须通过微信官方手机号授权或短信验证码验证后才能绑定。当前测试环境尚未启用验证服务，因此暂不接受手工填写号码作为已绑定手机号。',showCancel:false,confirmText:'知道了'})
  },
  async loadAvatarPhoto(token:string){
    const cfg=getCloudContext();if(!cfg)return
    wx.request({url:cfg.apiBase.replace(/\/$/,'')+'/v1/customer/avatar-photo',
      method:'GET',header:{Authorization:'Bearer '+token},timeout:15000,
      success:(r:any)=>{
        if(getSessionToken()!==token||r.statusCode!==200||!r.data?.dataBase64)return
        const mime=r.data.mimeType==='image/png'?'png':'jpg'
        const filename=wx.env.USER_DATA_PATH+'/customer-avatar-'+Date.now()+'.'+mime
        wx.getFileSystemManager().writeFile({filePath:filename,data:r.data.dataBase64,encoding:'base64',success:()=>{if(getSessionToken()===token)this.setData({avatarPhotoPath:filename})}})
      }
    })
  },
  chooseAvatarPhoto(){
    const token=getSessionToken(),cfg=getCloudContext()
    if(!token||!cfg||this.data.photoBusy)return
    wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['compressed'],success:(selection:any)=>{
      const file=selection.tempFiles?.[0]
      if(!file)return
      if(file.size>512*1024){this.setData({photoStatus:'图片超过512KB，请选择更小的照片'});return}
      this.setData({photoBusy:true,photoStatus:'正在上传头像…'})
      wx.getFileSystemManager().readFile({filePath:file.tempFilePath,encoding:'base64',success:(content:any)=>{
        wx.request({url:cfg.apiBase.replace(/\/$/,'')+'/v1/customer/avatar-photo',
          method:'PUT',header:{Authorization:'Bearer '+token,'content-type':'application/json'},
          data:{dataBase64:content.data},timeout:20000,
          success:(res:any)=>{
            if(getSessionToken()!==token)return
            if(res.statusCode===200){this.setData({avatarPhotoPath:file.tempFilePath,photoStatus:'照片头像已保存到云端'})}
            else this.setData({photoStatus:'上传失败：'+String(res.data?.error||res.statusCode)})
          },fail:()=>this.setData({photoStatus:'网络异常，上传失败'}),
          complete:()=>this.setData({photoBusy:false})
        })
      },fail:()=>this.setData({photoBusy:false,photoStatus:'无法读取所选图片'})})
    }})
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
