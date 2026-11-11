import { loginWithWechat, authorizedGet, setLocalDevToken, localDevAllowed, requestIdentity } from '../../modules/shared/runtime/auth'
import { getCloudContext,getSessionToken } from '../../modules/shared/runtime/context'
import { clearSessionCaches } from '../../modules/shared/runtime/sessionLifecycle'
import { CLOUD_ONLY } from '../../config/cloud'

type MerchantMember={memberKey:string;label:string;role:string;isSelf:boolean}
const CONFIG_KEY = 'stall_cloud_catalog_config_v1'
const TOKEN_KEY = 'stall_server_session_v1'
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/
function validBase(base: string): boolean {
  return /^https:\/\/[^\s/]+/.test(base) || localDevAllowed(base)
}
Page({
  pageVisible: false, operationSerial: 0, membersSerial:0,
  data: { apiBase: '', storeSlug: '', devToken: '', showLocalDev: false,cloudOnly:CLOUD_ONLY,
    busy: false, authenticated: false, canInvite:false,invitationCode:'',joinCode:'',invitationStore:'',shareInvitation:false,inviteStoreMismatch:false,memberBusy:false,memberStatus:'',membersLoading:false,membersError:'',members:[] as MerchantMember[],status: '尚未验证商家身份' },
  onLoad(options:{invite?:string;store?:string}){
    const code=typeof options?.invite==='string'?options.invite:''
    const store=typeof options?.store==='string'?options.store:''
    if(/^[A-Za-z0-9_-]{32}$/.test(code)&&/^[a-z0-9][a-z0-9-]{1,62}$/.test(store))
      this.setData({joinCode:code,invitationStore:store,shareInvitation:true})
  },
  onShareAppMessage(){
    const cfg=getCloudContext(),code=this.data.invitationCode
    if(this.data.canInvite&&cfg&&cfg.storeSlug===this.data.storeSlug&&/^[A-Za-z0-9_-]{32}$/.test(code))
      return {title:'邀请你加入店铺商家团队',path:'/pages/merchant-login/merchant-login?invite='+encodeURIComponent(code)+'&store='+encodeURIComponent(cfg.storeSlug)}
    return {title:'商家账号与权限',path:'/pages/merchant-login/merchant-login'}
  },
  onShow() {
    this.pageVisible = true
    const config = CLOUD_ONLY ? getCloudContext() : wx.getStorageSync(CONFIG_KEY) as any
    const apiBase = config && typeof config.apiBase === 'string' ? config.apiBase : ''
    const storeSlug = config && typeof config.storeSlug === 'string' ? config.storeSlug : ''
    const mismatch=!!this.data.shareInvitation&&this.data.invitationStore!==storeSlug
    this.membersSerial++
    this.setData({ apiBase, storeSlug, authenticated: false,canInvite:false,invitationCode:'',members:[],membersLoading:false,membersError:'',inviteStoreMismatch:mismatch,memberStatus:mismatch?'这份邀请属于其他店铺，无法用于当前小程序。':'', showLocalDev: localDevAllowed(apiBase) && storeSlug === 'stall-demo' })
    if (apiBase && storeSlug && wx.getStorageSync(TOKEN_KEY)) this.verifyExisting()
  },
  onHide() { this.pageVisible = false; this.operationSerial++; this.membersSerial++; this.setData({busy:false,authenticated:false,canInvite:false,invitationCode:'',members:[],membersLoading:false,membersError:'',memberBusy:false,devToken:''}) },
  onUnload() { this.onHide() },
  onBaseInput(e: any) { if(this.data.busy)return; const apiBase = String(e.detail.value || '').trim(); this.membersSerial++;this.setData({ apiBase, showLocalDev: localDevAllowed(apiBase) && this.data.storeSlug === 'stall-demo', authenticated: false,canInvite:false,members:[],membersError:'' }) },
  onSlugInput(e: any) { if(this.data.busy)return; const storeSlug = String(e.detail.value || '').trim().toLowerCase(); this.membersSerial++;this.setData({ storeSlug, showLocalDev: localDevAllowed(this.data.apiBase) && storeSlug === 'stall-demo', authenticated: false,canInvite:false,members:[],membersError:'' }) },
  onTokenInput(e: any) { if(this.data.busy)return; this.setData({ devToken: String(e.detail.value || '').trim() }) },
  config(): boolean {
    if(CLOUD_ONLY){const cfg=getCloudContext();if(!cfg)return false;this.setData(cfg);return true}
    const apiBase = String(this.data.apiBase).replace(/\/+$/, '')
    const storeSlug = this.data.storeSlug
    if (!validBase(apiBase) || !SLUG.test(storeSlug)) {
      wx.showToast({ title: '请填写有效地址和店铺标识', icon: 'none' }); return false
    }
    this.setData({ apiBase })
    wx.setStorageSync(CONFIG_KEY, { apiBase, storeSlug })
    return true
  },
  async verifyExisting(openWorkspace = false) {
    if (this.data.busy || !this.config()) return
    const serial = ++this.operationSerial, identity = requestIdentity()
    const apiBase = this.data.apiBase, storeSlug = this.data.storeSlug
    const current = () => this.pageVisible && serial === this.operationSerial && identity === requestIdentity()
    this.setData({ busy: true, authenticated: false, status: '正在核实商家权限…' })
    try {
      const basePath = `/v1/merchant/stores/${storeSlug}`
      const result = await authorizedGet(apiBase, `${basePath}/categories`)
      if (!current()) return
      if (!result || !Array.isArray(result.items)) throw new Error('invalid_response')
      const membership=await authorizedGet(apiBase,'/v1/auth/me')
      if(!current())return
      const store=Array.isArray(membership?.stores)?membership.stores.find((x:any)=>x.slug===storeSlug):null
      this.setData({ authenticated: true,canInvite:store?.role==='owner',members:[],membersError:'', status: `已登录，具有 ${this.data.storeSlug} 店铺访问权限` })
      if(store?.role==='owner'&&!openWorkspace)void this.refreshMembers()
      // Passive session verification must not navigate away from Account & Permissions.
      // Only an explicit login action chooses the merchant workspace.
      if (openWorkspace) {
        wx.setStorageSync('stall_merchant_home_preference_v1', this.data.apiBase + '|' + this.data.storeSlug)
        wx.navigateTo({url:'/pages/admin/admin'})
      }
    } catch (_) {
      if (!current()) return
      this.membersSerial++
      this.setData({ authenticated: false,canInvite:false,members:[],membersLoading:false,membersError:'',status: '当前账号尚未获得商家权限。若已收到店主邀请码，可在下方加入店铺。' })
    } finally { if(this.pageVisible && serial === this.operationSerial)this.setData({ busy: false }) }
  },
  async loginWechat() {
    if (this.data.busy || !this.config()) return
    const serial = ++this.operationSerial
    this.setData({ busy: true, authenticated: false, status: '正在进行微信登录…' })
    try {
      await loginWithWechat(this.data.apiBase, () => this.pageVisible && serial === this.operationSerial)
      if (!this.pageVisible || serial !== this.operationSerial) return
      this.setData({ busy: false })
      if(this.data.shareInvitation){this.setData({status:'微信身份已验证，请确认加入店铺。'});return}
      await this.verifyExisting(true)
    } catch (_) { if(this.pageVisible && serial === this.operationSerial)this.setData({ busy: false, status: '微信登录失败或当前店铺/会话已变化，请核对后重试' }) }
  },
  async loginDev() {
    if (this.data.busy || !localDevAllowed(this.data.apiBase) || this.data.storeSlug !== 'stall-demo' || !this.config()) return
    try {
      setLocalDevToken(this.data.apiBase, this.data.devToken)
      this.setData({ devToken: '' })
      await this.verifyExisting(true)
    } catch (_) { this.setData({ authenticated: false, status: '测试会话无效或已失效' }) }
  },
  onJoinCodeInput(e:any){this.setData({joinCode:String(e?.detail?.value||'').trim().slice(0,32),memberStatus:''})},
  async memberRequest(path:string,data:any):Promise<any>{
    const cfg=getCloudContext(),token=wx.getStorageSync(TOKEN_KEY)
    if(!cfg||typeof token!=='string'||!token)throw Error('请先完成微信登录')
    return new Promise((resolve,reject)=>wx.request({
      url:cfg.apiBase.replace(/[/]+$/,'')+'/v1/merchant/stores/'+encodeURIComponent(cfg.storeSlug)+'/member-invitations'+path,
      method:'POST',timeout:15000,data,
      header:{Authorization:'Bearer '+token,'content-type':'application/json'},
      success:(r:any)=>r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(Error(String(r.data?.error||'http_'+r.statusCode))),
      fail:()=>reject(Error('网络请求失败'))
    }))
  },
  async refreshMembers(){
    if(!this.pageVisible||!this.data.authenticated||!this.data.canInvite)return
    const cfg=getCloudContext(),token=getSessionToken(),identity=requestIdentity(),serial=++this.membersSerial
    if(!cfg||!token||cfg.storeSlug!==this.data.storeSlug)return
    const isCurrent=()=>this.pageVisible&&serial===this.membersSerial&&identity===requestIdentity()&&cfg.storeSlug===this.data.storeSlug&&this.data.authenticated&&this.data.canInvite
    this.setData({membersLoading:true,membersError:''})
    try{
      const result=await authorizedGet(cfg.apiBase,'/v1/merchant/stores/'+cfg.storeSlug+'/members')
      if(!isCurrent())return
      if(!result||!Array.isArray(result.members))throw Error('invalid_members_response')
      const members=result.members.filter((item:any)=>typeof item?.memberKey==='string'&&/^[a-f0-9]{64}$/.test(item.memberKey)&&typeof item?.label==='string'&&typeof item?.role==='string').map((item:any)=>({memberKey:item.memberKey,label:item.label,role:item.role,isSelf:item.isSelf===true}))
      this.setData({members,membersError:''})
    }catch(_){if(isCurrent())this.setData({membersError:'成员列表读取失败，请检查商家权限及网络后重试'})}
    finally{if(isCurrent())this.setData({membersLoading:false})}
  },
  removeManagedMember(e:any){
    if(!this.data.canInvite||!this.data.authenticated||this.data.memberBusy||this.data.membersLoading)return
    const key=String(e?.currentTarget?.dataset?.id||'')
    if(!/^[a-f0-9]{64}$/.test(key))return
    const member=this.data.members.find((item:MerchantMember)=>item.memberKey===key)
    if(!member||member.isSelf||member.role==='owner')return
    wx.showModal({title:'撤销商家权限',content:'确定移除「'+member.label+'」的工作台权限吗？',confirmText:'移除',confirmColor:'#C23B4B',
      success:async(result:any)=>{
        if(!result.confirm||this.data.memberBusy||!this.data.canInvite||!this.data.authenticated)return
        const cfg=getCloudContext(),token=getSessionToken(),identity=requestIdentity(),serial=this.membersSerial
        if(!cfg||!token||cfg.storeSlug!==this.data.storeSlug)return
        const isCurrent=()=>this.pageVisible&&serial===this.membersSerial&&identity===requestIdentity()&&this.data.authenticated&&this.data.canInvite&&cfg.storeSlug===this.data.storeSlug
        this.setData({memberBusy:true,membersError:''})
        try{
          await new Promise<void>((resolve,reject)=>wx.request({
            url:cfg.apiBase.replace(/\\/+$/,'')+'/v1/merchant/stores/'+cfg.storeSlug+'/members/'+key,
            method:'DELETE',timeout:15000,header:{Authorization:'Bearer '+token,'content-type':'application/json'},
            success:(r:any)=>r.statusCode>=200&&r.statusCode<300?resolve():reject(Error('revoke_failed')),fail:()=>reject(Error('network_unavailable'))
          }))
          if(!isCurrent())return
          this.setData({members:this.data.members.filter((item:MerchantMember)=>item.memberKey!==key)})
          wx.showToast({title:'已撤销权限',icon:'success'})
        }catch(_){if(isCurrent())this.setData({membersError:'撤销失败，请刷新列表后重试'})}
        finally{if(isCurrent())this.setData({memberBusy:false})}
      }
    })
  },
  async createMemberInvitation(){
    if(!this.data.canInvite||this.data.memberBusy)return
    const identity=requestIdentity(),storeSlug=this.data.storeSlug
    this.setData({memberBusy:true,memberStatus:'',invitationCode:''})
    try{
      const r=await this.memberRequest('',{})
      if(!this.pageVisible||identity!==requestIdentity()||storeSlug!==this.data.storeSlug)return
      if(typeof r?.invitationCode==='string'&&/^[A-Za-z0-9_-]{32}$/.test(r.invitationCode))this.setData({invitationCode:r.invitationCode,memberStatus:'邀请码24小时内有效，仅可使用一次。'})
      else throw Error('invalid_invitation_response')
    }catch(e:any){
      if(this.pageVisible&&this.data.canInvite&&identity===requestIdentity()&&storeSlug===this.data.storeSlug)
        this.setData({memberStatus:'生成失败：'+String(e.message||e)})
    }finally{
      if(this.pageVisible&&identity===requestIdentity()&&storeSlug===this.data.storeSlug)
        this.setData({memberBusy:false})
    }
  },
  copyMemberInvitation(){
    if(this.data.invitationCode)wx.setClipboardData({data:this.data.invitationCode})
  },
  async redeemMemberInvitation(){
    if(this.data.memberBusy||this.data.busy||this.data.inviteStoreMismatch)return
    if(!wx.getStorageSync(TOKEN_KEY)){
      this.setData({memberStatus:'请先点击上方微信登录，再确认加入。'})
      return
    }
    const code=this.data.joinCode.trim()
    if(!/^[A-Za-z0-9_-]{32}$/.test(code)){this.setData({memberStatus:'请填写店主提供的完整邀请码'});return}
    this.setData({memberBusy:true,memberStatus:''})
    try{
      await this.memberRequest('/redeem',{invitationCode:code})
      this.setData({joinCode:'',shareInvitation:false,memberStatus:'加入成功，可以进入商家工作台。'})
      await this.verifyExisting(false)
    }catch(e:any){this.setData({memberStatus:'加入失败：'+String(e.message||e)})}
    finally{this.setData({memberBusy:false})}
  },
  openAuthorizedWorkspace(){
    if(!this.data.authenticated||this.data.busy)return
    const cfg=getCloudContext()
    if(!cfg)return
    wx.setStorageSync('stall_merchant_home_preference_v1',cfg.apiBase+'|'+cfg.storeSlug)
    wx.navigateTo({url:'/pages/admin/admin'})
  },
  async logout() {
    if(this.data.busy)return
    const serial=++this.operationSerial
    const token=wx.getStorageSync(TOKEN_KEY),cfg=getCloudContext();let revoked=false
    this.setData({busy:true})
    try{if(cfg&&typeof token==='string'&&token){await new Promise<void>((resolve,reject)=>wx.request({url:cfg.apiBase+'/v1/auth/logout',method:'POST',timeout:15000,header:{Authorization:`Bearer ${token}`},success:r=>r.statusCode===200?resolve():reject(Error('logout_unconfirmed')),fail:reject}));revoked=true}}
    catch(_){/* Still remove this device's session; do not claim remote revocation. */}
    finally{
      if(wx.getStorageSync(TOKEN_KEY)===token){
        wx.removeStorageSync('stall_merchant_home_preference_v1');wx.removeStorageSync(TOKEN_KEY);wx.removeStorageSync('stall_server_cache_scope_v1');clearSessionCaches()
        if(this.pageVisible&&serial===this.operationSerial){this.membersSerial++;this.setData({authenticated:false,canInvite:false,invitationCode:'',members:[],membersLoading:false,membersError:'',memberBusy:false,devToken:'',status:revoked?'服务器会话已撤销，已退出登录':'已退出本机登录；服务器会话撤销未确认，请检查网络'})}
      }
      if(this.pageVisible&&serial===this.operationSerial)this.setData({busy:false})
    }
  }
})
