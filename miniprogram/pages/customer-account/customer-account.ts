import { cachedCustomerNickname,cacheCustomerNickname } from '../../modules/shared/runtime/customerNicknameCache'
import { getSessionToken,getCloudContext } from '../../modules/shared/runtime/context'
import { authorizedGet } from '../../modules/shared/runtime/auth'
const NICKNAME_KEY='stall_customer_nickname_v1' // Legacy local value; no longer used as account profile.
Page({
  data: { loggedIn:false,nickname:'',profileBusy:false,profileStatus:'',avatarStyle:'violet',avatarBusy:false,avatarStatus:'',avatarPhotoPath:'',avatarMenu:false,avatarMissing:false,photoBusy:false,photoStatus:'',phoneLoading:false,phoneBound:false,maskedPhone:'',phoneStatus:'',phoneVerificationAvailable:false,phoneReadSerial:0,regionParts:[] as string[],regionLabel:'',customerId:'' },
  profileReadSerial:0,
  editSerial:0,
  async onShow() {
    const token=getSessionToken(), loggedIn=!!token
    const serial=++this.profileReadSerial
    const editAtStart=this.editSerial
    this.setData({loggedIn,profileStatus:'',avatarPhotoPath:'',avatarMenu:false,avatarMissing:false,photoStatus:'',nickname:loggedIn?cachedCustomerNickname():'',phoneBound:false,maskedPhone:'',phoneStatus:'',phoneVerificationAvailable:false})
    if(!token)return
    this.loadPhoneStatus(token)
    this.loadAvatarPhoto(token,serial)
    try {
      const cfg=getCloudContext()
      if(!cfg)throw Error('missing_api')
      const profile=await authorizedGet(cfg.apiBase,'/v1/customer/profile')
      if(serial!==this.profileReadSerial||getSessionToken()!==token||this.editSerial!==editAtStart)return
      cacheCustomerNickname(String(profile.nickname||''));this.setData({nickname:String(profile.nickname||''),profileStatus:'',avatarStyle:String(profile.avatarStyle||'violet'),customerId:String(profile.customerId||profile.userId||'')})
    } catch(error:any) {
      if(serial===this.profileReadSerial&&getSessionToken()===token)
        this.setData({profileStatus:'读取云端昵称失败：'+String(error?.message||error).slice(0,80)})
    }
  },
  async loadPhoneStatus(token:string){
    const cfg=getCloudContext()
    if(!cfg)return
    const readSerial=this.data.phoneReadSerial+1
    this.setData({phoneLoading:true,phoneReadSerial:readSerial})
    try{
      const result=await authorizedGet(cfg.apiBase,'/v1/customer/phone')
      if(getSessionToken()!==token||this.data.phoneReadSerial!==readSerial)return
      this.setData({phoneBound:result.bound===true,maskedPhone:String(result.maskedPhone||''),phoneVerificationAvailable:result.verificationAvailable===true})
    }catch(error:any){
      if(getSessionToken()===token&&this.data.phoneReadSerial===readSerial)this.setData({phoneVerificationAvailable:false,phoneStatus:'手机号状态尚不可用，请稍后重试'})
    }finally{if(getSessionToken()===token&&this.data.phoneReadSerial===readSerial)this.setData({phoneLoading:false})}
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
          this.setData({phoneStatus:error==='phone_already_bound'?'该手机号已绑定其他账号，不能自动合并':error==='not_enabled'?'手机号绑定服务尚未启用':error==='wechat_phone_verification_failed'?'微信未能验证该号码，仅支持中国大陆 +86 手机号':error==='unauthorized'?'登录状态已失效，请重新登录':'绑定未成功，请稍后重试'})
        }
      },
      fail:()=>{if(getSessionToken()===token)this.setData({phoneStatus:'连接服务器失败，请重试'})},
      complete:()=>{if(getSessionToken()===token)this.setData({phoneLoading:false})}
    })
  },
  showPhoneBindNotice(){
    wx.showModal({title:'手机号绑定',content:'手机号必须通过微信官方手机号授权或短信验证码验证后才能绑定。当前测试环境尚未启用验证服务，因此暂不接受手工填写号码作为已绑定手机号。',showCancel:false,confirmText:'知道了'})
  },
  openAvatarMenu(){if(this.data.loggedIn&&!this.data.photoBusy)this.setData({avatarMenu:true})},
  closeAvatarMenu(){if(!this.data.photoBusy)this.setData({avatarMenu:false})},
  keepAvatarMenu(){},
  retryAvatarRead(){const token=getSessionToken();if(token){this.setData({photoStatus:''});this.loadAvatarPhoto(token,this.profileReadSerial)}},
  async loadAvatarPhoto(token:string,serial:number){
    const cfg=getCloudContext();if(!cfg)return
    wx.request({url:cfg.apiBase.replace(/\/$/,'')+'/v1/customer/avatar-photo',
      method:'GET',header:{Authorization:'Bearer '+token},timeout:15000,
      success:(r:any)=>{
        if(getSessionToken()!==token||serial!==this.profileReadSerial)return
        if(r.statusCode===404&&r.data?.error==='no_avatar_photo'){
          this.setData({avatarMissing:true,avatarMenu:false,photoStatus:''})
          return
        }
        if(r.statusCode!==200||!r.data?.dataBase64){
          const code=String(r.data?.error||'')
          const explanation=code==='not_found'||code==='not_enabled'?'头像服务尚未在当前服务器启用':code==='private_avatar_storage_not_configured'?'服务器尚未配置头像存储':code==='profile_not_found'?'当前微信身份还没有对应的顾客档案':code==='no_avatar_photo'?'尚未设置头像':code==='unauthorized'?'登录状态失效，请重新登录':code==='avatar_read_unavailable'?'服务器无法读取已保存的头像':'头像读取失败（HTTP '+r.statusCode+'）'
          // Loading an avatar is optional; surface storage errors only after an explicit user action.
          if(code==='private_avatar_storage_not_configured'||code==='not_found'||code==='not_enabled')this.setData({photoStatus:''})
          else this.setData({photoStatus:explanation})
          return
        }
        const mime=r.data.mimeType==='image/png'?'png':r.data.mimeType==='image/jpeg'?'jpg':''
        if(!mime){this.setData({photoStatus:'服务器返回的头像格式不受支持'});return}
        const filename=wx.env.USER_DATA_PATH+'/customer-avatar-'+Date.now()+'.'+mime
        wx.getFileSystemManager().writeFile({filePath:filename,data:r.data.dataBase64,encoding:'base64',
          success:()=>{if(getSessionToken()===token&&serial===this.profileReadSerial)this.setData({avatarPhotoPath:filename,avatarMissing:false,photoStatus:''})},fail:()=>{if(getSessionToken()===token&&serial===this.profileReadSerial)this.setData({photoStatus:'已读取头像，但写入本机临时文件失败'})}})
      },
      fail:()=>{if(getSessionToken()===token&&serial===this.profileReadSerial)this.setData({photoStatus:'头像读取失败，请检查网络'})}
    })
  },
  useWechatAvatar(e:any){
    const path=String(e?.detail?.avatarUrl||'')
    if(!path){this.setData({photoStatus:'未选择微信头像'});return}
    this.setData({avatarMenu:false})
    this.uploadAvatarPath(path)
  },
  chooseAvatarPhoto(){
    if(!getSessionToken()||!getCloudContext()||this.data.photoBusy)return
    this.setData({avatarMenu:false})
    wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['compressed'],
      success:(selection:any)=>{const file=selection.tempFiles?.[0];if(file?.tempFilePath)this.uploadAvatarPath(file.tempFilePath,file.size)}
    })
  },
  uploadAvatarPath(path:string,size?:number){
    const token=getSessionToken(),cfg=getCloudContext()
    if(!token||!cfg||this.data.photoBusy)return
    if(size&&size>512*1024){this.setData({photoStatus:'图片超过512KB，请换一张较小的照片'});return}
    const serial=this.profileReadSerial
    this.setData({photoBusy:true,photoStatus:'正在保存头像…'})
    wx.getFileSystemManager().readFile({filePath:path,encoding:'base64',success:(content:any)=>{
      if(getSessionToken()!==token||serial!==this.profileReadSerial){this.setData({photoBusy:false});return}
      const encoded=String(content?.data||'')
      if(!encoded||encoded.length>Math.ceil(512*1024/3)*4+4){this.setData({photoBusy:false,photoStatus:'头像超过512KB，请换一张较小的照片'});return}
      wx.request({url:cfg.apiBase.replace(/\/$/,'')+'/v1/customer/avatar-photo',
        method:'PUT',header:{Authorization:'Bearer '+token,'content-type':'application/json'},
        data:{dataBase64:encoded},timeout:20000,
        success:(res:any)=>{
          if(getSessionToken()!==token||serial!==this.profileReadSerial)return
          if(res.statusCode===200){this.setData({avatarPhotoPath:path,avatarMissing:false,avatarMenu:false,photoStatus:'头像已保存到云端'})}
          else {const code=String(res.data?.error||'');const hint=code==='not_found'||code==='not_enabled'?'头像服务尚未在当前服务器启用':code==='private_avatar_storage_not_configured'?'服务器尚未配置头像存储':code==='profile_not_found'?'当前微信身份尚未建立顾客档案':code==='invalid_image'?'图片格式不受支持，请选择 JPEG 或 PNG':code==='too_large'?'图片超过512KB':code==='avatar_storage_unavailable'?'服务器图片存储不可用':code==='unauthorized'?'登录已过期，请重新登录':'HTTP '+res.statusCode+' · '+code;this.setData({photoStatus:'头像保存失败：'+hint})}
        },fail:()=>{if(getSessionToken()===token&&serial===this.profileReadSerial)this.setData({photoStatus:'网络异常，头像上传失败'})},
        complete:()=>{if(getSessionToken()===token&&serial===this.profileReadSerial)this.setData({photoBusy:false})}
      })
    },fail:()=>this.setData({photoBusy:false,photoStatus:'无法读取所选头像'})})
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
  onRegionChange(e:any){
    const parts=Array.isArray(e?.detail?.value)?e.detail.value.map(String):[]
    this.setData({regionParts:parts,regionLabel:parts.join(' ')})
    wx.showToast({title:'地区仅在本页暂存',icon:'none'})
  },
  copyCustomerId(){
    const id=String(this.data.customerId||'')
    if(!id){wx.showToast({title:'用户 ID 尚未开放',icon:'none'});return}
    wx.setClipboardData({data:id})
  },
  showAccountCancellation(){
    wx.showModal({title:'账号注销',content:'账号注销需要后端验证身份、核对未完成订单，并处理依法需要保留的交易记录。当前尚未开通注销接口，因此不会直接删除账号。',showCancel:false,confirmText:'知道了'})
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
