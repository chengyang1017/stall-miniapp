import { readCustomerTracking } from '../api/tracking'
import { cloudIdentity,getCloudContext } from '../../shared/runtime/context'
import { trackingLabel } from '../../shared/domain/tracking'
import { chinaTime } from '../../shared/domain/time'
export function createCustomerTrackingController(){return {
 visible:false,reading:false,serial:0,timer:0 as any,expiryTimer:0 as any,expiry:0,identity:'',
 data:{id:'',cloudMode:false,loading:false,error:'',stateText:'位置不可用',orderStatus:'',eta:'',lastUpdated:'',hasMap:false,latitude:0,longitude:0,markers:[] as any[]},
 onLoad(this:any,q:any){this.setData({id:String(q.id||'')})},
 onShow(this:any){this.visible=true;this.identity=cloudIdentity();this.setData({cloudMode:!!getCloudContext(),stateText:'位置不可用',eta:'',orderStatus:'',error:'',lastUpdated:'',hasMap:false,markers:[]});this.refresh();this.schedule()},
 onHide(this:any){this.visible=false;this.serial++;clearTimeout(this.timer);clearTimeout(this.expiryTimer);this.expiry=0;this.setData({hasMap:false,markers:[],lastUpdated:''})},
 onUnload(this:any){this.onHide()},
 schedule(this:any){clearTimeout(this.timer);if(this.visible)this.timer=setTimeout(async()=>{if(this.expiry&&Date.now()>=this.expiry)this.setData({hasMap:false,markers:[],stateText:'位置已过期，当前不可用'});await this.refresh();this.schedule()},7000)},
 async refresh(this:any){
  if(this.reading||!this.visible||!getCloudContext())return
  if(this.identity!==cloudIdentity()){this.serial++;this.expiry=0;this.setData({hasMap:false,markers:[],lastUpdated:'',eta:'',error:'账号或店铺已变化，请返回订单页重新进入'});return}
  this.reading=true;const serial=++this.serial,requestedAt=Date.now();this.setData({loading:true})
  try{const r=await readCustomerTracking(this.data.id);if(!this.visible||serial!==this.serial||this.identity!==cloudIdentity())return
   const p=r.location&&Date.now()<requestedAt+r.expiresInSeconds*1000?r.location:null,d=r.destination,markers:any[]=[]
   if(p)markers.push({id:1,latitude:p.latitude,longitude:p.longitude,iconPath:'/assets/tabbar/cart_active.png',width:32,height:32,title:'配送人员共享位置',callout:{content:'配送人员 · 精度约'+Math.round(p.accuracy)+'米',display:'ALWAYS'}})
   if(d)markers.push({id:2,latitude:d.latitude,longitude:d.longitude,iconPath:'/assets/tabbar/home_active.png',width:32,height:32,title:'本订单配送目的地'})
   this.expiry=p?requestedAt+r.expiresInSeconds*1000:0
   clearTimeout(this.expiryTimer);if(p)this.expiryTimer=setTimeout(()=>{if(this.visible){this.expiry=0;this.setData({hasMap:false,markers:[],stateText:'位置已过期，当前不可用'})}},Math.max(0,this.expiry-Date.now()))
   this.setData({error:'',stateText:trackingLabel(!p&&r.state==='active'?'stale':r.state),orderStatus:r.orderStatus,eta:r.estimatedArrival||'尚未填写',lastUpdated:r.lastLocationAt?chinaTime(r.lastLocationAt):'尚未同步',hasMap:markers.length>0,markers,...p||d?{latitude:(p||d)!.latitude,longitude:(p||d)!.longitude}:{}})
  }catch(e){if(this.visible&&serial===this.serial){const privateFailure=/http_(401|403|404)/.test(String(e));if(privateFailure){this.expiry=0;clearTimeout(this.expiryTimer);this.setData({hasMap:false,markers:[],lastUpdated:'',eta:''})}this.setData({stateText:'同步中断，当前位置未确认',error:'位置更新失败，仅保留尚未过期的旧位置。'+String((e as Error).message)})}}
  finally{this.reading=false;if(serial===this.serial)this.setData({loading:false})}
 },
 center(this:any){if(!this.data.hasMap)return;wx.createMapContext('delivery-map').includePoints({points:this.data.markers.map((p:any)=>({latitude:p.latitude,longitude:p.longitude})),padding:[50,30,50,30]})},
 async onPullDownRefresh(this:any){try{await this.refresh()}finally{wx.stopPullDownRefresh()}}
}}
