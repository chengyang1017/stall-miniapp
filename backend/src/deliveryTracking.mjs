import { createHash } from 'node:crypto'
import { authenticate,permittedStore } from './auth.mjs'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hash=s=>createHash('sha256').update(s).digest('hex')
const fail=(status,message)=>{throw Object.assign(Error(message),{status})}
function reply(res,status,value){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value))}
async function body(req){
 if(Number(req.headers['content-length']||0)>2048)fail(413,'too_large')
 let raw='';for await(const part of req){raw+=part.toString('utf8');if(Buffer.byteLength(raw)>2048)fail(413,'too_large')}
 let b;try{b=JSON.parse(raw)}catch{fail(400,'invalid_json')}
 if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'invalid_body');return b
}
async function members(db,storeId){return (await db.query('SELECT mm.external_subject,mm.role FROM stores s JOIN merchant_members mm ON mm.merchant_id=s.merchant_id WHERE s.id=$1 ORDER BY mm.external_subject LIMIT 201',[storeId])).rows}
function sessionView(s,order,task,subject,manager){
 const now=Number(order.server_ms),allowed=order.fulfillment_status==='delivering'&&task&&s&&task.courier_subject===s.courier_subject&&s.state!=='ended'&&now-new Date(s.started_at).getTime()<8*3600000
 const age=s?.last_location_at?now-new Date(s.last_location_at).getTime():Infinity
 const visible=allowed&&s.state==='active'&&age>=0&&age<=120000&&s.latitude!==null
 const state=!allowed?(s?'ended':'unavailable'):s.state==='paused'?'paused':visible?'active':'stale'
 return {state,sessionId:s?.id||null,orderStatus:order.fulfillment_status,estimatedArrival:order.estimated_arrival||'',lastLocationAt:s?.last_location_at||null,serverTime:new Date(now).toISOString(),expiresInSeconds:visible?Math.max(0,Math.floor((120000-age)/1000)):0,
  location:visible?{latitude:s.latitude,longitude:s.longitude,accuracy:s.accuracy,coordinateSystem:'gcj02',sampledAt:s.sampled_at,receivedAt:s.last_location_at,seq:Number(s.seq)}:null,
  ...(subject?{canAssign:manager,canControl:task?.courier_subject===subject,assignmentVersion:task?.version||0,courierId:task?hash(order.store_id+':'+task.courier_subject):null,lastSeq:Number(s?.seq||0)}:{})}
}
export async function deliveryTrackingRoute(req,res,url,pool){
 const roster=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/tracking\/couriers$/.exec(url.pathname)
 const m=/^\/v1\/(merchant\/)?stores\/([a-z0-9][a-z0-9-]{1,62})\/orders\/([0-9a-f-]{36})\/tracking(?:\/(assign|start|location|pause|resume|stop))?$/.exec(url.pathname)
 if(!roster&&!m)return false
 let db
 try{
  const subject=await authenticate(pool,req);if(!subject)fail(401,'login_required')
  const merchant=!!(roster||m[1]),slug=roster?.[1]||m[2],action=m?.[4]||''
  if(url.search)fail(400,'unexpected_query')
  if(roster){
   if(req.method!=='GET')fail(405,'method_not_allowed')
   const store=await permittedStore(pool,subject,slug);if(!store)fail(403,'forbidden')
   const rows=['owner','manager'].includes(store.role)?await members(pool,store.id):[{external_subject:subject,role:store.role}];if(rows.length>200)fail(413,'courier_limit')
   reply(res,200,{couriers:rows.map(r=>({id:hash(store.id+':'+r.external_subject),label:({owner:'店主',manager:'管理员',staff:'员工'}[r.role]||'成员')+' · '+hash(store.id+':'+r.external_subject).slice(-8),self:r.external_subject===subject}))});return true
  }
  if(!uuid.test(m[3]))fail(400,'invalid_order')
  if(req.method!==(action?'POST':'GET')||!merchant&&action)fail(405,'method_not_allowed')
  const store=merchant?await permittedStore(pool,subject,slug):null
  if(merchant&&!store)fail(403,'forbidden')
  const manager=!!store&&['owner','manager'].includes(store.role)
  const b=action?await body(req):{}
  const keys=action==='assign'?['courierId','expectedVersion']:action==='start'?['controlKey']:action==='location'?['sessionId','controlKey','seq','latitude','longitude','accuracy','coordinateSystem','sampledAt']:['sessionId','controlKey']
  if(Object.keys(b).some(k=>!keys.includes(k)))fail(400,'invalid_fields')
  db=await pool.connect();await db.query('BEGIN')
  // All state writes lock the order first, matching fulfillment/termination.
  const o=(await db.query(`SELECT o.id,o.store_id,o.fulfillment_status,o.estimated_arrival,jsonb_build_object('latitude',o.contact_snapshot->'latitude','longitude',o.contact_snapshot->'longitude') AS contact_snapshot,extract(epoch FROM clock_timestamp())*1000 AS server_ms FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.slug=$1 AND o.id=$2 ${merchant?'':'AND o.customer_subject=$3'} FOR UPDATE OF o`,merchant?[slug,m[3]]:[slug,m[3],subject])).rows[0]
  if(!o)fail(404,'order_not_found')
  let task=(await db.query('SELECT * FROM delivery_tracking_tasks WHERE order_id=$1',[o.id])).rows[0]
  let s=(await db.query('SELECT * FROM delivery_tracking_sessions WHERE order_id=$1 ORDER BY started_at DESC,id DESC LIMIT 1 FOR UPDATE',[o.id])).rows[0]
  if(merchant&&!manager&&task?.courier_subject!==subject)fail(403,'not_assigned')
  const currentMember=task&&(await db.query('SELECT 1 FROM stores s JOIN merchant_members mm ON mm.merchant_id=s.merchant_id WHERE s.id=$1 AND mm.external_subject=$2',[o.store_id,task.courier_subject])).rows.length>0
  if(!action){
   let result=sessionView(s,o,currentMember?task:null,merchant?subject:null,manager)
   // Dispatcher may administer assignments but does not receive courier coordinates.
   if(merchant&&task?.courier_subject!==subject)result.location=null
   const a=o.contact_snapshot
   // The existing address map picker stores GCJ-02; only this order snapshot is used.
   const destination=a&&typeof a.latitude==='number'&&typeof a.longitude==='number'&&Math.abs(a.latitude)<=90&&Math.abs(a.longitude)<=180&&!(a.latitude===0&&a.longitude===0)?{latitude:a.latitude,longitude:a.longitude,coordinateSystem:'gcj02'}:null
   if(!merchant)result={...result,destination}
   await db.query('COMMIT');reply(res,200,result);return true
  }
  if(o.fulfillment_status!=='delivering')fail(409,'not_delivering')
  if(action==='assign'){
   if(!manager)fail(403,'dispatch_forbidden')
   if(!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion!==(task?.version||0)||typeof b.courierId!=='string')fail(409,'assignment_changed')
   const courier=(await members(db,o.store_id)).find(r=>hash(o.store_id+':'+r.external_subject)===b.courierId);if(!courier)fail(400,'invalid_courier')
   if(task?.courier_subject===courier.external_subject){await db.query('COMMIT');reply(res,200,{ok:true,assignmentVersion:task.version,reused:true});return true}
   if(task&&Number(o.server_ms)-new Date(task.assigned_at).getTime()<2000)fail(429,'assignment_rate_limit')
   await db.query("UPDATE delivery_tracking_sessions SET state='ended',ended_at=clock_timestamp(),latitude=NULL,longitude=NULL,accuracy=NULL,sampled_at=NULL WHERE order_id=$1 AND state<>'ended'",[o.id])
   task=(await db.query(`INSERT INTO delivery_tracking_tasks(order_id,store_id,courier_subject,assigned_by) VALUES($1,$2,$3,$4) ON CONFLICT(order_id) DO UPDATE SET courier_subject=$3,assigned_by=$4,version=delivery_tracking_tasks.version+1,assigned_at=clock_timestamp() RETURNING *`,[o.id,o.store_id,courier.external_subject,subject])).rows[0]
   await db.query('COMMIT');reply(res,200,{ok:true,assignmentVersion:task.version});return true
  }
  if(!currentMember||task?.courier_subject!==subject)fail(403,'not_assigned')
  if(action==='start'){
   if(typeof b.controlKey!=='string'||!uuid.test(b.controlKey))fail(400,'invalid_control_key')
   if(s&&s.state!=='ended'){
    if(s.control_hash!==hash(b.controlKey)||s.courier_subject!==subject)fail(409,'already_shared_stop_first')
    if(Number(o.server_ms)-new Date(s.started_at).getTime()>=8*3600000)fail(409,'session_expired_stop_first')
   }else{
    if(s&&Number(o.server_ms)-new Date(s.started_at).getTime()<10000)fail(429,'start_rate_limit')
    const recent=await db.query("SELECT count(*)::int AS n FROM delivery_tracking_sessions WHERE courier_subject=$1 AND started_at>clock_timestamp()-interval '1 day'",[subject])
    if(recent.rows[0].n>=200)fail(429,'daily_session_limit')
    s=(await db.query("INSERT INTO delivery_tracking_sessions(order_id,store_id,courier_subject,control_hash,state) VALUES($1,$2,$3,$4,'active') RETURNING *",[o.id,o.store_id,subject,hash(b.controlKey)])).rows[0]
   }
  }else{
   if(!s||s.id!==b.sessionId||s.courier_subject!==subject)fail(409,'session_changed')
   if(action!=='stop'&&(typeof b.controlKey!=='string'||hash(b.controlKey)!==s.control_hash))fail(403,'device_control_required')
   if(action!=='stop'&&(s.state==='ended'||Number(o.server_ms)-new Date(s.started_at).getTime()>=8*3600000))fail(409,'session_ended')
   if(action==='location'){
    const sampled=typeof b.sampledAt==='string'?Date.parse(b.sampledAt):NaN,now=Number(o.server_ms)
    if(s.state!=='active')fail(409,'tracking_paused')
    if(b.coordinateSystem!=='gcj02'||![b.latitude,b.longitude,b.accuracy].every(v=>typeof v==='number'&&Number.isFinite(v))||Math.abs(b.latitude)>90||Math.abs(b.longitude)>180||b.latitude===0&&b.longitude===0||b.accuracy<=0||b.accuracy>200||!Number.isFinite(sampled)||sampled<now-60000||sampled>now+15000||new Date(sampled).toISOString()!==b.sampledAt)fail(400,'invalid_location')
    if(!Number.isSafeInteger(b.seq)||b.seq<=Number(s.seq)||b.seq>2147483647||s.sampled_at&&sampled<=new Date(s.sampled_at).getTime())fail(409,'out_of_order')
    if(s.last_location_at&&now-new Date(s.last_location_at).getTime()<5000)fail(429,'location_rate_limit')
    s=(await db.query('UPDATE delivery_tracking_sessions SET latitude=$2,longitude=$3,accuracy=$4,sampled_at=$5,last_location_at=clock_timestamp(),seq=$6 WHERE id=$1 RETURNING *',[s.id,b.latitude,b.longitude,b.accuracy,new Date(sampled).toISOString(),b.seq])).rows[0]
   }else if(action==='resume')s=(await db.query("UPDATE delivery_tracking_sessions SET state='active',paused_at=NULL WHERE id=$1 RETURNING *",[s.id])).rows[0]
   else if(action==='pause')s=(await db.query("UPDATE delivery_tracking_sessions SET state='paused',paused_at=COALESCE(paused_at,clock_timestamp()),latitude=NULL,longitude=NULL,accuracy=NULL WHERE id=$1 RETURNING *",[s.id])).rows[0]
   else s=(await db.query("UPDATE delivery_tracking_sessions SET state='ended',ended_at=COALESCE(ended_at,clock_timestamp()),latitude=NULL,longitude=NULL,accuracy=NULL,sampled_at=NULL WHERE id=$1 RETURNING *",[s.id])).rows[0]
  }
  // Use a fresh server clock after the write, not the device clock.
  o.server_ms=(await db.query('SELECT extract(epoch FROM clock_timestamp())*1000 AS ms')).rows[0].ms
  await db.query('COMMIT');reply(res,200,sessionView(s,o,task,subject,manager));return true
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});if(e.status||e.code==='23505'){reply(res,e.status||409,{error:e.status?e.message:'courier_has_active_task'});return true}throw e}
 finally{db?.release()}
}

// Server housekeeping only; never stores a coordinate history or exports it.
export function startTrackingRetention(pool){
 let running=false
 const sweep=async()=>{if(running)return;running=true;try{
  await pool.query(`UPDATE delivery_tracking_sessions t SET state='ended',ended_at=clock_timestamp(),latitude=NULL,longitude=NULL,accuracy=NULL,sampled_at=NULL WHERE state<>'ended' AND (started_at<clock_timestamp()-interval '8 hours' OR NOT EXISTS(SELECT 1 FROM orders o JOIN stores s ON s.id=o.store_id JOIN merchant_members mm ON mm.merchant_id=s.merchant_id AND mm.external_subject=t.courier_subject WHERE o.id=t.order_id AND o.fulfillment_status='delivering'))`)
  await pool.query("UPDATE delivery_tracking_sessions SET latitude=NULL,longitude=NULL,accuracy=NULL,sampled_at=NULL WHERE latitude IS NOT NULL AND last_location_at<clock_timestamp()-interval '24 hours'")
  await pool.query("DELETE FROM delivery_tracking_sessions WHERE id IN (SELECT id FROM delivery_tracking_sessions WHERE ended_at<clock_timestamp()-interval '7 days' LIMIT 1000)")
  await pool.query("DELETE FROM delivery_tracking_tasks WHERE order_id IN (SELECT t.order_id FROM delivery_tracking_tasks t JOIN orders o ON o.id=t.order_id WHERE o.fulfillment_status<>'delivering' AND o.updated_at<clock_timestamp()-interval '7 days' LIMIT 1000)")
 }catch{console.error('Tracking retention unavailable')}finally{running=false}}
 const timer=setInterval(sweep,60000);timer.unref();return ()=>clearInterval(timer)
}
