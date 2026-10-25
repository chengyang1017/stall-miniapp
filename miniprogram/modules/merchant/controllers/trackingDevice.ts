import { cloudIdentity,getCloudContext } from '../../shared/runtime/context'
import { registerSessionCacheReset } from '../../shared/runtime/sessionLifecycle'
import { supportKey } from '../../shared/domain/support'
import { distanceMeters,validPoint } from '../../shared/domain/tracking'
import type { TrackingPoint,TrackingView } from '../../shared/domain/tracking'
import { merchantTracking } from '../api/tracking'

// One foreground listener per application. Coordinates/lease remain in memory only.
interface Lease {orderId:string;sessionId:string;key:string;identity:string;seq:number}
export interface DeviceView {running:boolean;uploading:boolean;orderId:string;point:TrackingPoint|null;lastSynced:string;error:string}
let lease:Lease|null=null,generation=0,starting=false,posting=false,lastSent=0,lastAttempt=0,lastSentSample='',lastPoint:TrackingPoint|null=null,latest:TrackingPoint|null=null,authorityAt=0,guardTimer=0 as any
let state:DeviceView={running:false,uploading:false,orderId:'',point:null,lastSynced:'',error:''}
const listeners=new Set<(v:DeviceView)=>void>()
const emit=(patch:Partial<DeviceView>)=>{state={...state,...patch};listeners.forEach(fn=>fn({...state}))}
export function observeDevice(fn:(v:DeviceView)=>void):()=>void{if(lease&&lease.identity!==cloudIdentity()){halt();lease=null;emit({orderId:'',lastSynced:'',error:''})}listeners.add(fn);fn({...state});return ()=>listeners.delete(fn)}
function halt(){generation++;clearInterval(guardTimer);if(typeof wx.offLocationChange==='function')wx.offLocationChange(locationChanged);if((state.running||starting)&&typeof wx.stopLocationUpdate==='function')wx.stopLocationUpdate({fail:()=>emit({error:'停止定位接口未确认，请检查系统定位设置；已解除本页监听并停止上传'})});latest=null;emit({running:false,point:null})}
registerSessionCacheReset(()=>{halt();lease=null;emit({orderId:'',lastSynced:''})})
async function upload(){
 const current=lease,p=latest,gen=generation,now=Date.now()
 if(!current||!p||!state.running||posting)return
 if(current.identity!==cloudIdentity()){halt();lease=null;emit({orderId:'',lastSynced:'',error:'账号或店铺已变化，定位已停止'});return}
 if(now-Date.parse(p.sampledAt)>60000||p.sampledAt===lastSentSample||now-lastAttempt<7000||lastPoint&&distanceMeters(lastPoint,p)<20&&now-lastSent<30000)return
 lastAttempt=now;posting=true;emit({uploading:true})
 const seq=++current.seq
 try{
  const r=await merchantTracking(current.orderId,'location',{sessionId:current.sessionId,controlKey:current.key,...p,seq})
  if(gen!==generation||current!==lease)return
  lastSent=Date.now();authorityAt=lastSent;lastSentSample=p.sampledAt;lastPoint=p;emit({lastSynced:r.lastLocationAt||'',error:''})
 }catch(e){
  if(gen!==generation||current!==lease)return
  const message=String((e as Error).message)
  emit({error:'同步失败，当前位置尚未确认：'+message})
  if(/http_(401|403)|not_delivering|session_ended|device_control_required|session_changed/.test(message))halt()
  else if(/out_of_order/.test(message)){
   try{const r=await merchantTracking(current.orderId);if(current===lease)current.seq=Math.max(current.seq,r.lastSeq||0)}catch{ /* keep explicit error, never fake acknowledgement */ }
  }
 }finally{posting=false;emit({uploading:false})}
}
function locationChanged(v:WechatMiniprogram.OnLocationChangeCallbackResult){
 if(!state.running)return
 const p:TrackingPoint={latitude:v.latitude,longitude:v.longitude,accuracy:v.accuracy,coordinateSystem:'gcj02',sampledAt:new Date().toISOString()}
 if(!validPoint(p)){emit({point:null,error:'定位精度不足或坐标无效，未上传；请移至定位信号较好的位置'});return}
 latest=p;emit({point:p});void upload()
}
export async function beginTracking(orderId:string):Promise<void>{
 if(starting||state.running)throw Error('已有定位请求或共享任务，请先暂停或结束')
 if(!getCloudContext())throw Error('本机演示不采集或上传真实定位')
 if(typeof wx.startLocationUpdate!=='function'||typeof wx.onLocationChange!=='function')throw Error('当前微信版本不支持持续定位')
 if(lease&&lease.identity!==cloudIdentity()){halt();lease=null}
 if(lease&&lease.orderId!==orderId)throw Error('请先结束原配送任务的共享；当前仅支持单任务')
 starting=true;const gen=++generation,identity=cloudIdentity()
 const current=lease||{orderId,sessionId:'',key:supportKey(),identity,seq:0};lease=current
 try{
  await new Promise<void>((resolve,reject)=>wx.authorize({scope:'scope.userLocation',success:()=>resolve(),fail:()=>reject(Error('未授权前台定位，请主动前往设置授权后重试'))}))
  if(gen!==generation||identity!==cloudIdentity())return
  const r=await merchantTracking(orderId,'start',{controlKey:current.key});current.sessionId=String(r.sessionId);current.seq=r.lastSeq||0
  if(gen!==generation||identity!==cloudIdentity()){await merchantTracking(orderId,'pause',{sessionId:current.sessionId,controlKey:current.key}).catch(()=>{});return}
  if(r.state==='paused')await merchantTracking(orderId,'resume',{sessionId:current.sessionId,controlKey:current.key})
  if(gen!==generation||identity!==cloudIdentity()){await merchantTracking(orderId,'pause',{sessionId:current.sessionId,controlKey:current.key}).catch(()=>{});return}
  // GCJ-02 is explicitly requested; there is no background location call.
  const options={type:'gcj02',success:()=>{},fail:()=>{}}
  await new Promise<void>((resolve,reject)=>wx.startLocationUpdate({...options,success:()=>resolve(),fail:()=>reject(Error('微信定位未启动，请检查接口开通、隐私声明及系统授权'))}))
  if(gen!==generation||identity!==cloudIdentity()){wx.stopLocationUpdate({});await merchantTracking(orderId,'pause',{sessionId:current.sessionId,controlKey:current.key}).catch(()=>{});return}
  lastSent=0;lastAttempt=0;lastSentSample='';lastPoint=null;latest=null
  wx.offLocationChange(locationChanged);wx.onLocationChange(locationChanged)
  authorityAt=Date.now();clearInterval(guardTimer);guardTimer=setInterval(()=>{if(state.running&&(cloudIdentity()!==current.identity||Date.now()-authorityAt>45000)){void pauseTracking();emit({error:'超过45秒无法确认任务授权，已停止定位；恢复网络并刷新后可主动重试'})}},3000)
  emit({running:true,orderId,error:'',point:null,lastSynced:r.lastLocationAt||''})
 }catch(e){if(gen===generation){halt();emit({error:String((e as Error).message)});if(current.sessionId)await merchantTracking(orderId,'pause',{sessionId:current.sessionId,controlKey:current.key}).catch(()=>{})}throw e}
 finally{starting=false}
}
export async function pauseTracking():Promise<void>{
 halt();const current=lease
 if(current?.sessionId&&current.identity===cloudIdentity())await merchantTracking(current.orderId,'pause',{sessionId:current.sessionId,controlKey:current.key}).catch(e=>emit({error:'已停止设备采集，服务器暂停未确认；旧位置最多显示120秒。'+String(e.message)}))
}
export async function endTracking(orderId:string,sessionId:string):Promise<void>{
 halt();const identity=cloudIdentity()
 await merchantTracking(orderId,'stop',{sessionId})
 if(identity===cloudIdentity()&&lease?.orderId===orderId){lease=null;emit({orderId:'',lastSynced:'',error:''})}
}
export function reconcileTracking(orderId:string,r:TrackingView){
 if(!lease||lease.orderId!==orderId)return
 if(lease.identity!==cloudIdentity()||r.sessionId!==lease.sessionId||!r.canControl||r.state==='ended'||r.orderStatus!=='delivering'){halt();lease=null;emit({orderId:'',lastSynced:'',error:'任务授权已结束或变化，设备定位已停止'});return}
 lease.seq=Math.max(lease.seq,r.lastSeq||0)
 authorityAt=Date.now()
 if(r.state==='paused'&&state.running)halt()
 if(state.running)void upload()
}
