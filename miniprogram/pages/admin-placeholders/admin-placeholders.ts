import { getMerchantContext } from '../../utils/merchantContext'
import { merchantBusiness,patchMerchantBusiness } from '../../utils/businessCloud'
import { uploadMerchantImage } from '../../utils/cloudMerchantImage'
import { supportIdentity } from '../../utils/supportCloud'
import { currentPresentation,placeholderStyles } from '../../utils/storePresentation'
Page({
 context:'',serial:0,reading:false,revision:null as string|null,
 data:{placeholderStyle:'premium',customPlaceholderUrl:'',placeholderImageKey:null as string|null,placeholderStyleIndex:4,placeholderStyleNames:['经典图案','山峰插画','购物袋','彩色礼盒','精品礼盒','自定义图片'],cloudMode:false,busy:false,ready:false,error:''},
 onShow(){this.refresh()},
 onHide(){this.serial++;if(this.reading){this.reading=false;this.setData({busy:false})}},
 onUnload(){this.serial++},
 async refresh(){
  if(this.data.busy)return
  const context=supportIdentity(),serial=++this.serial,cfg=getMerchantContext();this.context=context;this.setData({cloudMode:!!cfg,ready:!cfg,error:'',...cfg?{placeholderStyle:'none',customPlaceholderUrl:'',placeholderImageKey:null}:{...currentPresentation()}})
  if(!cfg)return
  this.reading=true;this.setData({busy:true})
  try{const r=await merchantBusiness(cfg);if(serial!==this.serial||context!==supportIdentity())return;const style=r.placeholderStyle||'premium';this.revision=r.revision||null;this.setData({placeholderStyle:style,placeholderStyleIndex:placeholderStyles.indexOf(style),customPlaceholderUrl:r.customPlaceholderUrl||'',placeholderImageKey:r.placeholderImageKey||null,ready:true})}
  catch(_){if(serial===this.serial)this.setData({error:'云端缺图设置读取失败，请检查商家身份及后端配置；未回退本机数据'})}finally{if(serial===this.serial){this.reading=false;this.setData({busy:false})}}
 },
 async persist(style:string,key?:string|null):Promise<boolean>{
  if(this.data.busy||!this.data.ready||this.context!==supportIdentity())return false
  const cfg=getMerchantContext(),context=this.context;this.setData({busy:true,error:''})
  try{if(cfg){this.revision=await patchMerchantBusiness(cfg,this.revision,{placeholderStyle:style,...key===undefined?{}:{placeholderImageKey:key}});if(context!==supportIdentity())return false;const r=await merchantBusiness(cfg);if(context!==supportIdentity())return false;if(r.revision!==this.revision)throw Error('configuration_changed');this.revision=r.revision||null;this.setData({placeholderStyle:r.placeholderStyle||style,customPlaceholderUrl:r.customPlaceholderUrl||'',placeholderImageKey:r.placeholderImageKey||null,placeholderStyleIndex:placeholderStyles.indexOf(style)})}
   else{wx.setStorageSync('stall_placeholder_style_v1',style);if(key===null)wx.removeStorageSync('stall_placeholder_custom_v1');this.setData({placeholderStyle:style,placeholderStyleIndex:placeholderStyles.indexOf(style),customPlaceholderUrl:style==='custom'?String(wx.getStorageSync('stall_placeholder_custom_v1')||''):this.data.customPlaceholderUrl})}
   wx.showToast({title:'缺图样式已保存'});return true
  }catch(_){if(context===supportIdentity())this.setData({error:'保存未确认或配置已变化，原云端设置未被强行覆盖；请刷新核对',ready:false});return false}finally{this.setData({busy:false})}
 },
 chooseGalleryStyle(e:any){const style=String(e.currentTarget.dataset.style||'');if(placeholderStyles.includes(style))this.persist(style)},
 changePlaceholderStyle(e:any){const style=placeholderStyles[Number(e.detail.value)];if(style)this.persist(style)},
 uploadCustomPlaceholder(){
  if(this.data.busy||!this.data.ready||this.context!==supportIdentity())return
  const cfg=getMerchantContext(),context=this.context;this.setData({busy:true,error:''})
  wx.chooseImage({count:1,sizeType:['compressed'],sourceType:['album','camera'],success:async r=>{
   try{const path=r.tempFilePaths[0];if(!path||context!==supportIdentity())return
    if(cfg){const key=await uploadMerchantImage(cfg,path);if(context!==supportIdentity())return;this.revision=await patchMerchantBusiness(cfg,this.revision,{placeholderStyle:'custom',placeholderImageKey:key});const settings=await merchantBusiness(cfg);if(settings.revision!==this.revision)throw Error('configuration_changed');if(context===supportIdentity()){this.revision=settings.revision||null;this.setData({placeholderStyle:'custom',placeholderStyleIndex:5,placeholderImageKey:key,customPlaceholderUrl:settings.customPlaceholderUrl||''})}}
    else{const saved:any=await new Promise((resolve,reject)=>wx.saveFile({tempFilePath:path,success:resolve,fail:reject}));if(context!==supportIdentity())return;wx.setStorageSync('stall_placeholder_custom_v1',saved.savedFilePath);wx.setStorageSync('stall_placeholder_style_v1','custom');this.setData({placeholderStyle:'custom',placeholderStyleIndex:5,customPlaceholderUrl:saved.savedFilePath})}
   }catch(_){if(context===supportIdentity())this.setData({error:'上传或保存未确认，原设置保留；请刷新核对后重试'})}finally{this.setData({busy:false})}
  },fail:()=>this.setData({busy:false})})
 },
 removeCustomPlaceholder(){this.persist('premium',null)}
})
