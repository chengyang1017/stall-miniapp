import { authenticate,permittedStore } from './auth.mjs'
import { headImage } from './imageLifecycle.mjs'
import { MAX_ARCHIVE_BYTES,digest,json,makeArchive,catalogCsv,preflightArchive,archiveError,orderSummary } from './merchantArchiveFormat.mjs'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const kinds=['catalog-json','catalog-csv','settings-json','orders-json','archive-json']
const reply=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(json(data))}
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='2000-01-01'&&s<='2100-12-31'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s
async function readBody(req,max){let n=0;const chunks=[];for await(const chunk of req){n+=chunk.length;if(n>max)archiveError('request_too_large',413);chunks.push(chunk)}try{const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v}catch{archiveError('invalid_json')}}
const columns=`id,kind,status,filename,bytes,sha256,failure_code AS "failureCode",created_at AS "createdAt",completed_at AS "completedAt",expires_at AS "expiresAt",(status='ready' AND content IS NOT NULL AND expires_at>clock_timestamp()) AS downloadable`
async function rate(db,store,action){
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['archive:'+store])
 const r=await db.query(`SELECT count(*)::int AS n FROM merchant_archive_actions WHERE store_id=$1 AND action=$2 AND created_at>clock_timestamp()-$3::interval`,[store,action,action==='download'?'1 minute':'1 hour'])
 if(r.rows[0].n>=(action==='download'?30:action==='generate'?5:10))archiveError('archive_rate_limited',429)
 await db.query('INSERT INTO merchant_archive_actions(store_id,action) VALUES($1,$2)',[store,action])
 // Only archive payloads and limiter bookkeeping are removed; never business records.
 await db.query('DELETE FROM merchant_archive_actions WHERE store_id=$1 AND created_at<clock_timestamp()-interval \'2 days\'',[store])
}
async function dataSnapshot(db,store,kind,range){
 const data={},started=Date.now()
 const rows=async(sql,params,max)=>{if(Date.now()-started>20000)archiveError('archive_time_limit',413);const r=await db.query(sql,params);if(r.rows.length>max)archiveError('archive_too_large_narrow_scope',413);return r.rows}
 await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'")
 try{
  const createdAt=(await db.query('SELECT clock_timestamp() AS at')).rows[0].at.toISOString()
  if(['catalog-json','catalog-csv','archive-json'].includes(kind)){
   data['categories.json']=await rows('SELECT id,name,sort_order FROM categories WHERE store_id=$1 ORDER BY id LIMIT 2001',[store.id],2000)
   data['products.json']=await rows('SELECT id,category_id,name,description,price_cents,discount_price_cents,discount_start,discount_end,active,sold_out,stock_mode,stock_quantity,low_stock_threshold,inventory_version,image_object_key,publish_at,version,created_at,updated_at FROM products WHERE store_id=$1 ORDER BY id LIMIT 5001',[store.id],5000)
   data['drafts.json']=await rows('SELECT id,payload,state,published_product_id,version,created_at,updated_at FROM product_drafts WHERE store_id=$1 ORDER BY id LIMIT 5001',[store.id],5000)
  }
  if(['settings-json','archive-json'].includes(kind)){
   const r=await db.query('SELECT configuration,md5(configuration::text) AS revision,updated_at FROM store_delivery_rules WHERE store_id=$1',[store.id])
   // This is an owner-only management export, including private delivery geometry.
   data['settings.json']=r.rows.length?{configured:true,...r.rows[0]}:{configured:false,configuration:null,revision:null}
  }
  if(['orders-json','archive-json'].includes(kind)){
   data['orders.json']=await rows(`SELECT id,currency,subtotal_cents,delivery_fee_cents,total_cents,payment_status,fulfillment_status,created_at,updated_at,delivered_at,estimated_arrival,inventory_state,inventory_expires_at FROM orders WHERE store_id=$1 AND created_at>=($2::date::timestamp AT TIME ZONE 'Asia/Shanghai') AND created_at<(($3::date+1)::timestamp AT TIME ZONE 'Asia/Shanghai') ORDER BY created_at,id LIMIT 5001`,[store.id,range.from,range.to],5000)
   const ids=data['orders.json'].map(o=>o.id)
   data['order-items.json']=ids.length?await rows('SELECT i.id,i.order_id,i.product_id,i.product_name,i.unit_price_cents,i.quantity,i.line_total_cents,i.category_id_snapshot,i.category_name_snapshot,i.image_object_key_snapshot FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.store_id=$1 AND o.id=ANY($2::uuid[]) ORDER BY i.order_id,i.id LIMIT 20001',[store.id,ids],20000):[]
   data['order-summary.json']=orderSummary(data['orders.json'])
  }
  await db.query('COMMIT');return {data,createdAt}
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}
}
export async function merchantArchivesRoute(req,res,url,pool){
 const m=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/archives(?:\/(preflight|[0-9a-f-]{36})(?:\/(download))?)?$/.exec(url.pathname)
 if(!m)return false
 let db,archiveId,authorizedStoreId,actor
 try{
  const subject=await authenticate(pool,req);if(!subject)archiveError('login_required',401)
  const allowed=await permittedStore(pool,subject,m[1]);if(!allowed||allowed.role!=='owner')archiveError('owner_required',403)
  authorizedStoreId=allowed.id;actor=subject
  const store=(await pool.query('SELECT id,slug,time_zone FROM stores WHERE id=$1',[allowed.id])).rows[0]
  db=await pool.connect()
  if(m[2]==='preflight'&&req.method==='POST'&&!m[3]){
   if(url.search)archiveError('invalid_query')
   const b=await readBody(req,10*1024*1024);if(Object.keys(b).some(k=>k!=='content')||typeof b.content!=='string'||Buffer.byteLength(b.content)>MAX_ARCHIVE_BYTES)archiveError('invalid_archive_size',413)
   await db.query('BEGIN');await rate(db,store.id,'preflight');await db.query('COMMIT')
   let value;try{value=JSON.parse(b.content)}catch{archiveError('invalid_archive_json')}
   const preview=preflightArchive(value,store)
   // Only compare references; no storage access, product mutations or restore writes.
   const keys=preview.imageReferences
   const known=keys.length?(await db.query(`SELECT image_object_key AS key FROM products WHERE store_id=$1 AND image_object_key=ANY($2::text[]) UNION SELECT payload->>'imageObjectKey' FROM product_drafts WHERE store_id=$1 AND payload->>'imageObjectKey'=ANY($2::text[])`,[store.id,keys])).rows.map(r=>r.key):[]
   preview.currentlyReferencedImages=new Set(known).size;preview.unreferencedImages=keys.filter(k=>!known.includes(k))
   const tracked=keys.length?(await db.query("SELECT object_key,storage_bucket,upload_state FROM stored_images WHERE store_id=$1 AND kind='product' AND object_key=ANY($2::text[])",[store.id,keys.slice(0,10)])).rows:[]
   preview.imageObjectChecks=await Promise.all(keys.slice(0,10).map(async key=>{const image=tracked.find(i=>i.object_key===key);if(!image||['deleting','deleted'].includes(image.upload_state))return {key,state:'unknown_registry_or_deletion_state'};const h=await headImage(key,image.storage_bucket||process.env.S3_BUCKET);return {key,state:h.state}}))
   preview.imageObjectCheckLimit=10;preview.uncheckedImageCount=Math.max(0,keys.length-10);preview.objectsIncluded=false
   reply(res,200,preview);return true
  }
  if(!m[2]&&req.method==='POST'){
   if(url.search)archiveError('invalid_query')
   const b=await readBody(req,2048)
   if(Object.keys(b).some(k=>!['kind','from','to','clientKey'].includes(k))||!kinds.includes(b.kind)||typeof b.clientKey!=='string'||!uuid.test(b.clientKey))archiveError('invalid_export_request')
   const dated=['orders-json','archive-json'].includes(b.kind)
   if(dated&&(!validDate(b.from)||!validDate(b.to)||b.from>b.to||Date.parse(b.to)-Date.parse(b.from)>=366*86400000)||!dated&&(b.from!==undefined||b.to!==undefined))archiveError('invalid_date_range')
   const request={kind:b.kind,...dated?{from:b.from,to:b.to}:{}},requestText=json(request)
   await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'")
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['archive:'+store.id])
   await db.query("UPDATE merchant_archives SET status='failed',failure_code='generation_interrupted',completed_at=clock_timestamp() WHERE store_id=$1 AND status='generating' AND created_at<clock_timestamp()-interval '2 minutes'",[store.id])
   await db.query('UPDATE merchant_archives SET content=NULL WHERE store_id=$1 AND expires_at<=clock_timestamp() AND content IS NOT NULL',[store.id])
   const previous=(await db.query(`SELECT ${columns},request=$3::jsonb AS same FROM merchant_archives WHERE store_id=$1 AND client_key=$2`,[store.id,b.clientKey,requestText])).rows[0]
   if(previous){if(!previous.same)archiveError('idempotency_conflict',409);await db.query('COMMIT');delete previous.same;reply(res,200,{archive:previous});return true}
   const capacity=(await db.query("SELECT count(*) FILTER(WHERE status='generating')::int AS busy,count(*) FILTER(WHERE content IS NOT NULL)::int AS saved FROM merchant_archives WHERE store_id=$1",[store.id])).rows[0]
   if(capacity.busy)archiveError('export_already_running',409)
   if(capacity.saved>=10)archiveError('archive_storage_limit_wait_for_expiry',409)
   await rate(db,store.id,'generate')
   archiveId=(await db.query('INSERT INTO merchant_archives(store_id,actor_subject,client_key,request,kind) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id',[store.id,subject,b.clientKey,requestText,b.kind])).rows[0].id
   await db.query('COMMIT')
   const {data,createdAt}=await dataSnapshot(db,store,b.kind,dated?request:null)
   const content=b.kind==='catalog-csv'?catalogCsv(data):json(makeArchive(store,b.kind,dated?{from:b.from,to:b.to}:null,data,createdAt))
   const bytes=Buffer.byteLength(content);if(bytes>MAX_ARCHIVE_BYTES)archiveError('archive_too_large_narrow_scope',413)
   const filename=`merchant-${b.kind}-${dated?b.from+'-'+b.to+'-':''}${archiveId}.${b.kind==='catalog-csv'?'csv':'json'}`
   const saved=await db.query(`UPDATE merchant_archives SET status='ready',filename=$3,bytes=$4,sha256=$5,content=$6,completed_at=clock_timestamp() WHERE store_id=$1 AND id=$2 AND status='generating' RETURNING ${columns}`,[store.id,archiveId,filename,bytes,digest(content),Buffer.from(content)])
   if(!saved.rows.length)archiveError('generation_interrupted',409)
   reply(res,200,{archive:saved.rows[0]});return true
  }
  if(!m[2]&&req.method==='GET'){
   const q=url.searchParams
   if([...q.keys()].some(k=>!['before','limit'].includes(k)||q.getAll(k).length!==1))archiveError('invalid_query')
   const limit=Number(q.get('limit')||20);if(!/^\d{1,2}$/.test(q.get('limit')||'20')||limit<1||limit>50)archiveError('invalid_limit')
   let cursor=null;if(q.has('before'))try{const raw=q.get('before');if(raw.length>512)throw Error();cursor=JSON.parse(Buffer.from(raw,'base64url'));if(cursor.store!==store.id||!uuid.test(cursor.id)||!validDate(cursor.at.slice(0,10))||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at)||!Number.isFinite(Date.parse(cursor.at)))throw Error()}catch{archiveError('invalid_cursor')}
   await db.query("UPDATE merchant_archives SET status='failed',failure_code='generation_interrupted',completed_at=clock_timestamp() WHERE store_id=$1 AND status='generating' AND created_at<clock_timestamp()-interval '2 minutes'",[store.id])
   await db.query('UPDATE merchant_archives SET content=NULL WHERE store_id=$1 AND expires_at<=clock_timestamp() AND content IS NOT NULL',[store.id])
   const rows=(await db.query(`SELECT ${columns},to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM merchant_archives WHERE store_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,[store.id,cursor?.at||null,cursor?.id||null,limit+1])).rows
   const more=rows.length>limit,items=rows.slice(0,limit),last=items.at(-1);reply(res,200,{items,hasMore:more,nextCursor:more?Buffer.from(json({store:store.id,at:last.at,id:last.id})).toString('base64url'):null});return true
  }
  if(m[2]&&uuid.test(m[2])&&m[3]==='download'&&req.method==='GET'){
   if(url.search)archiveError('invalid_query')
   await db.query('BEGIN');await rate(db,store.id,'download');await db.query('COMMIT')
   const row=(await db.query('SELECT filename,content,sha256 FROM merchant_archives WHERE store_id=$1 AND id=$2 AND status=\'ready\' AND expires_at>clock_timestamp()',[store.id,m[2]])).rows[0]
   if(!row||!row.content)archiveError('archive_not_downloadable',404)
   if(digest(row.content)!==row.sha256)archiveError('stored_archive_corrupt',409)
   reply(res,200,{filename:row.filename,content:row.content.toString('utf8'),sha256:row.sha256});return true
  }
  archiveError('method_or_endpoint_not_allowed',405)
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});if(archiveId&&db)await db.query("UPDATE merchant_archives SET status='failed',failure_code=$4,completed_at=clock_timestamp(),content=NULL WHERE store_id=$1 AND id=$2 AND status='generating' AND actor_subject=$3",[authorizedStoreId,archiveId,actor,['archive_too_large_narrow_scope','archive_time_limit'].includes(e.message)?e.message:'generation_failed']).catch(()=>{});reply(res,e.status||503,{error:e.status?e.message:'archive_service_unavailable'})}
 finally{db?.release()}
 return true
}
