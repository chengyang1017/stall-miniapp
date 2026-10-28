// Session-scoped editor state survives page removal, never becomes server authority.
import { businessContextKey } from '../api/business'
import { fetchMerchantDelivery,saveMerchantDelivery } from '../api/delivery'
import { getCloudContext } from '../../shared/runtime/context'
import { registerSessionCacheReset } from '../../shared/runtime/sessionLifecycle'
import { validateDeliveryConfig } from '../../shared/domain/deliveryRules'
import type { DeliveryConfig } from '../../shared/domain/delivery'
export interface DeliveryEditor {
 context:string;config:DeliveryConfig|null;confirmed:DeliveryConfig|null;revision:string|null;configured:boolean;
 version:number;savedVersion:number;inputs:Record<string,any>;status:string;error:string;conflict:boolean;
 pending:DeliveryConfig|null;uncertain:boolean;inFlight:Promise<void>|null;notify:(()=>void)|null
}
let retained:DeliveryEditor|null=null
registerSessionCacheReset(()=>{if(retained)retained.notify=null;retained=null})
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v))
export function deliveryEditor():DeliveryEditor {
 const context=businessContextKey()
 if(retained?.context!==context){if(retained)retained.notify=null;retained={context,config:null,confirmed:null,revision:null,configured:false,version:0,savedVersion:0,inputs:{},status:'unsaved',error:'',conflict:false,pending:null,uncertain:false,inFlight:null,notify:null}}
 return retained!
}
function normalized(c:DeliveryConfig){return {...c,deliveryPaused:!!c.deliveryPaused,specialDates:c.specialDates||[],areas:c.areas.map(a=>({...a,name:a.name.trim()})),slots:c.slots.map(slot=>({...slot,label:slot.label.trim(),weekdays:(slot.weekdays||[0,1,2,3,4,5,6]).slice().sort(),...slot.areaIds?{areaIds:slot.areaIds.slice().sort()}:{}}))}}
function canonical(v:any):string{return JSON.stringify(v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value).sort().reduce((out:any,key)=>{out[key]=value[key];return out},{}):value)}
function same(a:DeliveryConfig,b:DeliveryConfig){return canonical(normalized(a))===canonical(normalized(b))}
function current(s:DeliveryEditor){return retained===s&&s.context===businessContextKey()}
function emit(s:DeliveryEditor){if(current(s))s.notify?.()}
export function editDelivery(s:DeliveryEditor,config:DeliveryConfig){if(!current(s))return;s.config=copy(config);s.version++;if(!s.uncertain){s.status='unsaved';s.error=''}emit(s)}
export function acceptDelivery(s:DeliveryEditor,config:DeliveryConfig,revision:string|null,configured:boolean){s.config=copy(config);s.confirmed=copy(config);s.revision=revision;s.configured=configured;s.savedVersion=s.version;s.pending=null;s.uncertain=false;s.conflict=false;s.error='';s.status='saved';emit(s)}
export function queueDeliverySave(s:DeliveryEditor):Promise<void>{
 if(!current(s)||s.conflict||s.uncertain||!s.config)return Promise.resolve()
 if(s.inFlight)return s.inFlight
 const task=(async()=>{
  while(current(s)&&s.config&&s.savedVersion!==s.version){
   const error=validateDeliveryConfig(s.config)
   if(error){s.error=error;s.status='unsaved';emit(s);return}
   const cfg=getCloudContext();if(!cfg)return
   const version=s.version,snapshot=copy(s.config);s.pending=snapshot;s.status='saving';emit(s)
   try{
    const revision=await saveMerchantDelivery(cfg,s.revision,snapshot)
    if(!current(s))return
    s.revision=revision;s.confirmed=snapshot;s.pending=null;s.configured=true;s.savedVersion=version;s.status=s.version===version?'saved':'unsaved';s.error='';emit(s)
   }catch(error){if(!current(s))return;s.uncertain=true;s.conflict=String(error).includes('409');s.error=String(error);s.status='failed';emit(s);return}
  }
 })().finally(()=>{if(s.inFlight===task)s.inFlight=null;emit(s)})
 s.inFlight=task;return task
}
export async function reconcileDelivery(s:DeliveryEditor):Promise<void>{
 if(!current(s)||s.inFlight||!s.config)return
 const cfg=getCloudContext();if(!cfg)return
 const version=s.version,pending=s.pending
 try{
  const remote=await fetchMerchantDelivery(cfg);if(!current(s)||s.inFlight||s.version!==version||s.pending!==pending)return
  // Only an exact server echo can resolve an unknown write as saved.
  if(s.pending&&same(remote.config,s.pending)){
   s.revision=remote.revision;s.confirmed=copy(remote.config);s.configured=remote.configured;s.pending=null;s.uncertain=false;s.conflict=false;s.error=''
   if(same(s.config,remote.config)){s.savedVersion=s.version;s.status='saved'}else{s.status='unsaved';await queueDeliverySave(s)}
  }else if(!s.uncertain&&s.savedVersion===s.version){acceptDelivery(s,remote.config,remote.revision,remote.configured)}
  else if(remote.revision!==s.revision){s.conflict=true;s.status='failed';s.error='http_409_configuration_changed'}
  // An unchanged revision allows an explicit retry, never an automatic duplicate write.
  else if(!s.uncertain){s.status='unsaved';s.error=''}
  else{s.uncertain=false;s.status='failed';s.error='写入未确认，草稿保留；请点击重试保存'}
  emit(s)
 }catch(error){if(current(s)&&s.version===version&&!s.inFlight){s.status='failed';s.error=String(error);if(/401|403|not_logged_in/.test(s.error))s.uncertain=true;emit(s)}}
}
