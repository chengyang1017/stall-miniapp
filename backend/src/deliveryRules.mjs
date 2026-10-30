import { authenticate, permittedStore } from './auth.mjs'
import { verifyProductImage } from './imageLifecycle.mjs'
const styles=['classic','mountain','bag','playful','premium','custom']
const jsonHeader = { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }
const response=(res,code,data)=>{res.writeHead(code,jsonHeader);res.end(JSON.stringify(data))}
const hhmm=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x)
const safeText=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.length<=max
const coord=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max
function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s&&s>='2000-01-01'&&s<='2100-12-31'}
const weekdays=s=>s.weekdays===undefined?[0,1,2,3,4,5,6]:s.weekdays
export function validRules(c){
 if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.accepting!=='boolean'||!Array.isArray(c.days)||c.days.length!==7||!Array.isArray(c.areas)||c.areas.length>30||!Array.isArray(c.slots)||c.slots.length>30) return false
 if(c.notice!==undefined&&(typeof c.notice!=='string'||c.notice.length>200))return false
 if(c.noteTags!==undefined&&(!Array.isArray(c.noteTags)||c.noteTags.length>30||!c.noteTags.every(t=>typeof t==='string'&&t.trim()===t&&t.length>0&&t.length<=20&&!/[\u0000-\u001f\u007f]/.test(t))||new Set(c.noteTags).size!==c.noteTags.length))return false
 if(c.placeholderStyle!==undefined&&!styles.includes(c.placeholderStyle))return false
 if(c.placeholderImageKey!==undefined&&c.placeholderImageKey!==null&&(typeof c.placeholderImageKey!=='string'||!/^stores\/[0-9a-f-]{36}\/products\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(c.placeholderImageKey)))return false
 if(c.placeholderStyle==='custom'&&!c.placeholderImageKey)return false
 if(c.minimumOrderCents!==undefined&&(!Number.isSafeInteger(c.minimumOrderCents)||c.minimumOrderCents<0||c.minimumOrderCents>99999900))return false
 if(!c.days.every(d=>d&&typeof d.enabled==='boolean'&&hhmm(d.start)&&hhmm(d.end)&&d.start<d.end))return false
 if(!c.areas.every(a=>a&&safeText(a.id,60)&&safeText(a.name,120)&&typeof a.enabled==='boolean'&&((a.latitude===null&&a.longitude===null&&a.radiusMeters===null)||(coord(a.latitude,-90,90)&&coord(a.longitude,-180,180)&&Number.isInteger(a.radiusMeters)&&a.radiusMeters>=100&&a.radiusMeters<=100000))))return false
 if(!c.slots.every(s=>s&&safeText(s.id,60)&&safeText(s.label,120)&&typeof s.enabled==='boolean'&&hhmm(s.start)&&hhmm(s.end)&&s.start<s.end))return false
 if(c.deliveryPaused!==undefined&&typeof c.deliveryPaused!=='boolean')return false
 if(c.specialDates!==undefined&&(!Array.isArray(c.specialDates)||c.specialDates.length>366||!c.specialDates.every(d=>d&&validDate(d.date)&&typeof d.paused==='boolean')||new Set(c.specialDates.map(d=>d.date)).size!==c.specialDates.length))return false
 const areaIds=new Set(c.areas.map(a=>a.id))
 if(!c.slots.every(s=>Array.isArray(weekdays(s))&&weekdays(s).length>0&&weekdays(s).length<=7&&weekdays(s).every(d=>Number.isInteger(d)&&d>=0&&d<=6)&&new Set(weekdays(s)).size===weekdays(s).length&&
   (s.areaIds===undefined||Array.isArray(s.areaIds)&&s.areaIds.length<=30&&(!s.enabled||s.areaIds.length>0)&&new Set(s.areaIds).size===s.areaIds.length&&s.areaIds.every(id=>areaIds.has(id)))))return false
 return new Set(c.areas.map(a=>a.id)).size===c.areas.length&&new Set(c.slots.map(s=>s.id)).size===c.slots.length
}
function deliveryConflict(c){
 if(new Set(c.areas.map(a=>a.name.trim().toLowerCase())).size!==c.areas.length)return 'duplicate_area_name'
 for(let i=0;i<c.slots.length;i++)for(let j=i+1;j<c.slots.length;j++){
   const a=c.slots[i],b=c.slots[j]
   if(a.enabled&&b.enabled&&a.start<b.end&&b.start<a.end&&weekdays(a).some(d=>weekdays(b).includes(d))&&
     c.areas.some(area=>area.enabled&&(!a.areaIds||a.areaIds.includes(area.id))&&(!b.areaIds||b.areaIds.includes(area.id))))return 'overlapping_delivery_slots'
 }
 return null
}
export function businessView(rules,now=new Date(),storeName='') {
 const local=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now)
 const value=type=>local.find(p=>p.type===type)?.value
 const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(value('weekday'))
 const clock=value('hour')+':'+value('minute'), d=rules?.days?.[day]
 const configured=!!rules&&validRules(rules),deliveryReady=configured&&rules.areas.some(a=>a.enabled&&rules.slots.some(s=>s.enabled&&(!s.areaIds||s.areaIds.includes(a.id)))),open=configured&&rules.accepting&&!rules.deliveryPaused&&deliveryReady&&d?.enabled&&clock>=d.start&&clock<d.end
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
 const part=type=>today.find(p=>p.type===type)?.value, date=part('year')+'-'+part('month')+'-'+part('day')
 const todayDeliveryPaused=configured&&(rules.specialDates||[]).some(x=>x.date===date&&x.paused)
 const imageKey=configured?rules.placeholderImageKey||null:null,base=(process.env.IMAGE_PUBLIC_BASE_URL||'').replace(/\/+$/,'')
 return {storeName,configured,noteTags:configured?rules.noteTags||[]:[],placeholderStyle:configured?rules.placeholderStyle||'premium':'premium',placeholderImageKey:imageKey,customPlaceholderUrl:imageKey&&/^https:\/\/[^/]+/.test(base)?base+'/'+imageKey.split('/').map(encodeURIComponent).join('/'):null,
   accepting:configured?rules.accepting:false,days:configured?rules.days:[],notice:configured?(rules.notice||''):'',minimumOrderCents:configured?(rules.minimumOrderCents||0):0,
   deliveryPaused:configured?!!rules.deliveryPaused:false,todayDeliveryPaused:!!todayDeliveryPaused,
   open:!!open,label:!configured?'营业信息未配置':!rules.accepting?'暂停接单':rules.deliveryPaused?'暂停全部配送':!deliveryReady?'配送未配置':open?(todayDeliveryPaused?'营业中 · 今日暂停配送，请核对其他日期':'营业中'):'休息中',timeZone:'Asia/Shanghai'}
}
export async function businessSettingsRoute(req,res,url,pool) {
 const pub=/^\/v1\/stores\/([a-z0-9][a-z0-9-]{1,62})\/business-settings$/.exec(url.pathname)
 const merchant=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/business-settings$/.exec(url.pathname)
 if(!pub&&!merchant)return false
 if(pub) {
   if(req.method!=='GET'){response(res,405,{error:'method_not_allowed'});return true}
   const {rows}=await pool.query("SELECT s.name,r.configuration,statement_timestamp() AS now FROM stores s LEFT JOIN store_delivery_rules r ON r.store_id=s.id WHERE s.slug=$1 AND s.is_active=true",[pub[1]])
   if(!rows.length){response(res,404,{error:'store_unavailable'});return true}
   response(res,200,businessView(rows[0].configuration,rows[0].now,rows[0].name));return true
 }
 if(!['GET','PATCH'].includes(req.method)){response(res,405,{error:'method_not_allowed'});return true}
 const who=await authenticate(pool,req);if(!who){response(res,401,{error:'unauthorized'});return true}
 const store=await permittedStore(pool,who,merchant[1]);if(!store||!['owner','manager'].includes(store.role)){response(res,403,{error:'forbidden'});return true}
 if(req.method==='GET') {
   const {rows}=await pool.query('SELECT configuration,md5(configuration::text) AS revision,statement_timestamp() AS now FROM store_delivery_rules WHERE store_id=$1',[store.id])
   if(rows.length&&!validRules(rows[0].configuration)){response(res,503,{error:'invalid_existing_business_settings'});return true}
   const defaults={accepting:false,notice:'',minimumOrderCents:0,days:Array.from({length:7},()=>({enabled:true,start:'09:00',end:'21:00'})),areas:[],slots:[]}
   response(res,200,{...businessView(rows[0]?.configuration,rows[0]?.now,store.name),days:rows[0]?.configuration.days||defaults.days,revision:rows[0]?.revision||null});return true
 }
 let body;try{body=await bodyJson(req)}catch(e){response(res,400,{error:e.message});return true}
 const keys=body&&typeof body==='object'&&!Array.isArray(body)?Object.keys(body):[]
 if(!keys.includes('expectedRevision')||keys.length<2||keys.some(k=>!['expectedRevision','accepting','days','notice','minimumOrderCents','noteTags','placeholderStyle','placeholderImageKey'].includes(k))||!(body.expectedRevision===null||typeof body.expectedRevision==='string'&&/^[a-f0-9]{32}$/.test(body.expectedRevision))){response(res,400,{error:'invalid_business_patch'});return true}
 if(Object.hasOwn(body,'placeholderImageKey')&&body.placeholderImageKey!==null&&!await verifyProductImage(pool,store.id,body.placeholderImageKey)){response(res,400,{error:'invalid_placeholder_image'});return true}
 const client=await pool.connect()
 try {
   await client.query('BEGIN')
   // Serialize initial creation as well as concurrent partial updates to this one existing business row.
   await client.query('SELECT id FROM stores WHERE id=$1 FOR NO KEY UPDATE',[store.id])
   const {rows}=await client.query('SELECT configuration,md5(configuration::text) AS revision FROM store_delivery_rules WHERE store_id=$1 FOR UPDATE',[store.id])
   if((rows[0]?.revision||null)!==body.expectedRevision){await client.query('ROLLBACK');response(res,409,{error:'business_settings_changed_refresh'});return true}
   const configuration={...(rows[0]?.configuration||{accepting:false,days:Array.from({length:7},()=>({enabled:true,start:'09:00',end:'21:00'})),areas:[],slots:[]}),...Object.fromEntries(keys.filter(k=>k!=='expectedRevision').map(k=>[k,body[k]]))}
   if(!validRules(configuration)){await client.query('ROLLBACK');response(res,400,{error:'invalid_business_settings'});return true}
   if(configuration.placeholderStyle==='custom'&&!/^https:\/\/[^/]+/.test(process.env.IMAGE_PUBLIC_BASE_URL||'')){await client.query('ROLLBACK');response(res,503,{error:'placeholder_public_image_base_required'});return true}
   if(configuration.placeholderStyle==='custom'&&!Object.hasOwn(body,'placeholderImageKey')&&!await verifyProductImage(client,store.id,configuration.placeholderImageKey)){await client.query('ROLLBACK');response(res,409,{error:'placeholder_image_unavailable'});return true}
   const saved=await client.query(`INSERT INTO store_delivery_rules(store_id,configuration) VALUES($1,$2::jsonb)
     ON CONFLICT(store_id) DO UPDATE SET configuration=excluded.configuration,updated_at=now() RETURNING md5(configuration::text) AS revision`,[store.id,JSON.stringify(configuration)])
   await client.query('COMMIT');response(res,200,{ok:true,revision:saved.rows[0].revision})
 }catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23514')response(res,409,{error:'image_or_configuration_changed_refresh'});else throw e}finally{client.release()}
 return true
}
async function bodyJson(req){
 let raw='';for await(const b of req){raw+=b.toString('utf8');if(Buffer.byteLength(raw)>131072)throw new Error('too_large')}
 try{return JSON.parse(raw)}catch{throw new Error('invalid_json')}
}
export async function merchantDeliveryRoute(req,res,url,pool){
 const pub=/^\/v1\/stores\/([a-z0-9][a-z0-9-]{1,62})\/delivery-rules$/.exec(url.pathname)
 if(pub){
  if(req.method!=='GET'){response(res,405,{error:'method_not_allowed'});return true}
  const {rows}=await pool.query('SELECT s.name,r.configuration,statement_timestamp() AS now FROM stores s LEFT JOIN store_delivery_rules r ON r.store_id=s.id WHERE s.slug=$1 AND s.is_active=true',[pub[1]])
  if(!rows.length){response(res,404,{error:'store_unavailable'});return true}
  const x=rows[0].configuration
  if(!x||!validRules(x)){response(res,200,{configured:false,rules:null});return true}
  response(res,200,{configured:true,rules:{accepting:x.accepting,days:x.days,notice:x.notice||'',minimumOrderCents:x.minimumOrderCents||0,
   business:businessView(x,rows[0].now),deliveryPaused:!!x.deliveryPaused,specialDates:x.specialDates||[],serverNow:rows[0].now,
   areas:x.areas.map(a=>({id:a.id,name:a.name,enabled:a.enabled,requiresLocation:a.latitude!==null})),
   slots:x.slots.filter(s=>s.enabled).map(s=>({id:s.id,label:s.label,start:s.start,end:s.end,enabled:true,weekdays:weekdays(s),...(s.areaIds?{areaIds:s.areaIds}:{})}))}});return true
 }
 const m=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/delivery-rules$/.exec(url.pathname)
 if(!m)return false
 if(!['GET','PUT'].includes(req.method)){response(res,405,{error:'method_not_allowed'});return true}
 const subject=await authenticate(pool,req);if(!subject){response(res,401,{error:'unauthorized'});return true}
 const store=await permittedStore(pool,subject,m[1]);if(!store||!['owner','manager'].includes(store.role)){response(res,403,{error:'insufficient_role'});return true}
 if(req.method==='GET'){
  const {rows}=await pool.query('SELECT configuration,updated_at,md5(configuration::text) AS revision FROM store_delivery_rules WHERE store_id=$1',[store.id])
  if(rows.length&&!validRules(rows[0].configuration)){response(res,503,{error:'invalid_existing_delivery_rules'});return true}
  response(res,200,{configured:!!rows.length,rules:rows[0]?.configuration||null,updatedAt:rows[0]?.updated_at||null,revision:rows[0]?.revision||null});return true
 }
 let body;try{body=await bodyJson(req)}catch(e){response(res,e.message==='too_large'?413:400,{error:e.message});return true}
 const keys=body&&typeof body==='object'&&!Array.isArray(body)?Object.keys(body):[]
 if(keys.length<2||!keys.includes('expectedRevision')||keys.some(k=>!['expectedRevision','areas','slots','specialDates','deliveryPaused'].includes(k))||
   !(body.expectedRevision===null||typeof body.expectedRevision==='string'&&/^[a-f0-9]{32}$/.test(body.expectedRevision))){response(res,400,{error:'delivery_only_patch_and_revision_required'});return true}
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  await client.query('SELECT id FROM stores WHERE id=$1 FOR NO KEY UPDATE',[store.id])
  const {rows}=await client.query('SELECT configuration,md5(configuration::text) AS revision FROM store_delivery_rules WHERE store_id=$1 FOR UPDATE',[store.id])
  if((rows[0]?.revision||null)!==body.expectedRevision){await client.query('ROLLBACK');response(res,409,{error:'delivery_rules_changed_refresh'});return true}
  const old=rows[0]?.configuration||{accepting:false,notice:'',minimumOrderCents:0,days:Array.from({length:7},()=>({enabled:true,start:'09:00',end:'21:00'})),areas:[],slots:[]}
  const rules={...old,...Object.fromEntries(keys.filter(k=>k!=='expectedRevision').map(k=>[k,body[k]]))}
  const conflict=validRules(rules)?deliveryConflict(rules):'invalid_delivery_rules'
  if(conflict){await client.query('ROLLBACK');response(res,400,{error:conflict});return true}
  const saved=await client.query(`INSERT INTO store_delivery_rules(store_id,configuration) VALUES($1,$2::jsonb)
   ON CONFLICT(store_id) DO UPDATE SET configuration=excluded.configuration,updated_at=now() RETURNING md5(configuration::text) AS revision`,[store.id,JSON.stringify(rules)])
  await client.query('COMMIT');response(res,200,{ok:true,revision:saved.rows[0].revision})
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
 return true
}

function distanceMeters(lat1,lon1,lat2,lon2){const rad=Math.PI/180,dlat=(lat2-lat1)*rad,dlon=(lon2-lon1)*rad;const a=Math.sin(dlat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
const isoDay=/^\d{4}-\d{2}-\d{2}$/
export async function verifyDelivery(client,storeId,address,slot){
 const {rows}=await client.query('SELECT configuration FROM store_delivery_rules WHERE store_id=$1 FOR SHARE',[storeId])
 if(!rows.length||!validRules(rows[0].configuration))return {error:'delivery_not_configured'}
 const rules=rows[0].configuration
 if(!rules.areas.length||!rules.slots.length)return {error:'delivery_not_configured'}
 if(!rules.accepting)return {error:'orders_paused'}
 if(rules.deliveryPaused)return {error:'delivery_paused'}
 const clock=await client.query('SELECT clock_timestamp() AS now')
 const now=clock.rows[0].now;const localNow=new Date(now.getTime()+8*3600000);const day=localNow.getUTCDay();const time=localNow.toISOString().slice(11,16)
 // Orders may be placed outside business/delivery hours; the chosen future slot still has to be valid.
 const area=rules.areas.find(a=>a.enabled&&a.id===address.areaId)
 if(!area)return {error:'outside_delivery_area'}
 if(area.latitude!==null){if(!coord(address.latitude,-90,90)||!coord(address.longitude,-180,180)||distanceMeters(area.latitude,area.longitude,address.latitude,address.longitude)>area.radiusMeters)return {error:'outside_delivery_area'}}
 if(typeof slot.date!=='string'||!isoDay.test(slot.date))return {error:'invalid_delivery_date'}
 const startDay=Date.UTC(Number(slot.date.slice(0,4)),Number(slot.date.slice(5,7))-1,Number(slot.date.slice(8,10)))
 if(!Number.isFinite(startDay)||new Date(startDay).toISOString().slice(0,10)!==slot.date)return {error:'invalid_delivery_date'}
 const today=Date.UTC(localNow.getUTCFullYear(),localNow.getUTCMonth(),localNow.getUTCDate())
 if(startDay<today||startDay>today+7*86400000)return {error:'delivery_date_unavailable'}
 if((rules.specialDates||[]).some(d=>d.date===slot.date&&d.paused))return {error:'delivery_date_paused'}
 const weekday=new Date(startDay).getUTCDay()
 if(!rules.days[weekday].enabled)return {error:'delivery_date_unavailable'}
 const chosen=rules.slots.find(s=>s.enabled&&s.id===slot.id)
 if(!chosen||!weekdays(chosen).includes(weekday)||chosen.areaIds&&!chosen.areaIds.includes(area.id)||chosen.start<rules.days[weekday].start||chosen.end>rules.days[weekday].end||startDay===today&&chosen.end<=time)return {error:'delivery_slot_unavailable'}
 return {snapshot:{id:chosen.id,label:chosen.label,start:chosen.start,end:chosen.end,date:slot.date,areaId:area.id,areaName:area.name},area,minimumOrderCents:rules.minimumOrderCents||0}
}
