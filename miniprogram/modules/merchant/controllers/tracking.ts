import { cloudIdentity,getCloudContext } from '../../shared/runtime/context'
import { chinaTime } from '../../shared/domain/time'
import { trackingLabel } from '../../shared/domain/tracking'
import type { TrackingView } from '../../shared/domain/tracking'
import { merchantTracking,trackingCouriers,assignTracking } from '../api/tracking'
import type { CourierChoice } from '../api/tracking'
import { observeDevice,beginTracking,pauseTracking,endTracking,reconcileTracking } from './trackingDevice'
export function createMerchantTrackingController(){return {
 visible:false,reading:false,serial:0,timer:0 as any,identity:'',unwatch:null as null|(()=>void),snapshot:null as TrackingView|null,
 data:{id:'',cloudMode:false,loading:false,busy:false,error:'',stateText:'位置不可用',ownCourierLabel:'',couriers:[] as CourierChoice[],courierIndex:0,canAssign:false,canControl:false,sessionId:'',assignmentVersion:0,orderStatus:'',running:false,uploading:false,currentTask:'',lastSynced:'',accuracy:'',hasPoint:false,latitude:0,longitude:0,markers:[] as any[]},
 onLoad(this:any,q:any){this.setData({id:String(q.id||'')})},
 resetIdentity(this:any){const identity=cloudIdentity();if(this.identity!==identity){this.serial++;this.snapshot=null;this.setData({canAssign:false,canControl:false,couriers:[],ownCourierLabel:'',sessionId:'',assignmentVersion:0,orderStatus:'',stateText:'位置不可用',lastSynced:'',currentTask:'',hasPoint:false,markers:[],error:''})}this.identity=identity},
 onShow(this:any){this.visible=true;this.resetIdentity();this.setData({cloudMode:!!getCloudContext()});this.unwatch=observeDevice(v=>{if(!this.visible||this.identity!==cloudIdentity())return;const own=v.orderId===this.data.id;this.setData({running:own&&v.running,uploading:own&&v.uploading,currentTask:v.orderId,lastSynced:v.lastSynced?chinaTime(v.lastSynced):'',accuracy:own&&v.point?String(Math.round(v.point.accuracy)):'',hasPoint:own&&!!v.point,...own&&v.point?{latitude:v.point.latitude,longitude:v.point.longitude,markers:[{id:1,latitude:v.point.latitude,longitude:v.point.longitude,iconPath:'/assets/tabbar/cart_active.png',width:32,height:32,title:'本人实时设备位置'}]}:{markers:[]},...v.error?{error:v.error}:{}})});this.refresh();this.schedule()},
 onHide(this:any){this.visible=false;this.serial++;clearTimeout(this.timer);this.unwatch?.();this.unwatch=null;void pauseTracking();this.setData({hasPoint:false,markers:[],running:false})},
 onUnload(this:any){this.onHide()},
 schedule(this:any){clearTimeout(this.timer);if(this.visible)this.timer=setTimeout(async()=>{await this.refresh();this.schedule()},7000)},
 async refresh(this:any){
  if(this.reading||!this.visible||!getCloudContext())return
  if(this.identity!==cloudIdentity()){void pauseTracking();this.serial++;this.setData({canControl:false,canAssign:false,sessionId:'',couriers:[],hasPoint:false,markers:[],error:'身份或店铺已变化，请返回订单页重新进入'});return}
  this.reading=true;const serial=++this.serial;this.setData({loading:true})
  try{const r=await merchantTracking(this.data.id);if(serial!==this.serial||!this.visible||this.identity!==cloudIdentity())return
   this.snapshot=r;reconcileTracking(this.data.id,r);this.setData({stateText:trackingLabel(r.state),canAssign:!!r.canAssign,canControl:!!r.canControl,sessionId:r.sessionId||'',assignmentVersion:r.assignmentVersion||0,orderStatus:r.orderStatus})
   if(r.canAssign&&!this.data.couriers.length)await this.loadCouriers(serial)
  }catch(e){if(serial===this.serial&&this.visible){this.setData({error:'追踪读取失败：'+String((e as Error).message)});if(/http_(401|403)|not_delivering/.test(String(e)))void pauseTracking()}}
  finally{if(!this.data.ownCourierLabel&&serial===this.serial&&this.visible)await this.loadCouriers(serial);this.reading=false;if(serial===this.serial)this.setData({loading:false})}
 },
 async loadCouriers(this:any,serial:number){try{const rows=await trackingCouriers();if(serial===this.serial&&this.visible&&this.identity===cloudIdentity())this.setData({couriers:rows,ownCourierLabel:rows.find(r=>r.self)?.label||'',courierIndex:Math.max(0,rows.findIndex(v=>v.id===this.snapshot?.courierId))})}catch{/* The primary tracking request retains the authorization/error state. */}},
 courierChange(this:any,e:any){if(!this.data.busy)this.setData({courierIndex:Number(e.detail.value)})},
 async assign(this:any){const c=this.data.couriers[this.data.courierIndex];if(!c||this.data.busy)return;wx.showModal({title:'指派本单配送人员',content:'仅此成员可主动共享位置；重新指派将结束旧共享。所选：'+c.label,success:async(r:any)=>{if(!r.confirm||!this.visible||this.data.busy||this.identity!==cloudIdentity())return;this.setData({busy:true,error:''});try{await assignTracking(this.data.id,c.id,this.data.assignmentVersion);await this.refresh()}catch(e){this.setData({error:'指派未确认，请刷新核对：'+String((e as Error).message)})}finally{this.setData({busy:false})}}})},
 start(this:any){if(this.data.busy||!this.data.canControl)return;wx.showModal({title:'主动共享配送位置',content:'仅前台采集本人的设备位置并分享给本订单顾客。离开本页即停止采集并请求暂停；没有后台定位。是否同意？',success:async(r:any)=>{if(!r.confirm||!this.visible||this.data.busy||this.identity!==cloudIdentity())return;this.setData({busy:true,error:''});try{await beginTracking(this.data.id);await this.refresh()}catch(e){if(this.visible)this.setData({error:String((e as Error).message)})}finally{this.setData({busy:false})}}})},
 async pause(this:any){if(this.data.busy)return;this.setData({busy:true});try{await pauseTracking();await this.refresh()}finally{this.setData({busy:false})}},
 stop(this:any){if(this.data.busy||!this.data.sessionId||!this.data.canControl)return;wx.showModal({title:'结束位置共享',content:'停止采集并结束本次共享；不会更改订单送达或支付状态。',success:async(r:any)=>{if(!r.confirm||!this.visible||this.data.busy||this.identity!==cloudIdentity())return;this.setData({busy:true,error:''});try{await endTracking(this.data.id,this.data.sessionId);await this.refresh()}catch(e){this.setData({error:'设备采集已停，服务端结束未确认，请刷新重试：'+String((e as Error).message)})}finally{this.setData({busy:false})}}})},
 settings(){wx.openSetting({})},
 async onPullDownRefresh(this:any){try{await this.refresh()}finally{wx.stopPullDownRefresh()}}
}}
