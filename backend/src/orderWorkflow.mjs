import { authenticate, permittedStore } from './auth.mjs'

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
  if (!list && !item && !action && !customer) return false
  if (list && req.method !== 'GET' || item && req.method !== 'GET' || action && req.method !== 'POST' || customer && req.method !== 'GET') { reply(res,405,{error:'method_not_allowed'}); return true }
  const subject = await authenticate(pool, req)
  if (!subject) { reply(res,401,{error:'login_required'}); return true }
  if (customer) {
    const {rows} = await pool.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.fulfillment_status AS "fulfillmentStatus",o.total_cents AS "totalCents",o.delivered_at AS "deliveredAt"
      FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.slug=$1 AND o.id=$2 AND o.customer_subject=$3`,[customer[1],customer[2],subject])
    reply(res,rows.length?200:404,rows.length?{order:rows[0]}:{error:'not_found'}); return true
  }
  const slug = (list || item || action)[1]
  const store = await permittedStore(pool,subject,slug)
  if (!store) { reply(res,403,{error:'forbidden'}); return true }
  if (list) {
    const {rows}=await pool.query(`SELECT id,created_at AS "createdAt",payment_status AS "paymentStatus",fulfillment_status AS "fulfillmentStatus",total_cents AS "totalCents",delivered_at AS "deliveredAt"
      FROM orders WHERE store_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[store.id])
    reply(res,200,{orders:rows,pendingCount:rows.filter(r=>r.fulfillmentStatus==='new').length,hasMore:rows.length===100}); return true
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
