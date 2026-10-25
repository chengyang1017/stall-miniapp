import { pageScope,pageQuery,pageResult,cursorTime } from './customerPagination.mjs'
import { authenticate, permittedStore } from './auth.mjs'
import { resolveOrderInventory } from './inventory.mjs'
import { randomUUID } from 'node:crypto'
import { registerImage,privateProofBucket,headImage } from './imageLifecycle.mjs'
import { merchantOrderCounts, merchantOrderQuery } from './merchantOrderQuery.mjs'
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner' // PHASE37B_PROOF
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const slugRe = '[a-z0-9][a-z0-9-]{1,62}'
const uuidRe = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const steps = { new: 'accepted', accepted: 'preparing', preparing: 'delivering', delivering: 'delivered' }
function reply(res, code, body) { res.writeHead(code, headers); res.end(JSON.stringify(body)) }
async function readJson(req) {
  if (Number(req.headers['content-length'] || 0) > 4096) throw new Error('too_large')
  let raw = ''
  for await (const chunk of req) { raw += chunk.toString('utf8'); if (Buffer.byteLength(raw) > 4096) throw new Error('too_large') }
  try { return JSON.parse(raw) } catch { throw new Error('invalid_json') }
}
export async function orderWorkflowRoute(req, res, url, pool) {
  const list = new RegExp(`^/v1/merchant/stores/(${slugRe})/orders$`).exec(url.pathname)
  const summary = new RegExp(`^/v1/merchant/stores/(${slugRe})/orders/summary$`).exec(url.pathname)
  const item = new RegExp(`^/v1/merchant/stores/(${slugRe})/orders/(${uuidRe})$`).exec(url.pathname)
  const action = new RegExp(`^/v1/merchant/stores/(${slugRe})/orders/(${uuidRe})/status$`).exec(url.pathname)
  const customer = new RegExp(`^/v1/stores/(${slugRe})/orders/(${uuidRe})$`).exec(url.pathname)
  // PHASE35_CUSTOMER_ORDERS: scoped to the authenticated customer.
  const customerList = new RegExp(`^/v1/stores/(${slugRe})/orders$`).exec(url.pathname)
  // PHASE37_ETA: authorized store-scoped ETA update. No payment or fulfillment bypass.
  const noteMatch=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/note$').exec(url.pathname)
  if(noteMatch){
    if(req.method!=='PUT'){reply(res,405,{error:'method_not_allowed'});return true}
    const who=await authenticate(pool,req);if(!who){reply(res,401,{error:'login_required'});return true}
    const store=await permittedStore(pool,who,noteMatch[1]);if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
    let body;try{body=await readJson(req)}catch(e){reply(res,400,{error:'invalid_note'});return true}
    if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['note','expectedVersion'].includes(k))||typeof body.note!=='string'||body.note.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.note)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||body.expectedVersion>2147483646){reply(res,400,{error:'invalid_note'});return true}
    const result=await pool.query('UPDATE orders SET merchant_note=$3,merchant_note_version=merchant_note_version+1,updated_at=clock_timestamp() WHERE store_id=$1 AND id=$2 AND merchant_note_version=$4 RETURNING merchant_note AS note,merchant_note_version AS version',[store.id,noteMatch[2],body.note.trim(),body.expectedVersion])
    reply(res,result.rows.length?200:409,result.rows[0]||{error:'merchant_note_changed_refresh'});return true
  }
  const etaMatch=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/eta$').exec(url.pathname)
  if(etaMatch){
    if(req.method!=='PUT'){reply(res,405,{error:'method_not_allowed'});return true}
    const who=await authenticate(pool,req)
    if(!who){reply(res,401,{error:'login_required'});return true}
    const store=await permittedStore(pool,who,etaMatch[1])
    if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
    let body
    try{body=await readJson(req)}catch(e){reply(res,e.message==='too_large'?413:400,{error:'invalid_json'});return true}
    const eta=body&&body.estimatedArrival
    if(typeof eta!=='string'||eta.length>60||/[\x00-\x1f\x7f]/.test(eta)){reply(res,400,{error:'invalid_eta'});return true}
    const value=eta.trim()
    const {rows}=await pool.query(`UPDATE orders SET estimated_arrival=$3,updated_at=now()
      WHERE store_id=$1 AND id=$2 AND fulfillment_status IN ('accepted','preparing','delivering')
      RETURNING id,estimated_arrival AS "estimatedArrival"`,[store.id,etaMatch[2],value||null])
    if(!rows.length){reply(res,409,{error:'order_unavailable_for_eta'});return true}
    reply(res,200,{ok:true,estimatedArrival:rows[0].estimatedArrival||''});return true
  }
  const proofReadCustomer=new RegExp('^/v1/stores/('+slugRe+')/orders/('+uuidRe+')/proof$').exec(url.pathname)
  const proofReadMerchant=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/proof$').exec(url.pathname)
  if(proofReadCustomer||proofReadMerchant){
    if(req.method!=='GET'){reply(res,405,{error:'method_not_allowed'});return true}
    const who=await authenticate(pool,req)
    if(!who){reply(res,401,{error:'login_required'});return true}
    const m=proofReadCustomer||proofReadMerchant
    let rows
    if(proofReadMerchant){
      const store=await permittedStore(pool,who,m[1])
      if(!store){reply(res,403,{error:'forbidden'});return true}
      ;({rows}=await pool.query('SELECT store_id,id,delivery_proof_key FROM orders WHERE store_id=$1 AND id=$2 AND fulfillment_status=$3',[store.id,m[2],'delivered']))
    }else{
      ;({rows}=await pool.query('SELECT o.store_id,o.id,o.delivery_proof_key FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.slug=$1 AND o.id=$2 AND o.customer_subject=$3 AND o.fulfillment_status=$4',[m[1],m[2],who,'delivered']))
    }
    if(!rows.length){reply(res,404,{error:'proof_not_found'});return true}
    const key=rows[0].delivery_proof_key
    if(typeof key!=='string'||!/^delivery-proofs\/[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(key)){reply(res,404,{error:'proof_not_found'});return true}
    if(!key.startsWith(`delivery-proofs/${rows[0].store_id}/${rows[0].id}/`)){reply(res,409,{error:'proof_reference_mismatch'});return true}
    if(!privateProofBucket()){reply(res,503,{error:'proof_private_storage_not_confirmed'});return true}
    const tracked=(await pool.query("SELECT storage_bucket,etag FROM stored_images WHERE store_id=$1 AND object_key=$2 AND kind='proof' AND upload_state NOT IN ('deleting','deleted')",[rows[0].store_id,key])).rows[0]
    if(!tracked){reply(res,409,{error:'proof_registry_missing'});return true}
    const Bucket=tracked.storage_bucket||process.env.S3_BUCKET
    const {S3_ENDPOINT:endpoint,S3_ACCESS_KEY_ID:accessKeyId,S3_SECRET_ACCESS_KEY:secretAccessKey}=process.env
    if(!Bucket||!endpoint||!accessKeyId||!secretAccessKey){reply(res,503,{error:'object_storage_not_configured'});return true}
    const observed=await headImage(key,Bucket)
    if(observed.state!=='exists'){reply(res,observed.state==='missing'?404:503,{error:'proof_object_unavailable'});return true}
    if(observed.bytes<1||observed.bytes>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(observed.contentType)){reply(res,409,{error:'invalid_proof_object'});return true}
    if(tracked.etag&&tracked.etag!==observed.etag){reply(res,409,{error:'proof_object_changed_requires_review'});return true}
    const s3=new S3Client({region:process.env.S3_REGION||'auto',endpoint,credentials:{accessKeyId,secretAccessKey}})
    const url=await getSignedUrl(s3,new GetObjectCommand({Bucket,Key:key,ResponseCacheControl:'private, no-store, max-age=0'}),{expiresIn:180})
    reply(res,200,{url,expiresInSeconds:180});return true
  }
  const proofMatch=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/proof-upload$').exec(url.pathname)
  const completeMatch=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/complete$').exec(url.pathname)
  if(proofMatch||completeMatch){
    if(req.method!=='POST'){reply(res,405,{error:'method_not_allowed'});return true}
    const m=proofMatch||completeMatch
    const subject=await authenticate(pool,req)
    if(!subject){reply(res,401,{error:'login_required'});return true}
    const store=await permittedStore(pool,subject,m[1])
    if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
    const {rows}=await pool.query('SELECT id,fulfillment_status,payment_status,delivery_proof_key FROM orders WHERE store_id=$1 AND id=$2',[store.id,m[2]])
    if(!rows.length){reply(res,404,{error:'order_not_found'});return true}
    let body;try{body=await readJson(req)}catch(e){reply(res,400,{error:'invalid_json'});return true}
    if(completeMatch&&rows[0].fulfillment_status==='delivered'&&body?.proofKey===rows[0].delivery_proof_key){reply(res,200,{ok:true,status:'delivered',reused:true});return true}
    if(rows[0].fulfillment_status!=='delivering'){reply(res,409,{error:'not_delivering'});return true}
    const bucket=privateProofBucket(),endpoint=process.env.S3_ENDPOINT,accessKeyId=process.env.S3_ACCESS_KEY_ID,secretAccessKey=process.env.S3_SECRET_ACCESS_KEY
    if(!bucket){reply(res,503,{error:'proof_private_storage_not_confirmed'});return true}
    if(!bucket||!endpoint||!accessKeyId||!secretAccessKey){reply(res,503,{error:'object_storage_not_configured'});return true}
    const s3=new S3Client({region:process.env.S3_REGION||'auto',endpoint,credentials:{accessKeyId,secretAccessKey}})
    if(proofMatch){
      const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
      const ext=body&&types[body.contentType]
      if(!ext||!Number.isInteger(body.sizeBytes)||body.sizeBytes<1||body.sizeBytes>5*1024*1024){reply(res,400,{error:'invalid_image'});return true}
      if(body.clientKey!==undefined&&!new RegExp('^'+uuidRe+'$').test(body.clientKey)){reply(res,400,{error:'invalid_upload_request_key'});return true}
      let registered;try{registered=await registerImage(pool,store.id,'delivery-proofs/'+store.id+'/'+m[2]+'/'+randomUUID()+'.'+ext,'proof',bucket,body.sizeBytes,body.contentType,body.clientKey||null)}catch(e){if(e.status===409){reply(res,409,{error:e.message});return true}throw e}
      const key=registered.key
      const uploadUrl=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:body.contentType}),{expiresIn:300})
      reply(res,200,{key,uploadUrl,contentType:body.contentType});return true
    }
    if(rows[0].payment_status!=='paid'){reply(res,409,{error:'payment_not_confirmed'});return true}
    const key=body&&body.proofKey
    const expected=new RegExp('^delivery-proofs/'+store.id+'/'+m[2]+'/[0-9a-f-]{36}\.(jpg|png|webp)$')
    if(typeof key!=='string'||!expected.test(key)){reply(res,400,{error:'invalid_proof_key'});return true}
    const image=(await pool.query("SELECT * FROM stored_images WHERE store_id=$1 AND object_key=$2 AND kind='proof' AND source='upload' AND upload_state NOT IN ('deleting','deleted')",[store.id,key])).rows[0]
    if(!image||image.storage_bucket!==bucket){reply(res,400,{error:'unregistered_proof_object'});return true}
    let head;try{head=await s3.send(new HeadObjectCommand({Bucket:image.storage_bucket,Key:key}),{abortSignal:AbortSignal.timeout(6000)})}catch(e){if(e.name==='NotFound'||e.$metadata?.httpStatusCode===404){reply(res,400,{error:'proof_not_uploaded'});return true}throw e}
    const size=Number(head.ContentLength||0),type=String(head.ContentType||'').split(';')[0]
    if(size<1||size>5*1024*1024||size!==image.expected_bytes||type!==image.content_type||!['image/jpeg','image/png','image/webp'].includes(type)){reply(res,400,{error:'invalid_proof_object'});return true}
    const client=await pool.connect()
    try{
      await client.query('BEGIN')
      await client.query("UPDATE stored_images SET upload_state='verified',etag=$3,actual_bytes=$4,object_modified_at=$5,last_checked_at=clock_timestamp() WHERE store_id=$1 AND id=$2 AND kind='proof'",[store.id,image.id,head.ETag||null,size,head.LastModified||null])
      const result=await client.query("UPDATE orders SET fulfillment_status='delivered',delivered_at=now(),delivery_proof_key=$3,updated_at=now() WHERE store_id=$1 AND id=$2 AND fulfillment_status='delivering' AND payment_status='paid' RETURNING id",[store.id,m[2],key])
      if(!result.rows.length){await client.query('ROLLBACK');reply(res,409,{error:'order_state_changed'});return true}
      await client.query("INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,$3,'delivering','delivered',NULL)",[store.id,m[2],subject])
      await client.query('COMMIT');reply(res,200,{ok:true,status:'delivered'});return true
    }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  }
  if (!list && !summary && !item && !action && !customer && !customerList) return false
  if(summary && req.method!=='GET'){reply(res,405,{error:'method_not_allowed'});return true}
  if (list && req.method !== 'GET' || item && req.method !== 'GET' || action && req.method !== 'POST' || customer && req.method !== 'GET' || customerList && req.method !== 'GET') { reply(res,405,{error:'method_not_allowed'}); return true }
  const subject = await authenticate(pool, req)
  if (!subject) { reply(res,401,{error:'login_required'}); return true }
  // PHASE35_CUSTOMER_ORDERS: list and detail never expose another customer's orders.
  if (customerList) {
    const q=url.searchParams,tab=q.get('tab')||'all'
    if(!['all','unpaid','active','completed','other'].includes(tab)){reply(res,400,{error:'invalid_order_tab'});return true}
    const scope=pageScope(['orders',customerList[1],subject,tab])
    let page
    try{page=pageQuery(q,['tab','limit','cursor'],20,scope)}catch(e){reply(res,400,{error:e.message});return true}
    const other="o.fulfillment_status IN ('cancelled','canceled','abnormal','exception','refunded')"
    const filters={all:'true',unpaid:`o.payment_status <> 'paid' AND NOT (${other})`,active:"o.payment_status='paid' AND o.fulfillment_status IN ('new','accepted','preparing','delivering')",completed:"o.fulfillment_status='delivered'",other}
    const counts=await pool.query(`SELECT count(*)::integer AS "all",
      count(*) FILTER (WHERE ${filters.unpaid})::integer AS unpaid,
      count(*) FILTER (WHERE ${filters.active})::integer AS active,
      count(*) FILTER (WHERE ${filters.completed})::integer AS completed,
      count(*) FILTER (WHERE ${other})::integer AS other
      FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.slug=$1 AND o.customer_subject=$2`,[customerList[1],subject])
    const result=await pool.query(`SELECT ${cursorTime('o')} AS "cursorTime",o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.fulfillment_status AS "fulfillmentStatus",o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt",o.estimated_arrival AS "estimatedArrival",o.issue_reason AS "issueReason"
      FROM orders o JOIN stores s ON s.id=o.store_id
      WHERE s.slug=$1 AND o.customer_subject=$2 AND (${filters[tab]})
      AND ($3::timestamptz IS NULL OR (o.created_at,o.id)<($3::timestamptz,$4::uuid))
      ORDER BY o.created_at DESC,o.id DESC LIMIT $5`,[customerList[1],subject,page.anchor?.[1]??null,page.anchor?.[2]??null,page.limit+1])
    const paged=pageResult(result.rows,page.limit,scope),rows=paged.items
    // PHASE39_ORDER_LIST_PROOF_LINK: resolve only items of orders already scoped to this customer.
    const ids=rows.map(o=>o.id)
    const lines=ids.length?await pool.query('SELECT order_id,product_name AS "name",quantity FROM order_items WHERE order_id=ANY($1::uuid[]) ORDER BY id',[ids]):{rows:[]}
    const byOrder=new Map()
    for(const line of lines.rows){const key=String(line.order_id);if(!byOrder.has(key))byOrder.set(key,[]);byOrder.get(key).push({name:line.name,quantity:line.quantity})}
    const enriched=rows.map(o=>({...o,items:byOrder.get(String(o.id))||[]}))
    reply(res,200,{orders:enriched,hasMore:paged.hasMore,nextCursor:paged.nextCursor,counts:counts.rows[0]});return true
  }
  if (customer) {
    const {rows} = await pool.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.fulfillment_status AS "fulfillmentStatus",o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt",o.estimated_arrival AS "estimatedArrival",o.issue_reason AS "issueReason",o.contact_snapshot AS "contactSnapshot",o.delivery_slot_snapshot AS "deliverySlotSnapshot"
      FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.slug=$1 AND o.id=$2 AND o.customer_subject=$3`,[customer[1],customer[2],subject])
    if(!rows.length){reply(res,404,{error:'not_found'});return true}
    const lines=await pool.query(`SELECT oi.id AS "orderItemId",oi.product_id AS "productId",oi.product_name AS "name",oi.unit_price_cents AS "unitPriceCents",oi.quantity,oi.line_total_cents AS "lineTotalCents" FROM order_items oi WHERE oi.order_id=$1 ORDER BY oi.id`,[rows[0].id])
    reply(res,200,{order:rows[0],items:lines.rows});return true
  }
    // PHASE40_ISSUE_REASON: customer-owned order reason is returned above.
  const slug = (list || summary || item || action)[1]
  const store = await permittedStore(pool,subject,slug)
  if (!store) { reply(res,403,{error:'forbidden'}); return true }
  if (action && !['owner','manager'].includes(store.role)) { reply(res,403,{error:'forbidden'});return true }
  if(summary){
    if([...url.searchParams.keys()].length){reply(res,400,{error:'summary_is_store_wide'});return true}
    const client=await pool.connect();let open=false
    try{
      await client.query('BEGIN TRANSACTION READ ONLY');open=true
      await client.query("SET LOCAL statement_timeout='5000ms'")
      const counts=await merchantOrderCounts(client,store.id)
      await client.query('COMMIT');open=false
      reply(res,200,{counts,pendingCount:counts.new,pendingStatus:'new'})
    }finally{if(open)await client.query('ROLLBACK').catch(()=>{});client.release()}
    return true
  }
  if(list){await merchantOrderQuery(req,res,url,pool,store,subject,reply);return true}
  if (item) {
    const {rows}=await pool.query('SELECT * FROM orders WHERE store_id=$1 AND id=$2',[store.id,item[2]])
    if (!rows.length) { reply(res,404,{error:'not_found'}); return true }
    const lines=await pool.query('SELECT product_name AS "name",unit_price_cents AS "unitPriceCents",quantity,line_total_cents AS "lineTotalCents" FROM order_items WHERE order_id=$1 ORDER BY id',[item[2]])
    const events=await pool.query('SELECT from_status AS "fromStatus",to_status AS "toStatus",note,created_at AS "createdAt" FROM order_status_events WHERE store_id=$1 AND order_id=$2 ORDER BY created_at DESC LIMIT 100',[store.id,item[2]])
    reply(res,200,{order:rows[0],items:lines.rows,events:events.rows}); return true
  }
  let body
  try { body=await readJson(req) } catch (e) { reply(res,e.message==='too_large'?413:400,{error:e.message}); return true }
  const next = body?.status
  if (typeof next !== 'string' || !['accepted','preparing','delivering','delivered','cancelled','abnormal'].includes(next)) { reply(res,400,{error:'invalid_status'}); return true }
  if(next==='delivered'){reply(res,409,{error:'use_verified_proof_completion_endpoint'});return true}
  const reason = typeof body.reason==='string' ? body.reason.trim() : ''
  const proofKey = typeof body.proofKey==='string' ? body.proofKey.trim() : ''
  if (['cancelled','abnormal'].includes(next) && (reason.length<1 || reason.length>200)) { reply(res,400,{error:'reason_required'}); return true }
  if (next==='delivered' && !/^delivery-proofs\/[a-zA-Z0-9/_-]{8,200}$/.test(proofKey)) { reply(res,400,{error:'delivery_proof_required'}); return true }
  const client=await pool.connect()
  try {
    await client.query('BEGIN')
    const {rows}=await client.query('SELECT *,inventory_expires_at <= clock_timestamp() AS inventory_expired FROM orders WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,action[2]])
    if (!rows.length) { await client.query('ROLLBACK'); reply(res,404,{error:'not_found'}); return true }
    const current=rows[0].fulfillment_status
    const order=rows[0]
    if (order.inventory_state==='held' && order.payment_status==='unpaid' && current==='new' && order.inventory_expired) {
      await resolveOrderInventory(client,order,'released','expiry','system:inventory','未支付预留超过15分钟，释放库存')
      await client.query("UPDATE orders SET fulfillment_status='cancelled',issue_reason='未支付预留超时，库存已释放',updated_at=now() WHERE id=$1",[order.id])
      await client.query("INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,'system:inventory','new','cancelled','未支付预留超时，库存已释放')",[store.id,order.id])
      await client.query('COMMIT');reply(res,409,{error:'inventory_reservation_expired'});return true
    }
    const allowed = steps[current]===next || (next==='cancelled' && ['new','accepted','preparing'].includes(current)) || (next==='abnormal' && current==='delivering')
    if (!allowed) { await client.query('ROLLBACK'); reply(res,409,{error:'invalid_transition',current}); return true }
    if (order.inventory_state==='released' && next!=='cancelled') { await client.query('ROLLBACK');reply(res,409,{error:'inventory_released_requires_review'});return true }
    if (order.inventory_state==='held') {
      if (order.payment_status==='unpaid' && next==='cancelled') await resolveOrderInventory(client,order,'released','cancel',subject,'商家取消未支付订单，释放预留')
      else if (order.payment_status==='paid') await resolveOrderInventory(client,order,'committed','payment',subject,'已确认付款，预留转为正式扣减（不再次扣库存）')
      else { await client.query('ROLLBACK');reply(res,409,{error:'payment_not_confirmed'});return true }
    }
    // No payment integration yet; do not allow marking unpaid orders as delivered.
    if (next==='delivered' && rows[0].payment_status!=='paid') { await client.query('ROLLBACK'); reply(res,409,{error:'payment_not_confirmed'}); return true }
    await client.query(`UPDATE orders SET fulfillment_status=$3,updated_at=now(), delivered_at=CASE WHEN $3='delivered' THEN now() ELSE delivered_at END,
      delivery_proof_key=CASE WHEN $3='delivered' THEN $4 ELSE delivery_proof_key END,
      issue_reason=CASE WHEN $3 IN ('cancelled','abnormal') THEN $5 ELSE issue_reason END WHERE store_id=$1 AND id=$2`,[store.id,action[2],next,proofKey||null,reason||null])
    await client.query('INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,$3,$4,$5,$6)',[store.id,action[2],subject,current,next,reason||null])
    await client.query('COMMIT')
    reply(res,200,{ok:true,status:next})
  } catch(e) { try { await client.query('ROLLBACK') } catch {} if(e.inventoryError){reply(res,409,{error:e.message});return true}throw e } finally { client.release() }
  return true
}
