import { cachedCustomerNickname,cacheCustomerNickname } from '../../modules/shared/runtime/customerNicknameCache'
import { getSessionToken } from '../../modules/shared/runtime/context'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { authorizedGet,loginWithWechat,logoutCurrentSession,hasRecentMerchantPermission } from '../../modules/shared/runtime/auth'
import { CLOUD_ONLY,PUBLIC_API_BASE } from '../../config/cloud'
import { supportConfig,customerSupportGet,supportIdentity } from '../../modules/customer/api/support'
import { CAN_OPEN_MERCHANT,openMerchantWorkspace } from '../../modules/integration/singleAppHost'
Page({
  data:{accountName:'未登录',avatarStyle:'violet',avatarPhotoPath:'',accountSubtitle:'登录后管理订单与配送',orderEntries:[{label:'待付款',icon:'♧',tab:'unpaid',fulfillment:''},{label:'待发货',icon:'◇',tab:'active',fulfillment:'pending'},{label:'配送中',icon:'♧',tab:'active',fulfillment:'delivering'},{label:'已完成',icon:'✓',tab:'completed',fulfillment:''},{label:'售后/退款',icon:'↔',tab:'other',fulfillment:'refund'}],supportUnread:null as number|null,cloudSupport:false,merchantAuthorized:false,
    loginBusy:false,loginStatus:'',logoutBusy:false,loggedIn:false,loginPanel:false,phoneOnboarding:false,phoneBindBusy:false,phoneBindStatus:'',loginMethod:'wechat',phoneNumber:'',phonePreview:CLOUD_ONLY,previewApi:PUBLIC_API_BASE},
  loginSerial:0,
  serial:0,
  merchantSerial:0,merchantContext:'',
  merchantOpening:false,
  keepLoginOpen(){},
  showLogin(){if(getSessionToken()){wx.navigateTo({url:'/pages/customer-account/customer-account'});return}this.setData({loginPanel:true,loginStatus:''})},
  closeLogin(){if(!this.data.loginBusy)this.setData({loginPanel:false,loginStatus:''})},
  selectLoginMethod(e:any){
    const method=String(e?.currentTarget?.dataset?.method||'wechat')
    if(method==='wechat'||method==='phone')this.setData({loginMethod:method,loginStatus:''})
  },
  onPhoneInput(e:any){this.setData({phoneNumber:String(e?.detail?.value||'').replace(/\D/g,'').slice(0,11)})},
  requestSmsCode(){
    if(!/^1[3-9]\d{9}$/.test(this.data.phoneNumber)){
      this.setData({loginStatus:'请输入正确的中国大陆11位手机号'});return
    }
    this.setData({loginStatus:'短信验证码服务尚未接入，暂不能使用手机号登录。请先选择微信快捷登录。'})
  },
  loginErrorMessage(error:any):string{
    const code=String(error?.message||error||'')
    if(code==='login_http_503_auth_not_configured')return '服务器未配置微信登录 AppID 或密钥，请管理员检查 Render 环境变量。'
    if(code==='login_http_401_wechat_auth_failed')return '微信凭证验证失败。可能是小程序 AppID 与服务器配置不匹配。'
    if(code==='login_http_400_invalid_code')return '微信临时登录凭证无效，请重新尝试。'
    if(code==='login_http_503_service_unavailable')return '服务器数据库或内部服务暂不可用（503）。'
    if(code==='login_network_domain')return '请求域名未通过微信校验，请检查小程序合法 request 域名。'
    if(code==='login_network_unavailable')return '无法连接测试服务器，请检查网络或服务器状态。'
    if(code==='wx_login_api_failed'||code==='wx_login_failed')return '微信未能生成小程序登录凭证，请确认正在使用真实 AppID。'
    if(code==='untrusted_preview_endpoint')return '当前测试服务器地址未获允许。'
    if(code==='session_or_store_changed')return '登录期间账号或店铺发生变化，请重新登录。'
    if(code==='server_login_failed')return '服务器登录响应不完整。'
    if(code.startsWith('login_http_'))return '登录接口返回错误：'+code.slice(11).replace(/_/g,' / ').slice(0,60)
    return '微信登录失败，原因暂未识别；请联系管理员检查登录配置。'
  },
  async loginWechat(){
    const cfg=getCloudContext()
    if(!cfg||this.data.loginBusy)return
    const serial=++this.loginSerial
    this.setData({loginBusy:true,loginStatus:'正在通过微信验证身份…',merchantAuthorized:false})
    try{
      await loginWithWechat(cfg.apiBase)
      const current=getCloudContext()
      if(serial!==this.loginSerial||!current||current.apiBase!==cfg.apiBase||current.storeSlug!==cfg.storeSlug)return
      this.setData({loginPanel:false,loginStatus:'微信身份已确认；商家入口需服务器另行授权',accountName:cachedCustomerNickname()||'微信用户',accountSubtitle:'微信身份已连接',loggedIn:true})
      await this.checkFirstLoginPhoneBinding(serial,cfg.apiBase)
      if(serial===this.loginSerial)await this.checkMerchant()
    }catch(error){if(serial===this.loginSerial)this.setData({loginStatus:this.loginErrorMessage(error)})}
    finally{if(serial===this.loginSerial)this.setData({loginBusy:false})}
  },
  async checkFirstLoginPhoneBinding(serial:number,apiBase:string){
    const token=getSessionToken()
    if(!token||serial!==this.loginSerial)return
    try{
      const status=await authorizedGet(apiBase,'/v1/customer/phone')
      if(serial!==this.loginSerial||getSessionToken()!==token)return
      // No extra consent for existing bound accounts. If the backend isn't ready,
      // do not trap customers in an onboarding dialog.
      this.setData({phoneOnboarding:status?.bound===false&&status?.verificationAvailable===true,phoneBindStatus:''})
    }catch(_){if(serial===this.loginSerial&&getSessionToken()===token)this.setData({phoneOnboarding:false})}
  },
  dismissPhoneOnboarding(){if(!this.data.phoneBindBusy)this.setData({phoneOnboarding:false,phoneBindStatus:''})},
  bindFirstLoginPhone(e:any){
    const code=String(e?.detail?.code||'')
    if(!code){this.setData({phoneBindStatus:'尚未授权手机号。可稍后在个人资料中绑定。'});return}
    const cfg=getCloudContext(),token=getSessionToken()
    if(!cfg||!token||this.data.phoneBindBusy)return
    const serial=this.loginSerial
    this.setData({phoneBindBusy:true,phoneBindStatus:'正在通过微信验证手机号…'})
    wx.request({
      url:cfg.apiBase.replace(/\\/$/,'')+'/v1/customer/phone/wechat-bind',
      method:'POST',timeout:20000,
      header:{Authorization:'Bearer '+token,'content-type':'application/json'},
      data:{code},
      success:(res:any)=>{
        if(serial!==this.loginSerial||getSessionToken()!==token)return
        if(res.statusCode===200&&res.data?.bound===true){
          this.setData({phoneOnboarding:false,phoneBindStatus:''})
          wx.showToast({title:'手机号绑定成功',icon:'success'})
        }else{
          const err=String(res.data?.error||'')
          const message=err==='phone_already_bound'?'该号码已关联另一账号，请联系商家处理，不能自动合并':err==='not_enabled'?'手机号绑定暂未开通':err==='wechat_phone_verification_failed'?'微信未能验证该号码，仅支持中国大陆 +86 手机号':'绑定未成功，可以稍后重试'
          this.setData({phoneBindStatus:message})
        }
      },
      fail:()=>{if(serial===this.loginSerial)this.setData({phoneBindStatus:'网络异常，请稍后重试'})},
      complete:()=>{if(serial===this.loginSerial&&getSessionToken()===token)this.setData({phoneBindBusy:false})}
    })
  },
  logout(){
    if(this.data.logoutBusy)return
    wx.showModal({title:'退出登录',content:'退出当前账号？本机登录状态将立即清除。',confirmText:'退出登录',success:async r=>{
      if(!r.confirm)return
      const cfg=getCloudContext()
      ++this.loginSerial;++this.serial;++this.merchantSerial
      this.setData({logoutBusy:true,loggedIn:false,loginPanel:false,phoneOnboarding:false,phoneBindBusy:false,loginBusy:false,merchantAuthorized:false,accountName:'未登录',accountSubtitle:'登录后管理订单与配送',supportUnread:null})
      try{if(cfg)await logoutCurrentSession(cfg.apiBase)}
      finally{
        this.setData({logoutBusy:false})
        wx.showToast({title:'已退出当前设备',icon:'success'})
      }
    }})
  },
  async checkMerchant(){
    const serial=++this.merchantSerial,cfg=getCloudContext(),identity=supportIdentity()
    if(this.merchantContext!==identity||!CAN_OPEN_MERCHANT||!cfg)this.setData({merchantAuthorized:false})
    if(CAN_OPEN_MERCHANT&&cfg&&hasRecentMerchantPermission(cfg.apiBase,cfg.storeSlug))this.setData({merchantAuthorized:true})
    this.merchantContext=identity
    if(!CAN_OPEN_MERCHANT||!cfg)return
    try{
      const result=await authorizedGet(cfg.apiBase,'/v1/merchant/stores/'+cfg.storeSlug+'/categories',undefined,true)
      if(serial===this.merchantSerial&&identity===supportIdentity()&&result&&Array.isArray(result.items))this.setData({merchantAuthorized:true})
    }catch(error){
      if(serial!==this.merchantSerial||identity!==supportIdentity())return
      if(/^(?:Error: )?(?:http_40[13](?:_|$)|not_logged_in$)/.test(String(error)))this.setData({merchantAuthorized:false})
      if(/^(?:Error: )?http_401(?:_|$)/.test(String(error))){wx.removeStorageSync('stall_server_session_v1');wx.removeStorageSync('stall_server_cache_scope_v1');wx.removeStorageSync('stall_merchant_home_preference_v1')}
    }
  },
  async openMerchant(){
    if(!CAN_OPEN_MERCHANT)return
    if(!this.data.merchantAuthorized||this.merchantOpening)return
    const cfg=getCloudContext(),identity=supportIdentity(),serial=this.merchantSerial
    if(!cfg)return
    this.merchantOpening=true
    try{
      const result=await authorizedGet(cfg.apiBase,'/v1/merchant/stores/'+cfg.storeSlug+'/categories')
      if(serial!==this.merchantSerial||identity!==supportIdentity()||!result||!Array.isArray(result.items))return
      wx.setStorageSync('stall_merchant_home_preference_v1',cfg.apiBase+'|'+cfg.storeSlug)
      openMerchantWorkspace()
    }catch(error){
      if(serial!==this.merchantSerial||identity!==supportIdentity())return
      if(/^(?:Error: )?(?:http_40[13](?:_|$)|not_logged_in$)/.test(String(error)))this.setData({merchantAuthorized:false})
      if(/^(?:Error: )?http_401(?:_|$)/.test(String(error))){wx.removeStorageSync('stall_server_session_v1');wx.removeStorageSync('stall_server_cache_scope_v1');wx.removeStorageSync('stall_merchant_home_preference_v1')}
      wx.showToast({title:'商家权限验证失败',icon:'none'})
    }
    finally{this.merchantOpening=false}
  },
  loadAvatarForHeader(token:string,apiBase:string,serial:number){
    wx.request({url:apiBase.replace(/\/$/,'')+'/v1/customer/avatar-photo',method:'GET',timeout:15000,
      header:{Authorization:'Bearer '+token},
      success:(response:any)=>{
        if(serial!==this.serial||getSessionToken()!==token||response.statusCode!==200)return
        if(!response.data||typeof response.data.dataBase64!=='string'||!['image/jpeg','image/png'].includes(response.data.mimeType))return
        const extension=response.data.mimeType==='image/png'?'png':'jpg'
        const file=wx.env.USER_DATA_PATH+'/customer-profile-header-'+Date.now()+'.'+extension
        wx.getFileSystemManager().writeFile({filePath:file,data:response.data.dataBase64,encoding:'base64',
          success:()=>{if(serial===this.serial&&getSessionToken()===token)this.setData({avatarPhotoPath:file})}})
      }
    })
  },
  async onShow(){const loggedIn=!!getSessionToken();this.setData({loggedIn,accountName:loggedIn?(cachedCustomerNickname()||'微信用户'):'未登录',avatarStyle:loggedIn?this.data.avatarStyle:'violet',avatarPhotoPath:'',accountSubtitle:loggedIn?'微信身份已连接':'登录后管理订单与配送'});const serial=++this.serial,identity=supportIdentity(),cfg=supportConfig();this.setData({cloudSupport:!!cfg,...this.merchantContext===identity?{}:{supportUnread:null}});this.checkMerchant();if(loggedIn&&cfg){const token=getSessionToken();if(token)this.loadAvatarForHeader(token,cfg.apiBase,serial);authorizedGet(cfg.apiBase,'/v1/customer/profile').then(p=>{if(serial===this.serial&&getSessionToken()){const name=String(p.nickname||'').trim();cacheCustomerNickname(name);this.setData({accountName:name||'微信用户',avatarStyle:['violet','blue','green','peach'].includes(p.avatarStyle)?p.avatarStyle:'violet'})}}).catch(()=>{})}if(!cfg)return;try{const r=await customerSupportGet('unread');if(serial===this.serial&&identity===supportIdentity())this.setData({supportUnread:r.unread})}catch(_){/* No local fallback or fabricated unread count. */}},
  onHide(){this.serial++;this.merchantSerial++;this.loginSerial++;this.setData({loginBusy:false,phoneOnboarding:false,phoneBindBusy:false,phoneBindStatus:''})},
  onUnload(){this.serial++;this.merchantSerial++;this.loginSerial++},
  openOrders(e:any) {
    const tab=String(e?.currentTarget?.dataset?.tab||'all'),fulfillment=String(e?.currentTarget?.dataset?.fulfillment||'')
    wx.setStorageSync('stall_order_tab_entry_v1',{tab,fulfillment})
    wx.switchTab({url:'/pages/orders/orders'})
  },
  unavailable(){wx.showToast({title:'该服务暂未开通',icon:'none'})},
  serviceInfo(e:any){const kind=String(e.currentTarget.dataset.kind);const content:Record<string,string>={faq:'在商品页或分类页加入购物车，选择商品后进入结算。配送区域、费用、库存和营业时间以店铺实时规则为准。订单进度可在「我的订单」中查看。',about:'本小程序提供店铺商品浏览、购物车、订单与配送服务。订单及配送信息由当前店铺管理。'};wx.showModal({title:kind==='faq'?'常见问题':'关于我们',content:content[kind]||'',showCancel:false})}

})
