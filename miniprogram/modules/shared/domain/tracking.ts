export type TrackingState='unavailable'|'active'|'stale'|'paused'|'ended'
export interface TrackingPoint {latitude:number;longitude:number;accuracy:number;coordinateSystem:'gcj02';sampledAt:string;receivedAt?:string;seq?:number}
export interface TrackingView {
 state:TrackingState;sessionId:string|null;orderStatus:string;estimatedArrival:string;lastLocationAt:string|null;serverTime:string;expiresInSeconds:number
 location:TrackingPoint|null;destination?:{latitude:number;longitude:number;coordinateSystem:'gcj02'}|null
 canAssign?:boolean;canControl?:boolean;assignmentVersion?:number;courierId?:string|null;lastSeq?:number
}
export function validPoint(p:Pick<TrackingPoint,'latitude'|'longitude'|'accuracy'>):boolean{return [p.latitude,p.longitude,p.accuracy].every(Number.isFinite)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180&&!(p.latitude===0&&p.longitude===0)&&p.accuracy>0&&p.accuracy<=200}
export function distanceMeters(a:TrackingPoint,b:TrackingPoint):number{
 const rad=Math.PI/180,dlat=(b.latitude-a.latitude)*rad,dlon=(b.longitude-a.longitude)*rad
 return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlon/2)**2)))
}
export function trackingLabel(state:TrackingState):string{return {unavailable:'位置不可用／尚未开始共享',active:'正在共享',stale:'位置失联或等待有效定位',paused:'已暂停位置共享',ended:'位置共享已结束'}[state]}
