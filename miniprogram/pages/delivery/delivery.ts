import { deliveryEditor,editDelivery,acceptDelivery,queueDeliverySave,reconcileDelivery,DeliveryEditor } from '../../modules/merchant/controllers/deliveryEditor'
import {loadDelivery,saveDelivery,DeliveryConfig,DeliverySlot,validateDeliveryConfig} from '../../modules/merchant/demo/settings'
import {newId} from '../../modules/merchant/demo/store'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { businessContextKey } from '../../modules/merchant/api/business'
import { fetchMerchantDelivery, saveMerchantDelivery } from '../../modules/merchant/api/delivery'
const weekdays=['周日','周一','周二','周三','周四','周五','周六']
function message(error:unknown):string{const s=String(error);if(s.includes('store_changed'))return '店铺或模式已变化，请重新读取后操作。';if(s.includes('409'))return '配置已被其他设备或营业设置修改，请重新读取后编辑；本次输入仍保留。';if(s.includes('403')||s.includes('401')||s.includes('not_logged_in'))return '无配送管理权限或登录已失效，请使用有权限的商家账号。';if(s.includes('overlapping'))return '同一区域、同一星期的时段存在重叠，请调整。';if(s.includes('duplicate_area_name'))return '配送区域名称不能重复。';return '读取或保存失败，请检查网络和后端版本；不会回退本机配置。'}
Page({
 editor:null as DeliveryEditor|null,editorNotify:null as (()=>void)|null,visible:false,context:'',revision:null as string|null,serial:0,mapSelecting:false,
 data:{areas:[] as DeliveryConfig['areas'],slots:[] as DeliverySlot[],specialDates:[] as Array<{date:string;paused:boolean}>,deliveryPaused:false,
  areaName:'',slotLabel:'',slotStart:'',slotEnd:'',specialDate:new Date(Date.now()+8*3600000).toISOString().slice(0,10),specialPaused:true,
  activeSection:'areas',slotViews:[] as any[],enabledAreas:0,enabledSlots:0,syncState:'unsaved',cloudMode:false,sourceStore:'',configured:false,loading:false,saving:false,confirming:false,ready:false,dirty:false,conflict:false,error:'',feedback:''},
 selectSection(e:any){const s=String(e.currentTarget.dataset.section||'');if(['areas','slots','dates'].includes(s))this.setData({activeSection:s})},
 onShow(){
  this.visible=true;if(this.mapSelecting){if(this.editor&&this.editor.context===businessContextKey())this.editor.notify=this.editorNotify;return}
  if(getCloudContext()){
   const state=deliveryEditor();if(this.context!==state.context){this.serial++;this.setData({areas:[],slots:[],slotViews:[],specialDates:[],areaName:'',slotLabel:'',slotStart:'',slotEnd:'',dirty:false,saving:false,ready:false})}this.editor=state;this.context=state.context
   this.editorNotify=()=>this.syncEditor();state.notify=this.editorNotify
   if(state.config){this.syncEditor();if(!state.inFlight)reconcileDelivery(state);return}
  }
  if(this.context===businessContextKey()&&(this.data.dirty||this.data.saving))return;this.reload()
 },
 rememberInputs(){try{if(this.data.dirty||this.data.saving)wx.enableAlertBeforeUnload({message:'配送草稿未确认，当前会话保留，请勿关闭小程序进程'})}catch(_){}if(this.editor&&this.context===businessContextKey())this.editor.inputs={areaName:this.data.areaName,slotLabel:this.data.slotLabel,slotStart:this.data.slotStart,slotEnd:this.data.slotEnd,specialDate:this.data.specialDate,specialPaused:this.data.specialPaused}},
 onHide(){this.rememberInputs();this.visible=false;if(this.editor&&this.editor.notify===this.editorNotify)this.editor.notify=null;this.serial++},
 onUnload(){this.onHide()},
 syncEditor(){
  const state=this.editor;if(!this.visible||!state||state.context!==businessContextKey()||!state.config)return
  this.revision=state.revision;this.apply(state.config,false)
  const draft=state.version!==state.savedVersion||['areaName','slotLabel','slotStart','slotEnd'].some(key=>!!state.inputs[key])
  this.setData({...state.inputs,cloudMode:true,sourceStore:getCloudContext()?.storeSlug||'',ready:true,loading:false,configured:state.configured,dirty:draft,saving:!!state.inFlight||state.status==='saving',syncState:state.status,conflict:state.conflict,error:state.error?(/^(?:Error:|http_|not_logged_in|store_changed)/.test(state.error)?message(state.error):state.error):'',feedback:state.status==='saved'?(draft?'已有配置已保存，新增输入尚未提交':'配送时段/配置已由服务器确认'):state.status==='saving'?'保存中；离开页面后草稿与同步状态会保留':state.status==='failed'?'保存未确认，草稿已保留，请核对后重试':'未保存，完整有效后自动保存时段'})
  if(/http_40[13]|not_logged_in/.test(state.error))this.setData({ready:false,areas:[],slots:[],slotViews:[],specialDates:[]})
  try{if(draft||state.inFlight)wx.enableAlertBeforeUnload({message:'配送草稿尚未确认，当前会话会保留；请勿关闭小程序进程'});else wx.disableAlertBeforeUnload()}catch(_){/* Visible status remains available on older clients. */}
 },
 autoSave(){
  this.rememberInputs();if(!getCloudContext()){this.saveAll();return}
  if(!this.editor||this.context!==businessContextKey())return
  queueDeliverySave(this.editor)
 },
 async retrySave(){if(!this.editor)return;await reconcileDelivery(this.editor);if(!this.editor.conflict&&!this.editor.uncertain)await queueDeliverySave(this.editor)},
 config():DeliveryConfig{return JSON.parse(JSON.stringify({areas:this.data.areas,slots:this.data.slots,specialDates:this.data.specialDates,deliveryPaused:this.data.deliveryPaused}))},
 editable(whileSaving=false):boolean{return this.data.ready&&!this.data.loading&&(whileSaving||!this.data.saving)&&!this.data.confirming&&!this.data.conflict&&this.context===businessContextKey()},
 apply(config:DeliveryConfig,dirty=true){
  if(dirty)this.rememberInputs()
  if(dirty&&this.editor&&this.context===businessContextKey())editDelivery(this.editor,config)
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
  const cfg=getCloudContext(),context=businessContextKey(),serial=++this.serial;this.context=context;if(this.editor)this.editor.inputs={}
  this.setData({cloudMode:!!cfg,sourceStore:cfg?.storeSlug||'',loading:true,ready:false,dirty:false,conflict:false,error:'',feedback:'',areas:[],slots:[],slotViews:[],specialDates:[],enabledAreas:0,enabledSlots:0,deliveryPaused:false,areaName:'',slotLabel:'',slotStart:'',slotEnd:''})
  try{
   const result=cfg?await fetchMerchantDelivery(cfg):{config:loadDelivery(),revision:null,configured:true}
   if(serial!==this.serial||context!==businessContextKey())return
   this.revision=result.revision;if(this.editor)acceptDelivery(this.editor,result.config,result.revision,result.configured);this.apply(result.config,false);this.setData({ready:true,configured:result.configured})
  }catch(error){if(serial===this.serial)this.setData({error:cfg?message(error):'本机配送配置读取失败，请检查本地数据。'})}
  finally{if(serial===this.serial){this.setData({loading:false});if(context!==businessContextKey())this.setData({ready:false,error:'店铺或数据模式已变化，请重新读取。'})}}
 },
 async saveAll(){
  if(!this.editable()||!this.data.dirty)return
  if(this.data.areaName.trim()||this.data.slotLabel.trim()||this.data.slotStart.trim()||this.data.slotEnd.trim()){this.setData({error:'请先点击新增，将输入加入待保存配置；或清空尚未添加的输入。'});return}
  if(getCloudContext()&&this.editor){editDelivery(this.editor,this.config());this.autoSave();return}
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
 areaInput(e:any){if(this.editable()){this.setData({areaName:String(e.detail.value),dirty:true,feedback:'',error:''});this.rememberInputs()}},
 labelInput(e:any){if(this.editable(true)){this.setData({slotLabel:String(e.detail.value),dirty:true,feedback:'',error:''});this.rememberInputs()}},
 startInput(e:any){if(this.editable(true)){this.setData({slotStart:String(e.detail.value),dirty:true,feedback:'',error:''});this.rememberInputs();this.tryAddSlot()}},
 endInput(e:any){if(this.editable(true)){this.setData({slotEnd:String(e.detail.value),dirty:true,feedback:'',error:''});this.rememberInputs();this.tryAddSlot()}},
 addArea(){if(!this.editable())return;const name=this.data.areaName.trim();if(!name){wx.showToast({title:'请输入配送区域名称',icon:'none'});return}const c=this.config();let id='area_'+newId();while(c.areas.some(a=>a.id===id))id='area_'+newId();c.areas.push({id,name,enabled:true});this.apply(c);this.setData({areaName:''});this.autoSave()},
 editAreaName(e:any){if(!this.editable())return;const c=this.config(),a=c.areas.find(a=>a.id===String(e.currentTarget.dataset.id));if(!a)return;a.name=String(e.detail.value);this.apply(c)},
 saveAreaName(){if(this.data.ready&&this.data.dirty)this.autoSave()},
 toggleArea(e:any){if(!this.editable())return;const c=this.config(),a=c.areas.find(a=>a.id===String(e.currentTarget.dataset.id));if(!a)return;a.enabled=!!e.detail.value;this.apply(c);this.autoSave()},
 moveArea(e:any){if(!this.editable())return;const c=this.config(),i=c.areas.findIndex(a=>a.id===String(e.currentTarget.dataset.id)),j=i+Number(e.currentTarget.dataset.step);if(i<0||j<0||j>=c.areas.length)return;[c.areas[i],c.areas[j]]=[c.areas[j],c.areas[i]];this.apply(c);this.autoSave()},
 async remove(kind:'area'|'slot'|'date',id:string){
  if(!this.editable())return;const context=this.context;this.setData({confirming:true})
  const ok=await new Promise<boolean>(resolve=>wx.showModal({title:'删除此配送配置？',content:'不会修改已下单订单的快照。区域被删除后，对应地址需重新选择区域。',success:r=>resolve(r.confirm),fail:()=>resolve(false)}));this.setData({confirming:false})
  if(!ok||context!==businessContextKey()||!this.editable())return
  const c=this.config()
  if(kind==='area'){c.areas=c.areas.filter(a=>a.id!==id);c.slots=c.slots.map(s=>{if(!s.areaIds)return s;const areaIds=s.areaIds.filter(a=>a!==id);return {...s,areaIds,enabled:areaIds.length?s.enabled:false}})}
  else if(kind==='slot')c.slots=c.slots.filter(s=>s.id!==id)
  else c.specialDates=(c.specialDates||[]).filter(d=>d.date!==id)
  this.apply(c);this.autoSave()
 },
 deleteArea(e:any){this.remove('area',String(e.currentTarget.dataset.id))},deleteSlot(e:any){this.remove('slot',String(e.currentTarget.dataset.id))},deleteDate(e:any){this.remove('date',String(e.currentTarget.dataset.date))},
 tryAddSlot(){if(this.data.slotLabel.trim()&&/^([01]\d|2[0-3]):[0-5]\d$/.test(this.data.slotStart)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(this.data.slotEnd)&&this.data.slotStart<this.data.slotEnd)this.addSlot();else{this.setData({syncState:'unsaved',feedback:'新时段未完整有效，尚未提交'});this.rememberInputs()}},
 addSlot(){if(!this.editable(true))return;const c=this.config(),label=this.data.slotLabel.trim(),start=this.data.slotStart.trim(),end=this.data.slotEnd.trim();if(!label||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end){wx.showToast({title:'请输入有效时段和名称',icon:'none'});return}let id='slot_'+newId();while(c.slots.some(s=>s.id===id))id='slot_'+newId();c.slots.push({id,label,start,end,enabled:true,weekdays:[0,1,2,3,4,5,6]});this.apply(c);this.setData({slotLabel:'',slotStart:'',slotEnd:''});this.autoSave()},
 editSlot(e:any){if(!this.editable(true))return;const key=String(e.currentTarget.dataset.key);if(!['label','start','end'].includes(key))return;const c=this.config(),s=c.slots.find(s=>s.id===String(e.currentTarget.dataset.id));if(!s)return;(s as any)[key]=String(e.detail.value);this.apply(c);if(key!=='label')this.autoSave()},
 toggleSlot(e:any){if(!this.editable(true))return;const c=this.config(),s=c.slots.find(s=>s.id===String(e.currentTarget.dataset.id));if(!s)return;s.enabled=!!e.detail.value;this.apply(c);this.autoSave()},
 chooseWeekdays(e:any){if(!this.editable(true))return;const c=this.config(),s=c.slots.find(s=>s.id===String(e.currentTarget.dataset.id));if(!s)return;s.weekdays=(e.detail.value as string[]).map(Number);this.apply(c);this.autoSave()},
 toggleAllAreas(e:any){if(!this.editable(true))return;const c=this.config(),s=c.slots.find(s=>s.id===String(e.currentTarget.dataset.id));if(!s)return;s.areaIds=e.detail.value?undefined:c.areas.slice(0,1).map(a=>a.id);this.apply(c);this.autoSave()},
 chooseSlotAreas(e:any){if(!this.editable(true))return;const c=this.config(),s=c.slots.find(s=>s.id===String(e.currentTarget.dataset.id));if(!s)return;s.areaIds=e.detail.value;this.apply(c);this.autoSave()},
 togglePaused(e:any){if(!this.editable())return;const c=this.config();c.deliveryPaused=!!e.detail.value;this.apply(c);this.autoSave()},
 chooseSpecialDate(e:any){if(this.editable())this.setData({specialDate:String(e.detail.value)})},
 chooseSpecialPaused(e:any){if(this.editable())this.setData({specialPaused:!!e.detail.value})},
 addSpecialDate(){if(!this.editable())return;const c=this.config(),dates=c.specialDates||[],date=this.data.specialDate,existing=dates.find(d=>d.date===date);if(existing)existing.paused=this.data.specialPaused;else dates.push({date,paused:this.data.specialPaused});c.specialDates=dates;this.apply(c);this.autoSave()},
 toggleSpecialDate(e:any){if(!this.editable())return;const c=this.config(),date=(c.specialDates||[]).find(d=>d.date===String(e.currentTarget.dataset.date));if(!date)return;date.paused=!!e.detail.value;this.apply(c);this.autoSave()},
 setAreaMapCenter(e:any){
  if(!this.editable())return;const id=String(e.currentTarget.dataset.id),context=this.context;this.mapSelecting=true
  wx.chooseLocation({success:loc=>{if(context!==businessContextKey()||!this.editable())return;const c=this.config(),a=c.areas.find(a=>a.id===id);if(!a)return;a.centerLat=Number(loc.latitude);a.centerLng=Number(loc.longitude);a.radiusMeters=a.radiusMeters||1500;this.apply(c);this.autoSave()},fail:e=>{if(!String(e.errMsg).includes('cancel'))wx.showToast({title:'地图暂时无法打开',icon:'none'})},complete:()=>{this.mapSelecting=false}})
 },
 changeAreaRadius(e:any){if(!this.editable())return;const c=this.config(),a=c.areas.find(a=>a.id===String(e.currentTarget.dataset.id));if(!a)return;a.radiusMeters=Number(e.detail.value);this.apply(c);this.autoSave()},
 clearAreaMap(e:any){if(!this.editable())return;const c=this.config(),a=c.areas.find(a=>a.id===String(e.currentTarget.dataset.id));if(!a)return;delete a.centerLat;delete a.centerLng;delete a.radiusMeters;this.apply(c);this.autoSave()}
})
