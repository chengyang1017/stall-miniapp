import {loadDelivery,saveDelivery,DeliveryConfig,DeliverySlot,validateDeliveryConfig} from '../../modules/merchant/demo/settings'
import {newId} from '../../modules/merchant/demo/store'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { businessContextKey } from '../../modules/merchant/api/business'
import { fetchMerchantDelivery, saveMerchantDelivery } from '../../modules/merchant/api/delivery'
const weekdays=['周日','周一','周二','周三','周四','周五','周六']
function message(error:unknown):string{const s=String(error);if(s.includes('store_changed'))return '店铺或模式已变化，请重新读取后操作。';if(s.includes('409'))return '配置已被其他设备或营业设置修改，请重新读取后编辑；本次输入仍保留。';if(s.includes('403')||s.includes('401')||s.includes('not_logged_in'))return '无配送管理权限或登录已失效，请使用有权限的商家账号。';if(s.includes('overlapping'))return '同一区域、同一星期的时段存在重叠，请调整。';if(s.includes('duplicate_area_name'))return '配送区域名称不能重复。';return '读取或保存失败，请检查网络和后端版本；不会回退本机配置。'}
Page({
 context:'',revision:null as string|null,serial:0,mapSelecting:false,
 data:{areas:[] as DeliveryConfig['areas'],slots:[] as DeliverySlot[],specialDates:[] as Array<{date:string;paused:boolean}>,deliveryPaused:false,
  areaName:'',slotLabel:'',slotStart:'',slotEnd:'',specialDate:new Date(Date.now()+8*3600000).toISOString().slice(0,10),specialPaused:true,
  slotViews:[] as any[],enabledAreas:0,enabledSlots:0,cloudMode:false,sourceStore:'',configured:false,loading:false,saving:false,confirming:false,ready:false,dirty:false,conflict:false,error:'',feedback:''},
 onShow(){if(this.mapSelecting)return;if(this.context===businessContextKey()&&(this.data.dirty||this.data.saving))return;this.reload()},
 onUnload(){this.serial++},
 config():DeliveryConfig{return JSON.parse(JSON.stringify({areas:this.data.areas,slots:this.data.slots,specialDates:this.data.specialDates,deliveryPaused:this.data.deliveryPaused}))},
 editable():boolean{return this.data.ready&&!this.data.loading&&!this.data.saving&&!this.data.confirming&&!this.data.conflict&&this.context===businessContextKey()},
 apply(config:DeliveryConfig,dirty=true){
  const areas=config.areas,slots=config.slots.map(s=>({...s,weekdays:s.weekdays||[0,1,2,3,4,5,6]}))
  this.setData({areas,slots,specialDates:(config.specialDates||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)),deliveryPaused:!!config.deliveryPaused,dirty,...dirty?{feedback:'',error:''}:{},
   enabledAreas:areas.filter(a=>a.enabled).length,enabledSlots:slots.filter(s=>s.enabled).length,
   slotViews:slots.map(s=>({...s,allAreas:s.areaIds===undefined,dayChoices:weekdays.map((name,value)=>({name,value:String(value),checked:s.weekdays.includes(value)})),areaChoices:areas.map(a=>({name:a.name,value:a.id,checked:!!s.areaIds&&s.areaIds.includes(a.id)}))}))})
 },
 async reload(){
  if(this.data.saving||this.data.confirming)return
  if(this.data.dirty&&this.context===businessContextKey()){
   this.setData({confirming:true});const ok=await new Promise<boolean>(resolve=>wx.showModal({title:'重新读取配置？',content:'将丢弃本页尚未保存的修改。',success:r=>resolve(r.confirm),fail:()=>resolve(false)}));this.setData({confirming:false});if(!ok)return
  }
  const cfg=getCloudContext(),context=businessContextKey(),serial=++this.serial;this.context=context
  this.setData({cloudMode:!!cfg,sourceStore:cfg?.storeSlug||'',loading:true,ready:false,dirty:false,conflict:false,error:'',feedback:'',areas:[],slots:[],slotViews:[],specialDates:[],enabledAreas:0,enabledSlots:0,deliveryPaused:false,areaName:'',slotLabel:'',slotStart:'',slotEnd:''})
  try{
   const result=cfg?await fetchMerchantDelivery(cfg):{config:loadDelivery(),revision:null,configured:true}
   if(serial!==this.serial||context!==businessContextKey())return
   this.revision=result.revision;this.apply(result.config,false);this.setData({ready:true,configured:result.configured})
  }catch(error){if(serial===this.serial)this.setData({error:cfg?message(error):'本机配送配置读取失败，请检查本地数据。'})}
  finally{if(serial===this.serial){this.setData({loading:false});if(context!==businessContextKey())this.setData({ready:false,error:'店铺或数据模式已变化，请重新读取。'})}}
 },
 async saveAll(){
  if(!this.editable()||!this.data.dirty)return
  if(this.data.areaName.trim()||this.data.slotLabel.trim()||this.data.slotStart.trim()||this.data.slotEnd.trim()){this.setData({error:'请先点击新增，将输入加入待保存配置；或清空尚未添加的输入。'});return}
  const config=this.config(),error=validateDeliveryConfig(config)
  if(error){this.setData({error});return}
  const cfg=getCloudContext(),context=this.context;this.setData({saving:true,error:'',feedback:''})
  try{
   if(cfg){const revision=await saveMerchantDelivery(cfg,this.revision,config);if(context!==businessContextKey())throw Error('store_changed');this.revision=revision}
   else saveDelivery(config)
   if(context!==businessContextKey())throw Error('store_changed')
   this.apply(config,false);this.setData({configured:true,feedback:cfg?'云端配送配置已保存':'本机演示配置已保存'});wx.showToast({title:'配送配置已保存',icon:'success'})
  }catch(error){this.setData({error:message(error),conflict:String(error).includes('409'),.../403|401|not_logged_in|store_changed/.test(String(error))?{ready:false}:{}})}
  finally{this.setData({saving:false})}
 },
 areaInput(e:any){if(this.editable())this.setData({areaName:String(e.detail.value),dirty:true,feedback:'',error:''})},
 labelInput(e:any){if(this.editable())this.setData({slotLabel:String(e.detail.value),dirty:true,feedback:'',error:''})},
 startInput(e:any){if(this.editable())this.setData({slotStart:String(e.detail.value),dirty:true,feedback:'',error:''})},
 endInput(e:any){if(this.editable())this.setData({slotEnd:String(e.detail.value),dirty:true,feedback:'',error:''})},
 addArea(){if(!this.editable())return;const name=this.data.areaName.trim();if(!name){wx.showToast({title:'请输入配送区域名称',icon:'none'});return}const c=this.config();let id='area_'+newId();while(c.areas.some(a=>a.id===id))id='area_'+newId();c.areas.push({id,name,enabled:true});this.apply(c);this.setData({areaName:''})},
 editAreaName(e:any){if(!this.editable())return;const c=this.config(),a=c.areas.find(a=>a.id===String(e.currentTarget.dataset.id));if(!a)return;a.name=String(e.detail.value);this.apply(c)},
 toggleArea(e:any){if(!this.editable())return;const c=this.config(),a=c.areas.find(a=>a.id===String(e.currentTarget.dataset.id));if(!a)return;a.enabled=!!e.detail.value;this.apply(c)},
 moveArea(e:any){if(!this.editable())return;const c=this.config(),i=c.areas.findIndex(a=>a.id===String(e.currentTarget.dataset.id)),j=i+Number(e.currentTarget.dataset.step);if(i<0||j<0||j>=c.areas.length)return;[c.areas[i],c.areas[j]]=[c.areas[j],c.areas[i]];this.apply(c)},
 async remove(kind:'area'|'slot'|'date',id:string){
  if(!this.editable())return;const context=this.context;this.setData({confirming:true})
  const ok=await new Promise<boolean>(resolve=>wx.showModal({title:'删除此配送配置？',content:'不会修改已下单订单的快照。区域被删除后，对应地址需重新选择区域。',success:r=>resolve(r.confirm),fail:()=>resolve(false)}));this.setData({confirming:false})
  if(!ok||context!==businessContextKey()||!this.editable())return
  const c=this.config()
  if(kind==='area'){c.areas=c.areas.filter(a=>a.id!==id);c.slots=c.slots.map(s=>{if(!s.areaIds)return s;const areaIds=s.areaIds.filter(a=>a!==id);return {...s,areaIds,enabled:areaIds.length?s.enabled:false}})}
  else if(kind==='slot')c.slots=c.slots.filter(s=>s.id!==id)
  else c.specialDates=(c.specialDates||[]).filter(d=>d.date!==id)
  this.apply(c)
 },
 deleteArea(e:any){this.remove('area',String(e.currentTarget.dataset.id))},deleteSlot(e:any){this.remove('slot',String(e.currentTarget.dataset.id))},deleteDate(e:any){this.remove('date',String(e.currentTarget.dataset.date))},
 addSlot(){if(!this.editable())return;const c=this.config(),label=this.data.slotLabel.trim(),start=this.data.slotStart.trim(),end=this.data.slotEnd.trim();if(!label||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end){wx.showToast({title:'请输入有效时段和名称',icon:'none'});return}let id='slot_'+newId();while(c.slots.some(s=>s.id===id))id='slot_'+newId();c.slots.push({id,label,start,end,enabled:true,weekdays:[0,1,2,3,4,5,6]});this.apply(c);this.setData({slotLabel:'',slotStart:'',slotEnd:''})},
 editSlot(e:any){if(!this.editable())return;const key=String(e.currentTarget.dataset.key);if(!['label','start','end'].includes(key))return;const c=this.config(),s=c.slots.find(s=>s.id===String(e.currentTarget.dataset.id));if(!s)return;(s as any)[key]=String(e.detail.value);this.apply(c)},
 toggleSlot(e:any){if(!this.editable())return;const c=this.config(),s=c.slots.find(s=>s.id===String(e.currentTarget.dataset.id));if(!s)return;s.enabled=!!e.detail.value;this.apply(c)},
 chooseWeekdays(e:any){if(!this.editable())return;const c=this.config(),s=c.slots.find(s=>s.id===String(e.currentTarget.dataset.id));if(!s)return;s.weekdays=(e.detail.value as string[]).map(Number);this.apply(c)},
 toggleAllAreas(e:any){if(!this.editable())return;const c=this.config(),s=c.slots.find(s=>s.id===String(e.currentTarget.dataset.id));if(!s)return;s.areaIds=e.detail.value?undefined:c.areas.slice(0,1).map(a=>a.id);this.apply(c)},
 chooseSlotAreas(e:any){if(!this.editable())return;const c=this.config(),s=c.slots.find(s=>s.id===String(e.currentTarget.dataset.id));if(!s)return;s.areaIds=e.detail.value;this.apply(c)},
 togglePaused(e:any){if(!this.editable())return;const c=this.config();c.deliveryPaused=!!e.detail.value;this.apply(c)},
 chooseSpecialDate(e:any){if(this.editable())this.setData({specialDate:String(e.detail.value)})},
 chooseSpecialPaused(e:any){if(this.editable())this.setData({specialPaused:!!e.detail.value})},
 addSpecialDate(){if(!this.editable())return;const c=this.config(),dates=c.specialDates||[],date=this.data.specialDate,existing=dates.find(d=>d.date===date);if(existing)existing.paused=this.data.specialPaused;else dates.push({date,paused:this.data.specialPaused});c.specialDates=dates;this.apply(c)},
 toggleSpecialDate(e:any){if(!this.editable())return;const c=this.config(),date=(c.specialDates||[]).find(d=>d.date===String(e.currentTarget.dataset.date));if(!date)return;date.paused=!!e.detail.value;this.apply(c)},
 setAreaMapCenter(e:any){
  if(!this.editable())return;const id=String(e.currentTarget.dataset.id),context=this.context;this.mapSelecting=true
  wx.chooseLocation({success:loc=>{if(context!==businessContextKey()||!this.editable())return;const c=this.config(),a=c.areas.find(a=>a.id===id);if(!a)return;a.centerLat=Number(loc.latitude);a.centerLng=Number(loc.longitude);a.radiusMeters=a.radiusMeters||1500;this.apply(c)},fail:e=>{if(!String(e.errMsg).includes('cancel'))wx.showToast({title:'地图暂时无法打开',icon:'none'})},complete:()=>{this.mapSelecting=false}})
 },
 changeAreaRadius(e:any){if(!this.editable())return;const c=this.config(),a=c.areas.find(a=>a.id===String(e.currentTarget.dataset.id));if(!a)return;a.radiusMeters=Number(e.detail.value);this.apply(c)},
 clearAreaMap(e:any){if(!this.editable())return;const c=this.config(),a=c.areas.find(a=>a.id===String(e.currentTarget.dataset.id));if(!a)return;delete a.centerLat;delete a.centerLng;delete a.radiusMeters;this.apply(c)}
})
