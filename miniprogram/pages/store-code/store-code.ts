import { PUBLIC_API_BASE } from '../../config/cloud'
import { getCloudContext, getSessionToken } from '../../modules/shared/runtime/context'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'
Page({
 serial:0,context:'',
 data:{cloudMode:false,busy:false,error:'',storeName:'',appId:'',imagePath:''},
 onShow(){this.context=supportIdentity();this.setData({cloudMode:!!getCloudContext(),imagePath:'',error:'',busy:false});this.readCode(false)},
 onHide(){this.serial++;this.setData({imagePath:'',busy:false})},onUnload(){this.serial++},
 generate(){this.readCode(true)},
 async readCode(create:boolean){
  const cfg=getCloudContext(),token=getSessionToken(),context=supportIdentity()
  if(!cfg||this.data.busy)return
  if(create&&(!/^https:\/\//.test(PUBLIC_API_BASE)||PUBLIC_API_BASE.replace(/\/+$/,'')!==cfg.apiBase)){this.setData({error:'发布前请配置config/cloud.ts的PUBLIC_API_BASE，并确保与当前店铺API一致；新设备扫码不能依赖商家本机配置。'});return}
  if(!token){this.setData({error:'请先在商家账号与权限页面登录'});return}
  const serial=++this.serial;this.context=context;this.setData({busy:true,error:''})
  try{
   const r:any=await new Promise((resolve,reject)=>wx.request({url:cfg.apiBase+'/v1/merchant/stores/'+cfg.storeSlug+'/store-code',method:create?'POST':'GET',data:create?{expectedAppId:wx.getAccountInfoSync().miniProgram.appId}:undefined,timeout:60000,header:{Authorization:'Bearer '+token,'content-type':'application/json'},success:r=>r.statusCode===200?resolve(r.data):reject(Error('http_'+r.statusCode+'_'+String((r.data as any)?.error||''))),fail:reject}))
   if(serial!==this.serial||context!==supportIdentity())return
   this.setData({storeName:r.storeName,appId:r.appId||''})
   const account=wx.getAccountInfoSync().miniProgram.appId
   if(r.appId&&account!==r.appId){this.setData({error:'后端AppID与当前小程序不一致，已禁止显示和导出小程序码'});return}
   if(!r.code){this.setData({error:r.configured?'尚未生成，请点击获取；需要正式首页已发布':'后端尚未配置微信AppID及AppSecret'});return}
   if(typeof r.code.imageBase64!=='string'||r.code.imageBase64.length>700000)throw Error('invalid_image')
   const path=wx.env.USER_DATA_PATH+'/store-code-'+cfg.storeSlug+'.png'
   await new Promise<void>((resolve,reject)=>wx.getFileSystemManager().writeFile({filePath:path,data:r.code.imageBase64,encoding:'base64',success:()=>resolve(),fail:reject}))
   if(serial===this.serial&&context===supportIdentity())this.setData({imagePath:path})
  }catch(e){if(serial===this.serial&&context===supportIdentity()){const msg=String(e);this.setData({error:/401|403/.test(msg)?'请登录有权限的商家账号':/miniapp_appid_mismatch/.test(msg)?'后端AppID与当前小程序不一致，未生成小程序码':/409/.test(msg)?'请先启用店铺，再获取正式小程序码':/429/.test(msg)?'生成过于频繁，请一分钟后重试':'未能获取正式小程序码。请核对AppID、AppSecret、微信服务器IP配置、正式版首页发布及网络；不会生成模拟码。'})}}
  finally{if(serial===this.serial)this.setData({busy:false})}
 },
 saveImage(){
  if(!this.data.imagePath||this.data.busy||this.context!==supportIdentity())return
  this.setData({busy:true});wx.saveImageToPhotosAlbum({filePath:this.data.imagePath,success:()=>wx.showToast({title:'已保存到相册'}),fail:()=>wx.showModal({title:'图片未保存',content:'请确认相册权限。也可导出图片后保存或打印。',confirmText:'打开设置',success:r=>{if(r.confirm)wx.openSetting({})}}),complete:()=>this.setData({busy:false})})
 },
 exportImage(){
  if(!this.data.imagePath||this.data.busy||this.context!==supportIdentity())return
  if(typeof wx.shareFileMessage!=='function'){wx.showModal({title:'请使用微信真机',content:'当前环境不支持文件分享，可保存相册后发送图片用于打印。',showCancel:false});return}
  this.setData({busy:true});wx.shareFileMessage({filePath:this.data.imagePath,fileName:'store-code.png',fail:()=>wx.showToast({title:'导出未完成，可保存到相册',icon:'none'}),complete:()=>this.setData({busy:false})})
 }
})
