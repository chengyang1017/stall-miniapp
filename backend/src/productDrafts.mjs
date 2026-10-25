const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Raw form values intentionally permit incomplete or temporarily invalid prices/dates.
const fields = { productName: 200, productDescription: 1000, selectedCategory: 100,
  priceText: 100, discountText: 100, startText: 100, endText: 100,
  scheduleDate: 20, scheduleTime: 20 }
export async function draftRoute(req, res, pool, store, id, body, send, imageExists, imageUrl) {
  if (req.method === 'GET' && id) {
    const {rows}=await pool.query("SELECT id,payload,version,created_at AS \"createdAt\",updated_at AS \"updatedAt\" FROM product_drafts WHERE store_id=$1 AND id=$2 AND state='draft'",[store.id,id])
    send(res,rows.length?200:404,rows.length?{draft:{...rows[0],imageUrl:imageUrl(rows[0].payload.imageObjectKey)}}:{error:'not_found'});return
  }
  if (req.method === 'GET' && !id) {
    const { rows } = await pool.query("SELECT id,payload,version,updated_at AS \"updatedAt\" FROM product_drafts WHERE store_id=$1 AND state='draft' ORDER BY updated_at DESC LIMIT 500", [store.id])
    send(res,200,{items:rows.map(row => ({...row, imageUrl:imageUrl(row.payload.imageObjectKey)}))}); return
  }
  if (id && req.method === 'DELETE') {
    if (!Number.isSafeInteger(body.expectedVersion)) { send(res,400,{error:'version_required'}); return }
    const { rowCount } = await pool.query("UPDATE product_drafts SET state='discarded',version=version+1,updated_at=now() WHERE store_id=$1 AND id=$2 AND version=$3 AND state='draft'", [store.id,id,body.expectedVersion])
    send(res,rowCount?200:409,rowCount?{ok:true}:{error:'draft_changed_reload'}); return
  }
  if (!((req.method === 'POST' && !id) || (req.method === 'PATCH' && id))) { send(res,405,{error:'method_not_allowed'}); return }
  const input = body.payload
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(fields).some(key => typeof input[key] !== 'string' || input[key].length > fields[key]) || ['isAvailable','isSoldOut','scheduleEnabled'].some(key => typeof input[key] !== 'boolean')) {
    send(res,400,{error:'invalid_draft'}); return
  }
  const key = input.imageObjectKey
  if (key !== null && (typeof key !== 'string' || !key.startsWith(`stores/${store.id}/products/`) || !/^stores\/[0-9a-f-]+\/products\/[0-9a-f-]+\.(jpg|png|webp)$/.test(key) || !await imageExists(key))) {
    send(res,400,{error:'invalid_draft_image'}); return
  }
  const payload = Object.fromEntries(Object.keys(fields).map(field => [field,input[field]]))
  if(input.stockMode !== undefined && !['finite','unlimited'].includes(input.stockMode)){send(res,400,{error:'invalid_draft_stock_mode'});return}
  payload.stockMode=input.stockMode || 'unlimited'
  for(const field of ['stockQuantityText','lowStockThresholdText']){
    if(input[field] !== undefined && (typeof input[field]!=='string'||input[field].length>100)){send(res,400,{error:'invalid_draft_stock_input'});return}
    payload[field]=input[field] === undefined ? (field==='stockQuantityText'?'0':'5') : input[field]
  }
  for (const field of ['discountStartUtc','discountEndUtc']) {
    if (!Object.hasOwn(input,field)) continue
    const value = input[field]
    if (value !== null && (typeof value !== 'string' || value.length > 100 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) {
      send(res,400,{error:'invalid_draft_promotion_snapshot'}); return
    }
    payload[field] = value
  }
  Object.assign(payload,{isAvailable:input.isAvailable,isSoldOut:input.isSoldOut,scheduleEnabled:input.scheduleEnabled,imageObjectKey:key})
  if (req.method === 'POST') {
    if (typeof body.clientKey !== 'string' || !/^[a-zA-Z0-9_-]{10,100}$/.test(body.clientKey)) { send(res,400,{error:'invalid_client_key'}); return }
    const { rows } = await pool.query(`INSERT INTO product_drafts(store_id,client_key,payload) VALUES($1,$2,$3::jsonb)
      ON CONFLICT(store_id,client_key) DO UPDATE SET client_key=EXCLUDED.client_key RETURNING id,version,state,payload=$3::jsonb AS same_payload`, [store.id,body.clientKey,JSON.stringify(payload)])
    if (rows[0].state !== 'draft') { send(res,409,{error:'draft_already_completed'}); return }
    if (!rows[0].same_payload) { send(res,409,{error:'draft_already_saved_reload',id:rows[0].id}); return }
    send(res,200,rows[0]); return
  }
  if (!uuid.test(id) || !Number.isSafeInteger(body.expectedVersion)) { send(res,400,{error:'version_required'}); return }
  const { rows } = await pool.query(`UPDATE product_drafts SET payload=$4::jsonb,version=version+1,updated_at=now()
    WHERE store_id=$1 AND id=$2 AND version=$3 AND state='draft' RETURNING id,version`,[store.id,id,body.expectedVersion,JSON.stringify(payload)])
  send(res,rows.length?200:409,rows.length?rows[0]:{error:'draft_changed_reload'})
}
