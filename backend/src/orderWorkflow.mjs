import { authenticate, permittedStore } from './auth.mjs'
import { randomUUID } from 'node:crypto'
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
  const item = new RegExp(`^/v1/merchant/stores/(${slugRe})/orders/(${uuidRe})$`).exec(url.pathname)
  const action = new RegExp(`^/v1/merchant/stores/(${slugRe})/orders/(${uuidRe})/status$`).exec(url.pathname)
  const customer = new RegExp(`^/v1/stores/(${slugRe})/orders/(${uuidRe})$`).exec(url.pathname)
  // PHASE35_CUSTOMER_ORDERS: scoped to the authenticated customer.
  const customerList = new RegExp(`^/v1/stores/(${slugRe})/ordersimport { authenticate, permittedStore } from './auth.mjs'

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
  const item = new RegExp(`^/v1/merchant/stores/(${slugRe})/orders/(${uuidRe})$`).exec(url.pathname)
  const action = new RegExp(`^/v1/merchant/stores/(${slugRe})/orders/(${uuidRe})/status$`).exec(url.pathname)
  const customer = new RegExp(`^/v1/stores/(${slugRe})/orders/(${uuidRe})$`).exec(url.pathname)
).exec(url.pathname)
  // PHASE37_ETA: authorized store-scoped ETA update. No payment or fulfillment bypass.
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
  // PHASE38_PROOF_READ: signed, short-lived image URL; authorize BEFORE reading the key.
  const proofReadCustomer=new RegExp('^/v1/stores/('+slugRe+')/orders/('+uuidRe+')/proof
  const proofMatch=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/proof-upload$').exec(url.pathname)
  const completeMatch=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/complete$').exec(url.pathname)
  if(proofMatch||completeMatch){
    if(req.method!=='POST'){reply(res,405,{error:'method_not_allowed'});return true}
    const m=proofMatch||completeMatch
    const subject=await authenticate(pool,req)
    if(!subject){reply(res,401,{error:'login_required'});return true}
    const store=await permittedStore(pool,subject,m[1])
    if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
    const {rows}=await pool.query('SELECT id,fulfillment_status,payment_status FROM orders WHERE store_id=$1 AND id=$2',[store.id,m[2]])
    if(!rows.length){reply(res,404,{error:'order_not_found'});return true}
    if(rows[0].fulfillment_status!=='delivering'){reply(res,409,{error:'not_delivering'});return true}
    let body;try{body=await readJson(req)}catch(e){reply(res,400,{error:'invalid_json'});return true}
    const bucket=process.env.S3_BUCKET,endpoint=process.env.S3_ENDPOINT,accessKeyId=process.env.S3_ACCESS_KEY_ID,secretAccessKey=process.env.S3_SECRET_ACCESS_KEY
    if(!bucket||!endpoint||!accessKeyId||!secretAccessKey){reply(res,503,{error:'object_storage_not_configured'});return true}
    const s3=new S3Client({region:process.env.S3_REGION||'auto',endpoint,credentials:{accessKeyId,secretAccessKey}})
    if(proofMatch){
      const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
      const ext=body&&types[body.contentType]
      if(!ext||!Number.isInteger(body.sizeBytes)||body.sizeBytes<1||body.sizeBytes>5*1024*1024){reply(res,400,{error:'invalid_image'});return true}
      const key='delivery-proofs/'+store.id+'/'+m[2]+'/'+randomUUID()+'.'+ext
      const uploadUrl=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:body.contentType}),{expiresIn:300})
      reply(res,200,{key,uploadUrl,contentType:body.contentType});return true
    }
    if(rows[0].payment_status!=='paid'){reply(res,409,{error:'payment_not_confirmed'});return true}
    const key=body&&body.proofKey
    const expected=new RegExp('^delivery-proofs/'+store.id+'/'+m[2]+'/[0-9a-f-]{36}\.(jpg|png|webp)$')
    if(typeof key!=='string'||!expected.test(key)){reply(res,400,{error:'invalid_proof_key'});return true}
    let head;try{head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}))}catch(e){if(e.name==='NotFound'||e.$metadata?.httpStatusCode===404){reply(res,400,{error:'proof_not_uploaded'});return true}throw e}
    const size=Number(head.ContentLength||0),type=String(head.ContentType||'').split(';')[0]
    if(size<1||size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(type)){reply(res,400,{error:'invalid_proof_object'});return true}
    const client=await pool.connect()
    try{
      await client.query('BEGIN')
      const result=await client.query("UPDATE orders SET fulfillment_status='delivered',delivered_at=now(),delivery_proof_key=$3,updated_at=now() WHERE store_id=$1 AND id=$2 AND fulfillment_status='delivering' AND payment_status='paid' RETURNING id",[store.id,m[2],key])
      if(!result.rows.length){await client.query('ROLLBACK');reply(res,409,{error:'order_state_changed'});return true}
      await client.query("INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,$3,'delivering','delivered',NULL)",[store.id,m[2],subject])
      await client.query('COMMIT');reply(res,200,{ok:true,status:'delivered'});return true
    }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  }
  if (!list && !item && !action && !customer && !customerList) return false
  if (list && req.method !== 'GET' || item && req.method !== 'GET' || action && req.method !== 'POST' || customer && req.method !== 'GET' || customerList && req.method !== 'GET') { reply(res,405,{error:'method_not_allowed'}); return true }
  const subject = await authenticate(pool, req)
  if (!subject) { reply(res,401,{error:'login_required'}); return true }
  // PHASE35_CUSTOMER_ORDERS: list and detail never expose another customer's orders.
  if (customerList) {
    const {rows}=await pool.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.fulfillment_status AS "fulfillmentStatus",o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt",o.estimated_arrival AS "estimatedArrival"
      FROM orders o JOIN stores s ON s.id=o.store_id
      WHERE s.slug=$1 AND o.customer_subject=$2
      ORDER BY o.created_at DESC,o.id DESC LIMIT 100`,[customerList[1],subject])
    // PHASE39_ORDER_LIST_PROOF_LINK: resolve only items of orders already scoped to this customer.
    const ids=rows.map(o=>o.id)
    const result=ids.length?await pool.query('SELECT order_id,product_name AS "name",quantity FROM order_items WHERE order_id=ANY($1::uuid[]) ORDER BY id',[ids]):{rows:[]}
    const byOrder=new Map()
    for(const line of result.rows){const key=String(line.order_id);if(!byOrder.has(key))byOrder.set(key,[]);byOrder.get(key).push({name:line.name,quantity:line.quantity})}
    const enriched=rows.map(o=>({...o,items:byOrder.get(String(o.id))||[]}))
    reply(res,200,{orders:enriched,hasMore:rows.length===100});return true
  }
  if (customer) {
    const {rows} = await pool.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.fulfillment_status AS "fulfillmentStatus",o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt",o.estimated_arrival AS "estimatedArrival",o.issue_reason AS "issueReason",o.contact_snapshot AS "contactSnapshot",o.delivery_slot_snapshot AS "deliverySlotSnapshot"
      FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.slug=$1 AND o.id=$2 AND o.customer_subject=$3`,[customer[1],customer[2],subject])
    if(!rows.length){reply(res,404,{error:'not_found'});return true}
    const lines=await pool.query(`SELECT oi.product_id AS "productId",oi.product_name AS "name",oi.unit_price_cents AS "unitPriceCents",oi.quantity,oi.line_total_cents AS "lineTotalCents" FROM order_items oi WHERE oi.order_id=$1 ORDER BY oi.id`,[rows[0].id])
    reply(res,200,{order:rows[0],items:lines.rows});return true
  }
    // PHASE40_ISSUE_REASON: customer-owned order reason is returned above.
  const slug = (list || item || action)[1]
  const store = await permittedStore(pool,subject,slug)
  if (!store) { reply(res,403,{error:'forbidden'}); return true }
  if (list) {
    const {rows}=await pool.query(`SELECT id,created_at AS "createdAt",payment_status AS "paymentStatus",fulfillment_status AS "fulfillmentStatus",total_cents AS "totalCents",delivered_at AS "deliveredAt",estimated_arrival AS "estimatedArrival"
      FROM orders WHERE store_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[store.id])
    // PHASE36_CLOUD_MERCHANT_ORDERS: provide the same read-only fields as existing merchant cards.
    const ids=rows.map(o=>o.id)
    const details=ids.length?await pool.query('SELECT id,contact_snapshot,delivery_slot_snapshot,issue_reason FROM orders WHERE store_id=$1 AND id=ANY($2::uuid[])',[store.id,ids]):{rows:[]}
    const lines=ids.length?await pool.query('SELECT order_id,product_name AS "name",quantity,line_total_cents AS "lineTotalCents" FROM order_items WHERE order_id=ANY($1::uuid[]) ORDER BY id',[ids]):{rows:[]}
    const snapshots=new Map(details.rows.map(r=>[r.id,r]))
    const enriched=rows.map(o=>({ ...o,
      contactSnapshot:snapshots.get(o.id)?.contact_snapshot||{},
      deliverySlotSnapshot:snapshots.get(o.id)?.delivery_slot_snapshot||{},
      issueReason:snapshots.get(o.id)?.issue_reason||'', // PHASE40_ISSUE_REASON
      items:lines.rows.filter(i=>i.order_id===o.id).map(i=>({name:i.name,quantity:i.quantity,subtotal:(Number(i.lineTotalCents)/100).toFixed(2)}))
    }))
    reply(res,200,{orders:enriched,pendingCount:rows.filter(r=>r.fulfillmentStatus==='new').length,hasMore:rows.length===100}); return true
  }
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
  const reason = typeof body.reason==='string' ? body.reason.trim() : ''
  const proofKey = typeof body.proofKey==='string' ? body.proofKey.trim() : ''
  if (['cancelled','abnormal'].includes(next) && (reason.length<1 || reason.length>200)) { reply(res,400,{error:'reason_required'}); return true }
  if (next==='delivered' && !/^delivery-proofs\/[a-zA-Z0-9/_-]{8,200}$/.test(proofKey)) { reply(res,400,{error:'delivery_proof_required'}); return true }
  const client=await pool.connect()
  try {
    await client.query('BEGIN')
    const {rows}=await client.query('SELECT fulfillment_status,payment_status FROM orders WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,action[2]])
    if (!rows.length) { await client.query('ROLLBACK'); reply(res,404,{error:'not_found'}); return true }
    const current=rows[0].fulfillment_status
    const allowed = steps[current]===next || (next==='cancelled' && ['new','accepted','preparing'].includes(current)) || (next==='abnormal' && current==='delivering')
    if (!allowed) { await client.query('ROLLBACK'); reply(res,409,{error:'invalid_transition',current}); return true }
    // No payment integration yet; do not allow marking unpaid orders as delivered.
    if (next==='delivered' && rows[0].payment_status!=='paid') { await client.query('ROLLBACK'); reply(res,409,{error:'payment_not_confirmed'}); return true }
    await client.query(`UPDATE orders SET fulfillment_status=$3,updated_at=now(), delivered_at=CASE WHEN $3='delivered' THEN now() ELSE delivered_at END,
      delivery_proof_key=CASE WHEN $3='delivered' THEN $4 ELSE delivery_proof_key END,
      issue_reason=CASE WHEN $3 IN ('cancelled','abnormal') THEN $5 ELSE issue_reason END WHERE store_id=$1 AND id=$2`,[store.id,action[2],next,proofKey||null,reason||null])
    await client.query('INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,$3,$4,$5,$6)',[store.id,action[2],subject,current,next,reason||null])
    await client.query('COMMIT')
    reply(res,200,{ok:true,status:next})
  } catch(e) { try { await client.query('ROLLBACK') } catch {} throw e } finally { client.release() }
  return true
}
).exec(url.pathname)
  const proofReadMerchant=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/proof
  const proofMatch=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/proof-upload$').exec(url.pathname)
  const completeMatch=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/complete$').exec(url.pathname)
  if(proofMatch||completeMatch){
    if(req.method!=='POST'){reply(res,405,{error:'method_not_allowed'});return true}
    const m=proofMatch||completeMatch
    const subject=await authenticate(pool,req)
    if(!subject){reply(res,401,{error:'login_required'});return true}
    const store=await permittedStore(pool,subject,m[1])
    if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
    const {rows}=await pool.query('SELECT id,fulfillment_status,payment_status FROM orders WHERE store_id=$1 AND id=$2',[store.id,m[2]])
    if(!rows.length){reply(res,404,{error:'order_not_found'});return true}
    if(rows[0].fulfillment_status!=='delivering'){reply(res,409,{error:'not_delivering'});return true}
    let body;try{body=await readJson(req)}catch(e){reply(res,400,{error:'invalid_json'});return true}
    const bucket=process.env.S3_BUCKET,endpoint=process.env.S3_ENDPOINT,accessKeyId=process.env.S3_ACCESS_KEY_ID,secretAccessKey=process.env.S3_SECRET_ACCESS_KEY
    if(!bucket||!endpoint||!accessKeyId||!secretAccessKey){reply(res,503,{error:'object_storage_not_configured'});return true}
    const s3=new S3Client({region:process.env.S3_REGION||'auto',endpoint,credentials:{accessKeyId,secretAccessKey}})
    if(proofMatch){
      const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
      const ext=body&&types[body.contentType]
      if(!ext||!Number.isInteger(body.sizeBytes)||body.sizeBytes<1||body.sizeBytes>5*1024*1024){reply(res,400,{error:'invalid_image'});return true}
      const key='delivery-proofs/'+store.id+'/'+m[2]+'/'+randomUUID()+'.'+ext
      const uploadUrl=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:body.contentType}),{expiresIn:300})
      reply(res,200,{key,uploadUrl,contentType:body.contentType});return true
    }
    if(rows[0].payment_status!=='paid'){reply(res,409,{error:'payment_not_confirmed'});return true}
    const key=body&&body.proofKey
    const expected=new RegExp('^delivery-proofs/'+store.id+'/'+m[2]+'/[0-9a-f-]{36}\.(jpg|png|webp)$')
    if(typeof key!=='string'||!expected.test(key)){reply(res,400,{error:'invalid_proof_key'});return true}
    let head;try{head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}))}catch(e){if(e.name==='NotFound'||e.$metadata?.httpStatusCode===404){reply(res,400,{error:'proof_not_uploaded'});return true}throw e}
    const size=Number(head.ContentLength||0),type=String(head.ContentType||'').split(';')[0]
    if(size<1||size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(type)){reply(res,400,{error:'invalid_proof_object'});return true}
    const client=await pool.connect()
    try{
      await client.query('BEGIN')
      const result=await client.query("UPDATE orders SET fulfillment_status='delivered',delivered_at=now(),delivery_proof_key=$3,updated_at=now() WHERE store_id=$1 AND id=$2 AND fulfillment_status='delivering' AND payment_status='paid' RETURNING id",[store.id,m[2],key])
      if(!result.rows.length){await client.query('ROLLBACK');reply(res,409,{error:'order_state_changed'});return true}
      await client.query("INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,$3,'delivering','delivered',NULL)",[store.id,m[2],subject])
      await client.query('COMMIT');reply(res,200,{ok:true,status:'delivered'});return true
    }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  }
  if (!list && !item && !action && !customer && !customerList) return false
  if (list && req.method !== 'GET' || item && req.method !== 'GET' || action && req.method !== 'POST' || customer && req.method !== 'GET' || customerList && req.method !== 'GET') { reply(res,405,{error:'method_not_allowed'}); return true }
  const subject = await authenticate(pool, req)
  if (!subject) { reply(res,401,{error:'login_required'}); return true }
  // PHASE35_CUSTOMER_ORDERS: list and detail never expose another customer's orders.
  if (customerList) {
    const {rows}=await pool.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.fulfillment_status AS "fulfillmentStatus",o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt",o.estimated_arrival AS "estimatedArrival"
      FROM orders o JOIN stores s ON s.id=o.store_id
      WHERE s.slug=$1 AND o.customer_subject=$2
      ORDER BY o.created_at DESC,o.id DESC LIMIT 100`,[customerList[1],subject])
    reply(res,200,{orders:rows,hasMore:rows.length===100});return true
  }
  if (customer) {
    const {rows} = await pool.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.fulfillment_status AS "fulfillmentStatus",o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt",o.estimated_arrival AS "estimatedArrival",o.contact_snapshot AS "contactSnapshot",o.delivery_slot_snapshot AS "deliverySlotSnapshot"
      FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.slug=$1 AND o.id=$2 AND o.customer_subject=$3`,[customer[1],customer[2],subject])
    if(!rows.length){reply(res,404,{error:'not_found'});return true}
    const lines=await pool.query(`SELECT oi.product_id AS "productId",oi.product_name AS "name",oi.unit_price_cents AS "unitPriceCents",oi.quantity,oi.line_total_cents AS "lineTotalCents" FROM order_items oi WHERE oi.order_id=$1 ORDER BY oi.id`,[rows[0].id])
    reply(res,200,{order:rows[0],items:lines.rows});return true
  }
  const slug = (list || item || action)[1]
  const store = await permittedStore(pool,subject,slug)
  if (!store) { reply(res,403,{error:'forbidden'}); return true }
  if (list) {
    const {rows}=await pool.query(`SELECT id,created_at AS "createdAt",payment_status AS "paymentStatus",fulfillment_status AS "fulfillmentStatus",total_cents AS "totalCents",delivered_at AS "deliveredAt",estimated_arrival AS "estimatedArrival"
      FROM orders WHERE store_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[store.id])
    // PHASE36_CLOUD_MERCHANT_ORDERS: provide the same read-only fields as existing merchant cards.
    const ids=rows.map(o=>o.id)
    const details=ids.length?await pool.query('SELECT id,contact_snapshot,delivery_slot_snapshot FROM orders WHERE store_id=$1 AND id=ANY($2::uuid[])',[store.id,ids]):{rows:[]}
    const lines=ids.length?await pool.query('SELECT order_id,product_name AS "name",quantity,line_total_cents AS "lineTotalCents" FROM order_items WHERE order_id=ANY($1::uuid[]) ORDER BY id',[ids]):{rows:[]}
    const snapshots=new Map(details.rows.map(r=>[r.id,r]))
    const enriched=rows.map(o=>({ ...o,
      contactSnapshot:snapshots.get(o.id)?.contact_snapshot||{},
      deliverySlotSnapshot:snapshots.get(o.id)?.delivery_slot_snapshot||{},
      items:lines.rows.filter(i=>i.order_id===o.id).map(i=>({name:i.name,quantity:i.quantity,subtotal:(Number(i.lineTotalCents)/100).toFixed(2)}))
    }))
    reply(res,200,{orders:enriched,pendingCount:rows.filter(r=>r.fulfillmentStatus==='new').length,hasMore:rows.length===100}); return true
  }
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
  const reason = typeof body.reason==='string' ? body.reason.trim() : ''
  const proofKey = typeof body.proofKey==='string' ? body.proofKey.trim() : ''
  if (['cancelled','abnormal'].includes(next) && (reason.length<1 || reason.length>200)) { reply(res,400,{error:'reason_required'}); return true }
  if (next==='delivered' && !/^delivery-proofs\/[a-zA-Z0-9/_-]{8,200}$/.test(proofKey)) { reply(res,400,{error:'delivery_proof_required'}); return true }
  const client=await pool.connect()
  try {
    await client.query('BEGIN')
    const {rows}=await client.query('SELECT fulfillment_status,payment_status FROM orders WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,action[2]])
    if (!rows.length) { await client.query('ROLLBACK'); reply(res,404,{error:'not_found'}); return true }
    const current=rows[0].fulfillment_status
    const allowed = steps[current]===next || (next==='cancelled' && ['new','accepted','preparing'].includes(current)) || (next==='abnormal' && current==='delivering')
    if (!allowed) { await client.query('ROLLBACK'); reply(res,409,{error:'invalid_transition',current}); return true }
    // No payment integration yet; do not allow marking unpaid orders as delivered.
    if (next==='delivered' && rows[0].payment_status!=='paid') { await client.query('ROLLBACK'); reply(res,409,{error:'payment_not_confirmed'}); return true }
    await client.query(`UPDATE orders SET fulfillment_status=$3,updated_at=now(), delivered_at=CASE WHEN $3='delivered' THEN now() ELSE delivered_at END,
      delivery_proof_key=CASE WHEN $3='delivered' THEN $4 ELSE delivery_proof_key END,
      issue_reason=CASE WHEN $3 IN ('cancelled','abnormal') THEN $5 ELSE issue_reason END WHERE store_id=$1 AND id=$2`,[store.id,action[2],next,proofKey||null,reason||null])
    await client.query('INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,$3,$4,$5,$6)',[store.id,action[2],subject,current,next,reason||null])
    await client.query('COMMIT')
    reply(res,200,{ok:true,status:next})
  } catch(e) { try { await client.query('ROLLBACK') } catch {} throw e } finally { client.release() }
  return true
}
).exec(url.pathname)
  if(proofReadCustomer||proofReadMerchant){
    if(req.method!=='GET'){reply(res,405,{error:'method_not_allowed'});return true}
    const who=await authenticate(pool,req)
    if(!who){reply(res,401,{error:'login_required'});return true}
    const m=proofReadCustomer||proofReadMerchant
    let rows
    if(proofReadMerchant){
      const store=await permittedStore(pool,who,m[1])
      if(!store){reply(res,403,{error:'forbidden'});return true}
      ;({rows}=await pool.query('SELECT delivery_proof_key FROM orders WHERE store_id=$1 AND id=$2 AND fulfillment_status=$3',[store.id,m[2],'delivered']))
    }else{
      ;({rows}=await pool.query('SELECT o.delivery_proof_key FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.slug=$1 AND o.id=$2 AND o.customer_subject=$3 AND o.fulfillment_status=$4',[m[1],m[2],who,'delivered']))
    }
    if(!rows.length){reply(res,404,{error:'proof_not_found'});return true}
    const key=rows[0].delivery_proof_key
    if(typeof key!=='string'||!/^delivery-proofs\/[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(key)){reply(res,404,{error:'proof_not_found'});return true}
    const {S3_BUCKET:Bucket,S3_ENDPOINT:endpoint,S3_ACCESS_KEY_ID:accessKeyId,S3_SECRET_ACCESS_KEY:secretAccessKey}=process.env
    if(!Bucket||!endpoint||!accessKeyId||!secretAccessKey){reply(res,503,{error:'object_storage_not_configured'});return true}
    const s3=new S3Client({region:process.env.S3_REGION||'auto',endpoint,credentials:{accessKeyId,secretAccessKey}})
    const url=await getSignedUrl(s3,new GetObjectCommand({Bucket,Key:key}),{expiresIn:180})
    reply(res,200,{url,expiresInSeconds:180});return true
  }
  // PHASE37B_PROOF: authorized order-scoped photo upload and completion.
  const proofMatch=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/proof-upload$').exec(url.pathname)
  const completeMatch=new RegExp('^/v1/merchant/stores/('+slugRe+')/orders/('+uuidRe+')/complete$').exec(url.pathname)
  if(proofMatch||completeMatch){
    if(req.method!=='POST'){reply(res,405,{error:'method_not_allowed'});return true}
    const m=proofMatch||completeMatch
    const subject=await authenticate(pool,req)
    if(!subject){reply(res,401,{error:'login_required'});return true}
    const store=await permittedStore(pool,subject,m[1])
    if(!store||!['owner','manager'].includes(store.role)){reply(res,403,{error:'forbidden'});return true}
    const {rows}=await pool.query('SELECT id,fulfillment_status,payment_status FROM orders WHERE store_id=$1 AND id=$2',[store.id,m[2]])
    if(!rows.length){reply(res,404,{error:'order_not_found'});return true}
    if(rows[0].fulfillment_status!=='delivering'){reply(res,409,{error:'not_delivering'});return true}
    let body;try{body=await readJson(req)}catch(e){reply(res,400,{error:'invalid_json'});return true}
    const bucket=process.env.S3_BUCKET,endpoint=process.env.S3_ENDPOINT,accessKeyId=process.env.S3_ACCESS_KEY_ID,secretAccessKey=process.env.S3_SECRET_ACCESS_KEY
    if(!bucket||!endpoint||!accessKeyId||!secretAccessKey){reply(res,503,{error:'object_storage_not_configured'});return true}
    const s3=new S3Client({region:process.env.S3_REGION||'auto',endpoint,credentials:{accessKeyId,secretAccessKey}})
    if(proofMatch){
      const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
      const ext=body&&types[body.contentType]
      if(!ext||!Number.isInteger(body.sizeBytes)||body.sizeBytes<1||body.sizeBytes>5*1024*1024){reply(res,400,{error:'invalid_image'});return true}
      const key='delivery-proofs/'+store.id+'/'+m[2]+'/'+randomUUID()+'.'+ext
      const uploadUrl=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:body.contentType}),{expiresIn:300})
      reply(res,200,{key,uploadUrl,contentType:body.contentType});return true
    }
    if(rows[0].payment_status!=='paid'){reply(res,409,{error:'payment_not_confirmed'});return true}
    const key=body&&body.proofKey
    const expected=new RegExp('^delivery-proofs/'+store.id+'/'+m[2]+'/[0-9a-f-]{36}\.(jpg|png|webp)$')
    if(typeof key!=='string'||!expected.test(key)){reply(res,400,{error:'invalid_proof_key'});return true}
    let head;try{head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}))}catch(e){if(e.name==='NotFound'||e.$metadata?.httpStatusCode===404){reply(res,400,{error:'proof_not_uploaded'});return true}throw e}
    const size=Number(head.ContentLength||0),type=String(head.ContentType||'').split(';')[0]
    if(size<1||size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(type)){reply(res,400,{error:'invalid_proof_object'});return true}
    const client=await pool.connect()
    try{
      await client.query('BEGIN')
      const result=await client.query("UPDATE orders SET fulfillment_status='delivered',delivered_at=now(),delivery_proof_key=$3,updated_at=now() WHERE store_id=$1 AND id=$2 AND fulfillment_status='delivering' AND payment_status='paid' RETURNING id",[store.id,m[2],key])
      if(!result.rows.length){await client.query('ROLLBACK');reply(res,409,{error:'order_state_changed'});return true}
      await client.query("INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,$3,'delivering','delivered',NULL)",[store.id,m[2],subject])
      await client.query('COMMIT');reply(res,200,{ok:true,status:'delivered'});return true
    }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  }
  if (!list && !item && !action && !customer && !customerList) return false
  if (list && req.method !== 'GET' || item && req.method !== 'GET' || action && req.method !== 'POST' || customer && req.method !== 'GET' || customerList && req.method !== 'GET') { reply(res,405,{error:'method_not_allowed'}); return true }
  const subject = await authenticate(pool, req)
  if (!subject) { reply(res,401,{error:'login_required'}); return true }
  // PHASE35_CUSTOMER_ORDERS: list and detail never expose another customer's orders.
  if (customerList) {
    const {rows}=await pool.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.fulfillment_status AS "fulfillmentStatus",o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt",o.estimated_arrival AS "estimatedArrival"
      FROM orders o JOIN stores s ON s.id=o.store_id
      WHERE s.slug=$1 AND o.customer_subject=$2
      ORDER BY o.created_at DESC,o.id DESC LIMIT 100`,[customerList[1],subject])
    reply(res,200,{orders:rows,hasMore:rows.length===100});return true
  }
  if (customer) {
    const {rows} = await pool.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.fulfillment_status AS "fulfillmentStatus",o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt",o.estimated_arrival AS "estimatedArrival",o.contact_snapshot AS "contactSnapshot",o.delivery_slot_snapshot AS "deliverySlotSnapshot"
      FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.slug=$1 AND o.id=$2 AND o.customer_subject=$3`,[customer[1],customer[2],subject])
    if(!rows.length){reply(res,404,{error:'not_found'});return true}
    const lines=await pool.query(`SELECT oi.product_id AS "productId",oi.product_name AS "name",oi.unit_price_cents AS "unitPriceCents",oi.quantity,oi.line_total_cents AS "lineTotalCents" FROM order_items oi WHERE oi.order_id=$1 ORDER BY oi.id`,[rows[0].id])
    reply(res,200,{order:rows[0],items:lines.rows});return true
  }
  const slug = (list || item || action)[1]
  const store = await permittedStore(pool,subject,slug)
  if (!store) { reply(res,403,{error:'forbidden'}); return true }
  if (list) {
    const {rows}=await pool.query(`SELECT id,created_at AS "createdAt",payment_status AS "paymentStatus",fulfillment_status AS "fulfillmentStatus",total_cents AS "totalCents",delivered_at AS "deliveredAt",estimated_arrival AS "estimatedArrival"
      FROM orders WHERE store_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[store.id])
    // PHASE36_CLOUD_MERCHANT_ORDERS: provide the same read-only fields as existing merchant cards.
    const ids=rows.map(o=>o.id)
    const details=ids.length?await pool.query('SELECT id,contact_snapshot,delivery_slot_snapshot FROM orders WHERE store_id=$1 AND id=ANY($2::uuid[])',[store.id,ids]):{rows:[]}
    const lines=ids.length?await pool.query('SELECT order_id,product_name AS "name",quantity,line_total_cents AS "lineTotalCents" FROM order_items WHERE order_id=ANY($1::uuid[]) ORDER BY id',[ids]):{rows:[]}
    const snapshots=new Map(details.rows.map(r=>[r.id,r]))
    const enriched=rows.map(o=>({ ...o,
      contactSnapshot:snapshots.get(o.id)?.contact_snapshot||{},
      deliverySlotSnapshot:snapshots.get(o.id)?.delivery_slot_snapshot||{},
      items:lines.rows.filter(i=>i.order_id===o.id).map(i=>({name:i.name,quantity:i.quantity,subtotal:(Number(i.lineTotalCents)/100).toFixed(2)}))
    }))
    reply(res,200,{orders:enriched,pendingCount:rows.filter(r=>r.fulfillmentStatus==='new').length,hasMore:rows.length===100}); return true
  }
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
  const reason = typeof body.reason==='string' ? body.reason.trim() : ''
  const proofKey = typeof body.proofKey==='string' ? body.proofKey.trim() : ''
  if (['cancelled','abnormal'].includes(next) && (reason.length<1 || reason.length>200)) { reply(res,400,{error:'reason_required'}); return true }
  if (next==='delivered' && !/^delivery-proofs\/[a-zA-Z0-9/_-]{8,200}$/.test(proofKey)) { reply(res,400,{error:'delivery_proof_required'}); return true }
  const client=await pool.connect()
  try {
    await client.query('BEGIN')
    const {rows}=await client.query('SELECT fulfillment_status,payment_status FROM orders WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,action[2]])
    if (!rows.length) { await client.query('ROLLBACK'); reply(res,404,{error:'not_found'}); return true }
    const current=rows[0].fulfillment_status
    const allowed = steps[current]===next || (next==='cancelled' && ['new','accepted','preparing'].includes(current)) || (next==='abnormal' && current==='delivering')
    if (!allowed) { await client.query('ROLLBACK'); reply(res,409,{error:'invalid_transition',current}); return true }
    // No payment integration yet; do not allow marking unpaid orders as delivered.
    if (next==='delivered' && rows[0].payment_status!=='paid') { await client.query('ROLLBACK'); reply(res,409,{error:'payment_not_confirmed'}); return true }
    await client.query(`UPDATE orders SET fulfillment_status=$3,updated_at=now(), delivered_at=CASE WHEN $3='delivered' THEN now() ELSE delivered_at END,
      delivery_proof_key=CASE WHEN $3='delivered' THEN $4 ELSE delivery_proof_key END,
      issue_reason=CASE WHEN $3 IN ('cancelled','abnormal') THEN $5 ELSE issue_reason END WHERE store_id=$1 AND id=$2`,[store.id,action[2],next,proofKey||null,reason||null])
    await client.query('INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,$3,$4,$5,$6)',[store.id,action[2],subject,current,next,reason||null])
    await client.query('COMMIT')
    reply(res,200,{ok:true,status:next})
  } catch(e) { try { await client.query('ROLLBACK') } catch {} throw e } finally { client.release() }
  return true
}
