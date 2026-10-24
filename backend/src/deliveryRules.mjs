import { authenticate, permittedStore } from './auth.mjs'
const jsonHeader = { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }
const response=(res,code,data)=>{res.writeHead(code,jsonHeader);res.end(JSON.stringify(data))}
const hhmm=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x)
const safeText=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.length<=max
const coord=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max
export function validRules(c){
 if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.accepting!=='boolean'||!Array.isArray(c.days)||c.days.length!==7||!Array.isArray(c.areas)||c.areas.length<1||c.areas.length>30||!Array.isArray(c.slots)||c.slots.length<1||c.slots.length>30) return false
 if(!c.days.every(d=>d&&typeof d.enabled==='boolean'&&hhmm(d.start)&&hhmm(d.end)&&d.start<d.end))return false
 if(!c.areas.every(a=>a&&safeText(a.id,60)&&safeText(a.name,120)&&typeof a.enabled==='boolean'&&((a.latitude===null&&a.longitude===null&&a.radiusMeters===null)||(coord(a.latitude,-90,90)&&coord(a.longitude,-180,180)&&Number.isInteger(a.radiusMeters)&&a.radiusMeters>=100&&a.radiusMeters<=100000))))return false
 if(!c.slots.every(s=>s&&safeText(s.id,60)&&safeText(s.label,120)&&typeof s.enabled==='boolean'&&hhmm(s.start)&&hhmm(s.end)&&s.start<s.end))return false
 return new Set(c.areas.map(a=>a.id)).size===c.areas.length&&new Set(c.slots.map(s=>s.id)).size===c.slots.length
}
async function bodyJson(req){
 let raw='';for await(const b of req){raw+=b.toString('utf8');if(Buffer.byteLength(raw)>32768)throw new Error('too_large')}
 try{return JSON.parse(raw)}catch{throw new Error('invalid_json')}
}
export async function merchantDeliveryRoute(req,res,url,pool){
  // PHASE34_CLOUD_CHECKOUT: public read-only delivery choices. Server rechecks at order creation.
  const pub=/^\/v1\/stores\/([a-z0-9][a-z0-9-]{1,62})\/delivery-rules$/.exec(url.pathname)
  if(pub){
    if(req.method!=='GET'){response(res,405,{error:'method_not_allowed'});return true}
    const {rows}=await pool.query('SELECT r.configuration FROM store_delivery_rules r JOIN stores s ON s.id=r.store_id WHERE s.slug=$1 AND s.is_active=true',[pub[1]])
    if(!rows.length||!validRules(rows[0].configuration)){response(res,200,{configured:false,rules:null});return true}
    const x=rows[0].configuration
    response(res,200,{configured:true,rules:{accepting:x.accepting,days:x.days,areas:x.areas.filter(a=>a.enabled).map(a=>({id:a.id,name:a.name,enabled:true})),slots:x.slots.filter(s=>s.enabled).map(s=>({id:s.id,label:s.label,start:s.start,end:s.end,enabled:true}))}});return true
  }

 const m=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/delivery-rules$/.exec(url.pathname)
 if(!m)return false
 if(req.method!=='GET'&&req.method!=='PUT'){response(res,405,{error:'method_not_allowed'});return true}
 const subject=await authenticate(pool,req);if(!subject){response(res,401,{error:'unauthorized'});return true}
 const store=await permittedStore(pool,subject,m[1]);if(!store){response(res,403,{error:'forbidden'});return true}
 if(req.method==='GET'){
  const {rows}=await pool.query('SELECT configuration,updated_at FROM store_delivery_rules WHERE store_id=$1',[store.id]);response(res,200,{configured:!!rows.length,rules:rows[0]?.configuration||null,updatedAt:rows[0]?.updated_at||null});return true
 }
 if(!['owner','manager'].includes(store.role)){response(res,403,{error:'insufficient_role'});return true}
 let rules;try{rules=await bodyJson(req)}catch(e){response(res,e.message==='too_large'?413:400,{error:e.message});return true}
 if(!validRules(rules)){response(res,400,{error:'invalid_delivery_rules'});return true}
 await pool.query(`INSERT INTO store_delivery_rules(store_id,configuration) VALUES($1,$2::jsonb)
 ON CONFLICT(store_id) DO UPDATE SET configuration=excluded.configuration,updated_at=now()`,[store.id,JSON.stringify(rules)])
 response(res,200,{ok:true});return true
}
function distanceMeters(lat1,lon1,lat2,lon2){const rad=Math.PI/180,dlat=(lat2-lat1)*rad,dlon=(lon2-lon1)*rad;const a=Math.sin(dlat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
const isoDay=/^\d{4}-\d{2}-\d{2}$/
export async function verifyDelivery(client,storeId,address,slot){
 const {rows}=await client.query('SELECT configuration FROM store_delivery_rules WHERE store_id=$1 FOR SHARE',[storeId])
 if(!rows.length||!validRules(rows[0].configuration))return {error:'delivery_not_configured'}
 const rules=rows[0].configuration
 if(!rules.accepting)return {error:'orders_paused'}
 const now=new Date();const localNow=new Date(now.getTime()+8*3600000);const day=localNow.getUTCDay();const time=localNow.toISOString().slice(11,16)
 const business=rules.days[day]
 if(!business.enabled||time<business.start||time>=business.end)return {error:'store_closed'}
 const area=rules.areas.find(a=>a.enabled&&a.id===address.areaId)
 if(!area)return {error:'outside_delivery_area'}
 if(area.latitude!==null){if(!coord(address.latitude,-90,90)||!coord(address.longitude,-180,180)||distanceMeters(area.latitude,area.longitude,address.latitude,address.longitude)>area.radiusMeters)return {error:'outside_delivery_area'}}
 if(typeof slot.date!=='string'||!isoDay.test(slot.date))return {error:'invalid_delivery_date'}
 const startDay=Date.UTC(Number(slot.date.slice(0,4)),Number(slot.date.slice(5,7))-1,Number(slot.date.slice(8,10)))
 if(!Number.isFinite(startDay)||new Date(startDay).toISOString().slice(0,10)!==slot.date)return {error:'invalid_delivery_date'}
 const today=Date.UTC(localNow.getUTCFullYear(),localNow.getUTCMonth(),localNow.getUTCDate())
 if(startDay<today||startDay>today+7*86400000)return {error:'delivery_date_unavailable'}
 const weekday=new Date(startDay).getUTCDay()
 if(!rules.days[weekday].enabled)return {error:'delivery_date_unavailable'}
 const chosen=rules.slots.find(s=>s.enabled&&s.id===slot.id)
 if(!chosen||chosen.start<rules.days[weekday].start||chosen.end>rules.days[weekday].end||startDay===today&&chosen.end<=time)return {error:'delivery_slot_unavailable'}
 return {snapshot:{id:chosen.id,label:chosen.label,start:chosen.start,end:chosen.end,date:slot.date},area}
}
