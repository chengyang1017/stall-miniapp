import { getCloudContext,getSessionToken } from '../../modules/shared/runtime/context'
import { authorizedGet,requestIdentity } from '../../modules/shared/runtime/auth'

type Member={memberKey:string;label:string;role:string;isSelf:boolean}
Page({
  visible:false,serial:0,
  data:{loading:true,busy:false,error:'',members:[] as Member[],invitationCode:'',invitationMessage:'',storeName:''},
  onShow(){this.visible=true;this.refresh()},
  onShareAppMessage(){
    const cfg=getCloudContext(),code=this.data.invitationCode
    if(!cfg||!/^[A-Za-z0-9_-]{32}$/.test(code)||cfg.storeSlug!==this.data.storeName)
      return {title:'商家工作台',path:'/pages/index/index'}
    return {title:'邀请你加入店铺商家团队',path:'/pages/merchant-login/merchant-login?invite='+encodeURIComponent(code)+'&store='+encodeURIComponent(cfg.storeSlug)}
  },
  onHide(){this.visible=false;this.serial++},
  onUnload(){this.visible=false;this.serial++},
  async refresh(){
    const cfg=getCloudContext(),token=getSessionToken(),identity=requestIdentity(),serial=++this.serial
    if(!cfg||!token){this.setData({loading:false,error:'请先以店主微信账号登录商家工作台',members:[]});return}
    this.setData({loading:true,error:'',storeName:cfg.storeSlug})
    try{
      const r=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/members`)
      if(!this.visible||serial!==this.serial||identity!==requestIdentity())return
      if(!r||!Array.isArray(r.members))throw Error('invalid_members_response')
      this.setData({members:r.members.filter((v:any)=>typeof v.memberKey==='string'&&typeof v.label==='string'),loading:false})
    }catch(e:any){
      if(this.visible&&serial===this.serial)this.setData({loading:false,error:String(e?.message||'成员列表读取失败')})
    }
  },
  async request(method:'POST'|'DELETE',path:string){
    const cfg=getCloudContext(),token=getSessionToken()
    if(!cfg||!token)throw Error('not_logged_in')
    return new Promise<any>((resolve,reject)=>wx.request({
      url:cfg.apiBase.replace(/\/+$/,'')+'/v1/merchant/stores/'+cfg.storeSlug+path,
      method,timeout:15000,header:{Authorization:'Bearer '+token,'content-type':'application/json'},
      success:(res:any)=>res.statusCode>=200&&res.statusCode<300?resolve(res.data):reject(Error(String(res.data?.error||'http_'+res.statusCode))),
      fail:()=>reject(Error('network_unavailable'))
    }))
  },
  async createInvitation(){
    if(this.data.busy||this.data.loading||this.data.error)return
    const serial=this.serial,identity=requestIdentity()
    this.setData({busy:true,invitationCode:'',invitationMessage:''})
    try{
      const data=await this.request('POST','/member-invitations')
      if(!this.visible||serial!==this.serial||identity!==requestIdentity())return
      if(typeof data?.invitationCode!=='string')throw Error('invalid_invitation_response')
      this.setData({invitationCode:data.invitationCode,invitationMessage:'有效期24小时，仅限一人使用。可以直接发送给微信好友。'})
    }catch(e:any){if(this.visible&&serial===this.serial)this.setData({invitationMessage:'生成失败：'+String(e?.message||'unknown')})}
    finally{if(this.visible&&serial===this.serial)this.setData({busy:false})}
  },
  copyInvitation(){if(this.data.invitationCode)wx.setClipboardData({data:this.data.invitationCode})},
  removeMember(e:any){
    if(this.data.busy||this.data.loading)return
    const id=String(e.currentTarget.dataset.id||''),member=this.data.members.find((x:Member)=>x.memberKey===id)
    if(!member||member.isSelf||member.role==='owner')return
    wx.showModal({title:'撤销商家权限',content:'确定移除「'+member.label+'」的工作台权限吗？',confirmText:'移除',confirmColor:'#C23B4B',
      success:async(result:any)=>{
        if(!result.confirm||this.data.busy)return
        const serial=this.serial,identity=requestIdentity()
        this.setData({busy:true})
        try{
          await this.request('DELETE','/members/'+id)
          if(!this.visible||serial!==this.serial||identity!==requestIdentity())return
          this.setData({members:this.data.members.filter((x:Member)=>x.memberKey!==id)})
          wx.showToast({title:'已撤销权限',icon:'success'})
        }catch(err:any){if(this.visible&&serial===this.serial)wx.showToast({title:'移除失败，请刷新',icon:'none'})}
        finally{if(this.visible&&serial===this.serial)this.setData({busy:false})}
      }})
  }
})
