import { getCloudContext } from '../../modules/shared/runtime/context'
import { uploadMerchantImage } from '../../utils/cloudMerchantImage'
import { merchantBusiness,patchMerchantBusiness,businessContextKey } from '../../modules/merchant/api/business'

type PromoBanner={key:string;url:string}
function promoItems(settings:any):PromoBanner[]{
 if(Array.isArray(settings?.promoBannerImages))return settings.promoBannerImages.filter((b:any)=>typeof b?.key==='string'&&typeof b?.url==='string'&&!!b.url).slice(0,10)
 return settings?.promoBannerImageKey&&settings?.promoBannerUrl?[{key:settings.promoBannerImageKey,url:settings.promoBannerUrl}]:[]
}
Page({
 revision:null as string|null,serial:0,loadedContext:'',
 data:{cloudMode:false,settingsReady:false,settingsLoading:false,settingsError:'',promoBannerBusy:false,promoBannerError:'',promoBanners:[] as PromoBanner[],promoBannerImageKey:null as string|null,promoBannerUrl:''},
 onShow(){this.refreshBanner()},
 onHide(){this.serial++},
 onUnload(){this.serial++},
 async refreshBanner(){
  const cfg=getCloudContext(),context=businessContextKey(),serial=++this.serial
  this.loadedContext=context
  this.setData({cloudMode:!!cfg,settingsLoading:!!cfg,settingsReady:false,settingsError:'',promoBannerError:'',promoBanners:[],promoBannerImageKey:null,promoBannerUrl:''})
  if(!cfg){this.setData({settingsLoading:false,settingsError:'请先连接店铺并验证商家身份'});return}
  try{
   const settings=await merchantBusiness(cfg)
   if(serial!==this.serial||context!==businessContextKey())return
   const banners=promoItems(settings);this.revision=settings.revision||null
   this.setData({settingsReady:true,promoBanners:banners,promoBannerImageKey:banners[0]?.key||null,promoBannerUrl:banners[0]?.url||''})
  }catch(error){
   if(serial===this.serial&&context===businessContextKey()){
    this.setData({settingsReady:false,settingsError:/http_40[13]|not_logged_in/.test(String(error))?'没有管理此店铺的权限，请重新登录':'读取宣传图失败，请检查网络后重试'})
   }
  }finally{if(serial===this.serial&&context===businessContextKey())this.setData({settingsLoading:false})}
 },
 async savePromoBanners(keys:string[]){
  const cfg=getCloudContext(),context=businessContextKey()
  if(!cfg||!this.data.settingsReady||context!==this.loadedContext)throw Error('settings_not_ready')
  if(keys.length>10||new Set(keys).size!==keys.length)throw Error('invalid_promo_banner_list')
  const revision=await patchMerchantBusiness(cfg,this.revision,{promoBannerImageKeys:keys})
  if(context!==businessContextKey())throw Error('merchant_context_changed')
  this.revision=revision
  const settings=await merchantBusiness(cfg)
  if(context!==businessContextKey())throw Error('merchant_context_changed')
  if(settings.revision!==revision)throw Error('configuration_changed')
  const banners=promoItems(settings)
  if(banners.map(b=>b.key).join('|')!==keys.join('|'))throw Error('banner_not_saved')
  this.revision=settings.revision||null
  this.setData({promoBanners:banners,promoBannerImageKey:banners[0]?.key||null,promoBannerUrl:banners[0]?.url||''})
 },
 bannerErrorText(error:any,stage:string):string{
  const raw=String(error?.message||error||'unknown')
  if(/image_must_be_under_5mb/.test(raw))return '图片不能超过5MB，请压缩后上传'
  if(/unsupported_image_format/.test(raw))return '请使用 JPG、PNG 或 WebP 图片'
  if(/invalid_upload_request_key|upload_request_conflict/.test(raw))return '上传请求冲突，请重新选择图片'
  if(/object_storage_not_configured|storage_not_configured|image_storage_check_unavailable/.test(raw))return '图片存储暂不可用，请联系管理员检查配置'
  if(/image_upload_not_verified|image_verification_failed|invalid_promo_banner_image/.test(raw))return '图片未通过服务器校验，请检查存储权限后重试'
  if(/invalid_promo_banner_list/.test(raw))return '最多10张图片，且不能重复，请重新操作'
  if(/invalid_business_patch/.test(raw))return '当前服务尚未支持多图横幅，请联系管理员更新'
  if(/promo_banner_public_image_base_required/.test(raw))return '图片公开访问地址未配置，暂时无法展示横幅'
  if(/http_401|not_logged_in/.test(raw))return '商家登录已过期，请重新登录'
  if(/http_403/.test(raw))return '当前账号没有上传或修改店铺图片的权限'
  if(/http_409|configuration_changed/.test(raw))return '店铺设置已变化，请刷新后重新上传'
  if(/http_413/.test(raw))return '图片太大，服务器拒绝上传'
  if(/http_503/.test(raw))return '图片服务暂不可用，请稍后重试'
  if(/merchant_context_changed/.test(raw))return '店铺或登录身份已切换，请重新进入'
  return stage+'失败：'+raw.slice(0,100)
 },
 uploadPromoBanner(e:any){
  if(this.data.promoBannerBusy||!this.data.settingsReady)return
  const rawIndex=e?.currentTarget?.dataset?.index
  const index=rawIndex===undefined?-1:Number(rawIndex)
  const replacing=Number.isInteger(index)&&index>=0&&index<this.data.promoBanners.length
  if(!replacing&&this.data.promoBanners.length>=10){wx.showToast({title:'最多10张横幅',icon:'none'});return}
  const cfg=getCloudContext(),context=businessContextKey()
  if(!cfg||context!==this.loadedContext)return
  this.setData({promoBannerBusy:true,promoBannerError:''})
  wx.chooseImage({count:1,sizeType:['compressed'],sourceType:['album','camera'],success:async (result:any)=>{
   const file=result.tempFilePaths?.[0]
   if(!file||context!==businessContextKey()){if(context===businessContextKey())this.setData({promoBannerBusy:false});return}
   let stage='上传图片'
   try{
     const key=await uploadMerchantImage(cfg,file)
     if(context!==businessContextKey())return
     const keys=this.data.promoBanners.map(b=>b.key)
     if(replacing)keys[index]=key
     else keys.push(key)
     stage='保存横幅'
     await this.savePromoBanners(keys)
     if(context===businessContextKey())wx.showToast({title:'宣传图已保存',icon:'success'})
   }catch(error){if(context===businessContextKey()){
     this.setData({promoBannerError:this.bannerErrorText(error,stage)})
     wx.showToast({title:'操作失败，查看下方原因',icon:'none'})
     this.refreshBanner()
   }}
   finally{if(context===businessContextKey())this.setData({promoBannerBusy:false})}
  },fail:(error:any)=>{
   if(context===businessContextKey()){
     if(!/cancel/i.test(String(error?.errMsg||'')))this.setData({promoBannerError:'选择图片失败：'+String(error?.errMsg||'请检查相册权限')})
     this.setData({promoBannerBusy:false})
   }
  }})
 },
 async changePromoOrder(e:any){
  if(this.data.promoBannerBusy||!this.data.settingsReady)return
  const index=Number(e.currentTarget?.dataset?.index),offset=Number(e.currentTarget?.dataset?.offset)
  const next=index+offset,banners=this.data.promoBanners
  if(!Number.isInteger(index)||![-1,1].includes(offset)||index<0||index>=banners.length||next<0||next>=banners.length)return
  const keys=banners.map(b=>b.key);[keys[index],keys[next]]=[keys[next],keys[index]]
  const context=businessContextKey();this.setData({promoBannerBusy:true,promoBannerError:''})
  try{await this.savePromoBanners(keys);if(context===businessContextKey())wx.showToast({title:'顺序已更新',icon:'success'})}
  catch(error){if(context===businessContextKey()){this.setData({promoBannerError:this.bannerErrorText(error,'调整顺序')});this.refreshBanner()}}
  finally{if(context===businessContextKey())this.setData({promoBannerBusy:false})}
 },
 removePromoBanner(e:any){
  if(this.data.promoBannerBusy||!this.data.settingsReady)return
  const index=Number(e.currentTarget?.dataset?.index)
  if(!Number.isInteger(index)||index<0||index>=this.data.promoBanners.length)return
  wx.showModal({title:'删除宣传图',content:'只移除首页轮播中的这张图片，其他图片保留。',confirmText:'删除',success:async (result:any)=>{
   if(!result.confirm||this.data.promoBannerBusy)return
   const context=businessContextKey(),keys=this.data.promoBanners.map(b=>b.key).filter((_,i)=>i!==index)
   this.setData({promoBannerBusy:true,promoBannerError:''})
   try{await this.savePromoBanners(keys);if(context===businessContextKey())wx.showToast({title:'已移除',icon:'success'})}
   catch(error){if(context===businessContextKey()){this.setData({promoBannerError:this.bannerErrorText(error,'移除横幅')});this.refreshBanner()}}
   finally{if(context===businessContextKey())this.setData({promoBannerBusy:false})}
  }})
 },
 hidePromoBanner(){
  if(this.data.promoBannerBusy||!this.data.settingsReady||!this.data.promoBanners.length)return
  wx.showModal({title:'隐藏全部横幅',content:'隐藏后顾客首页不再显示宣传图，折扣专区不受影响。',confirmText:'全部隐藏',success:async (result:any)=>{
   if(!result.confirm||this.data.promoBannerBusy)return
   const context=businessContextKey();this.setData({promoBannerBusy:true,promoBannerError:''})
   try{await this.savePromoBanners([]);if(context===businessContextKey())wx.showToast({title:'已隐藏',icon:'success'})}
   catch(error){if(context===businessContextKey()){this.setData({promoBannerError:this.bannerErrorText(error,'隐藏横幅')});this.refreshBanner()}}
   finally{if(context===businessContextKey())this.setData({promoBannerBusy:false})}
  }})
 },
})
