import {loadHours,saveHours,HoursConfig,businessState} from '../../modules/merchant/demo/settings'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { merchantBusiness, patchMerchantBusiness, businessContextKey } from '../../modules/merchant/api/business'
const DAYS=['星期日','星期一','星期二','星期三','星期四','星期五','星期六']
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/
Page({
 revision:null as string|null,serial:0,context:'',
 data:{accepting:false,notice:'',days:[] as Array<{name:string;enabled:boolean;start:string;end:string}>,status:'正在读取',cloudMode:false,busy:false,ready:false,error:''},
 onShow(){this.refresh()},onUnload(){this.serial++},
 async refresh(){
  if(this.data.busy&&this.data.ready)return
  const cfg=getCloudContext(),context=businessContextKey(),serial=++this.serial;this.context=context
  this.setData({cloudMode:!!cfg,busy:!!cfg,ready:false,error:'',status:'正在读取',...(cfg?{days:[],notice:'',accepting:false}:{})})
  try{
   const config=cfg?await merchantBusiness(cfg):loadHours()
   if(serial!==this.serial||context!==businessContextKey())return
   this.revision='revision' in config&&typeof config.revision==='string'?config.revision:null
   this.setData({accepting:config.accepting,notice:config.notice,days:config.days.map((d,i)=>({...d,name:DAYS[i]})),status:cfg?String((config as any).label):businessState().label,ready:true})
  }catch(_){if(serial===this.serial)this.setData({error:cfg?'云端营业设置读取失败，请确认权限和后端配置；未使用本机设置代替':'本机营业设置读取失败，请检查本地配置',status:'读取失败'})}
  finally{if(serial===this.serial)this.setData({busy:false})}
 },
 async persist(patch:Partial<HoursConfig>,message:string){
  if(this.data.busy||!this.data.ready)return
  if(this.context!==businessContextKey()){this.refresh();return}
  const cfg=getCloudContext(),context=this.context
  this.setData({busy:true,error:''})
  try{
   if(cfg){this.revision=await patchMerchantBusiness(cfg,this.revision,patch);const saved=await merchantBusiness(cfg);if(context!==businessContextKey())throw Error('context_changed');if(saved.revision!==this.revision)throw Error('business_settings_changed_refresh');this.setData({status:saved.label})}
   else{saveHours({...loadHours(),...patch});this.setData({status:businessState().label})}
   wx.showToast({title:message,icon:'success'})
  }catch(_){this.setData({error:'保存未能确认，输入已保留。请刷新核对服务器设置后重试。',ready:false})}
  finally{this.setData({busy:false})}
 },
 toggleAccept(e:any){if(this.data.busy||!this.data.ready)return;this.setData({accepting:!!e.detail.value});this.persist({accepting:this.data.accepting},'接单设置已保存')},
 changeNotice(e:any){if(!this.data.busy)this.setData({notice:String(e.detail.value).slice(0,200)})},
 saveNotice(){this.persist({notice:this.data.notice},'公告已保存')},
 toggleDay(e:any){if(this.data.busy||!this.data.ready)return;const i=Number(e.currentTarget.dataset.index),days=this.data.days.slice();if(!days[i])return;days[i]={...days[i],enabled:!!e.detail.value};this.setData({days});this.saveSchedule()},
 editStart(e:any){this.editTime(e,'start')},editEnd(e:any){this.editTime(e,'end')},
 editTime(e:any,key:'start'|'end'){if(this.data.busy)return;const i=Number(e.currentTarget.dataset.index),days=this.data.days.slice();if(!days[i])return;days[i]={...days[i],[key]:String(e.detail.value)};this.setData({days})},
 saveSchedule(){const days=this.data.days.map(d=>({enabled:d.enabled,start:d.start,end:d.end}));if(days.length!==7||days.some(d=>!TIME.test(d.start)||!TIME.test(d.end)||d.start>=d.end)){wx.showToast({title:'请检查营业时间',icon:'none'});return}this.persist({days},'营业时间已保存')}
})
