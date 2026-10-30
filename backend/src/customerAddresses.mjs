import { authenticate } from './auth.mjs'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const fail=(code,status=400)=>{throw Object.assign(Error(code),{status})}
const reply=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
const fields=`id,receiver_name AS "receiverName",phone,area_id AS "deliveryAreaId",area_name AS area,detail,is_default AS "isDefault",latitude,longitude,location_name AS "locationName",map_address AS "mapAddress",version`
async function read(req){let n=0,parts=[];for await(const c of req){n+=c.length;if(n>4096)fail('too_large',413);parts.push(c)}try{const v=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v}catch{fail('invalid_json')}}
export async function customerAddressRoute(req,res,url,pool,verifiedCustomerSubject=null){
 const m=/^\/v1\/stores\/([a-z0-9][a-z0-9-]{1,62})\/addresses(?:\/([0-9a-f-]{36}))?$/.exec(url.pathname)
 if(!m)return false
 let db
 try{
  const subject=verifiedCustomerSubject===null?await authenticate(pool,req):verifiedCustomerSubject;if(!subject)fail('login_required',401)
  if(url.search||m[2]&&!uuid.test(m[2]))fail('invalid_address_query')
  const store=(await pool.query('SELECT id FROM stores WHERE slug=$1',[m[1]])).rows[0];if(!store)fail('store_not_found',404)
  if(req.method==='GET'&&!m[2]){const rows=(await pool.query(`SELECT ${fields} FROM customer_addresses WHERE store_id=$1 AND customer_subject=$2 AND deleted_at IS NULL ORDER BY is_default DESC,created_at,id LIMIT 51`,[store.id,subject])).rows;if(rows.length>50)fail('address_limit',413);reply(res,200,{addresses:rows});return true}
  if(!['POST','PATCH','DELETE'].includes(req.method)||req.method==='POST'&&m[2]||req.method!=='POST'&&!m[2])fail('method_not_allowed',405)
  const b=await read(req),keys=Object.keys(b),full=req.method==='POST'||keys.some(k=>!['isDefault','expectedVersion'].includes(k))&&req.method==='PATCH'
  if(keys.some(k=>!['receiverName','phone','deliveryAreaId','detail','latitude','longitude','locationName','mapAddress','isDefault','clientKey','expectedVersion'].includes(k)))fail('invalid_address_fields')
  if(req.method==='POST'&&(typeof b.clientKey!=='string'||!uuid.test(b.clientKey)))fail('client_key_required')
  if(req.method!=='POST'&&(!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<1))fail('version_required')
  if(req.method==='DELETE'&&keys.some(k=>k!=='expectedVersion'))fail('invalid_delete')
  if(!full&&req.method==='PATCH'&&(b.isDefault!==true||keys.length!==2))fail('invalid_default')
  const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)
  if(full&&(!text(b.receiverName,100)||typeof b.phone!=='string'||!/^1[3-9]\d{9}$/.test(b.phone)||!text(b.deliveryAreaId,60)||!text(b.detail,300)||b.locationName!==undefined&&typeof b.locationName!=='string'||(b.locationName||'').length>200||b.mapAddress!==undefined&&typeof b.mapAddress!=='string'||(b.mapAddress||'').length>300))fail('invalid_address')
  if(full&&['locationName','mapAddress'].some(k=>typeof b[k]==='string'&&/[\u0000-\u001f\u007f]/.test(b[k])))fail('invalid_address')
  const lat=b.latitude??null,lon=b.longitude??null
  if(full&&!(lat===null&&lon===null||typeof lat==='number'&&Number.isFinite(lat)&&lat>=-90&&lat<=90&&typeof lon==='number'&&Number.isFinite(lon)&&lon>=-180&&lon<=180))fail('invalid_coordinates')
  if(b.isDefault!==undefined&&typeof b.isDefault!=='boolean')fail('invalid_default')
  const payload=full?{receiverName:b.receiverName.trim(),phone:b.phone,deliveryAreaId:b.deliveryAreaId,detail:b.detail.trim(),latitude:lat,longitude:lon,locationName:b.locationName||'',mapAddress:b.mapAddress||'',isDefault:b.isDefault===true}:null
  db=await pool.connect();await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'")
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['addresses:'+store.id+':'+subject])
  if(req.method==='POST'){
   const old=(await db.query('SELECT id,deleted_at,create_payload=$4::jsonb AS same FROM customer_addresses WHERE store_id=$1 AND customer_subject=$2 AND client_key=$3',[store.id,subject,b.clientKey,JSON.stringify(payload)])).rows[0]
   if(old){if(!old.same||old.deleted_at)fail('address_create_conflict',409);await db.query('COMMIT');reply(res,200,{ok:true,id:old.id,reused:true});return true}
   if((await db.query('SELECT count(*)::int AS n FROM customer_addresses WHERE store_id=$1 AND customer_subject=$2 AND deleted_at IS NULL',[store.id,subject])).rows[0].n>=50)fail('address_limit',413)
  }
  let current=null
  if(m[2]){current=(await db.query('SELECT * FROM customer_addresses WHERE store_id=$1 AND customer_subject=$2 AND id=$3 FOR UPDATE',[store.id,subject,m[2]])).rows[0];if(!current)fail('address_not_found',404)
   if(current.deleted_at){if(req.method==='DELETE'){await db.query('COMMIT');reply(res,200,{ok:true,reused:true});return true}fail('address_not_found',404)}
   if(current.version!==b.expectedVersion)fail('address_changed_refresh',409)
  }
  if(req.method==='DELETE'){
   await db.query('UPDATE customer_addresses SET deleted_at=clock_timestamp(),is_default=false,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[m[2]])
   if(current.is_default)await db.query('UPDATE customer_addresses SET is_default=true,version=version+1,updated_at=clock_timestamp() WHERE id=(SELECT id FROM customer_addresses WHERE store_id=$1 AND customer_subject=$2 AND deleted_at IS NULL ORDER BY created_at,id LIMIT 1)',[store.id,subject])
  }else{
   let areaName=current?.area_name
   if(full){const c=(await db.query('SELECT configuration FROM store_delivery_rules WHERE store_id=$1 FOR SHARE',[store.id])).rows[0]?.configuration,area=c?.areas?.find(a=>a.id===b.deliveryAreaId)
    if(!area&&(!current||current.area_id!==b.deliveryAreaId))fail('address_area_not_configured',409)
    areaName=area?.name||current.area_name
   }
   const anyDefault=(await db.query('SELECT id FROM customer_addresses WHERE store_id=$1 AND customer_subject=$2 AND deleted_at IS NULL AND is_default',[store.id,subject])).rows.length
   const makeDefault=b.isDefault===true||!anyDefault||!!current?.is_default
   if(makeDefault)await db.query('UPDATE customer_addresses SET is_default=false,version=version+1,updated_at=clock_timestamp() WHERE store_id=$1 AND customer_subject=$2 AND is_default AND deleted_at IS NULL AND id IS DISTINCT FROM $3::uuid',[store.id,subject,m[2]||null])
   if(req.method==='POST')await db.query(`INSERT INTO customer_addresses(store_id,customer_subject,receiver_name,phone,area_id,area_name,detail,latitude,longitude,location_name,map_address,is_default,client_key,create_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,[store.id,subject,payload.receiverName,payload.phone,payload.deliveryAreaId,areaName,payload.detail,lat,lon,payload.locationName,payload.mapAddress,makeDefault,b.clientKey,JSON.stringify(payload)])
   else if(full)await db.query('UPDATE customer_addresses SET receiver_name=$4,phone=$5,area_id=$6,area_name=$7,detail=$8,latitude=$9,longitude=$10,location_name=$11,map_address=$12,is_default=$13,version=version+1,updated_at=clock_timestamp() WHERE store_id=$1 AND customer_subject=$2 AND id=$3',[store.id,subject,m[2],payload.receiverName,payload.phone,payload.deliveryAreaId,areaName,payload.detail,lat,lon,payload.locationName,payload.mapAddress,makeDefault])
   else await db.query('UPDATE customer_addresses SET is_default=true,version=version+1,updated_at=clock_timestamp() WHERE store_id=$1 AND customer_subject=$2 AND id=$3',[store.id,subject,m[2]])
  }
  await db.query('COMMIT');reply(res,200,{ok:true});return true
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});reply(res,e.status||503,{error:e.status?e.message:'address_service_unavailable'})}finally{db?.release()}
 return true
}
