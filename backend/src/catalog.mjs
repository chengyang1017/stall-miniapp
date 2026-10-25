import { randomUUID } from 'node:crypto'
import { authenticate, permittedStore } from './auth.mjs'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { publishedSql, validTimeZone, localPublishTime } from './productPublishing.mjs'
import { draftRoute } from './productDrafts.mjs'
import { inventoryColumns, configureInventory } from './inventory.mjs'
import { merchantProductSearch } from './merchantProductSearch.mjs'

const slugPattern = /^[a-z0-9][a-z0-9-]{1,62}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
function send(res,status,data) { res.writeHead(status,jsonHeaders); res.end(JSON.stringify(data)) }
async function readJson(req) {
  if (Number(req.headers['content-length'] || 0) > 16384) throw new Error('too_large')
  let raw = ''
  for await (const chunk of req) { raw += chunk.toString('utf8'); if(Buffer.byteLength(raw)>16384) throw new Error('too_large') }
  try { const obj = JSON.parse(raw); if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw Error(); return obj }
  catch { throw new Error('invalid_json') }
}
function text(value,max) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null }
function cents(v) { return Number.isSafeInteger(v) && v>=0 && v<=100000000 ? v : null }
function boolean(v) { return typeof v === 'boolean' ? v : null }
function jsonError(e,res) { return send(res,e.message==='too_large'?413:400,{error:e.message==='too_large'?'too_large':'invalid_payload'}) }
function objectClient() {
  if (!process.env.S3_BUCKET || !process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) return null
  return new S3Client({ region: process.env.S3_REGION || 'auto', endpoint: process.env.S3_ENDPOINT,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } })
}
async function imageExists(key) {
  if (key === null) return true
  const client = objectClient()
  if (!client) return false
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }))
    return (head.ContentLength || 0) > 0 && head.ContentLength <= 5 * 1024 * 1024 &&
      ['image/jpeg', 'image/png', 'image/webp'].includes(String(head.ContentType || '').split(';')[0])
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false
    throw e
  }
}
function imageUrl(key) {
  const base = (process.env.IMAGE_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
  return key && /^https:\/\/[^/]+/.test(base) ? `${base}/${key.split('/').map(encodeURIComponent).join('/')}` : null
}


export async function catalogRoute(req,res,url,pool) {
  const match = /^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/(categories|products|drafts|product-search|image-uploads)(?:\/([0-9a-f-]{36}))?$/.exec(url.pathname)
  if (!match) return false
  const [,slug,kind,id] = match
  if (!slugPattern.test(slug) || (id&&!uuidPattern.test(id))) { send(res,400,{error:'invalid_identifier'});return true }
  const subject = await authenticate(pool,req)
  if (!subject) { send(res,401,{error:'unauthorized'});return true }
  const store = await permittedStore(pool,subject,slug)
  if (!store) { send(res,403,{error:'forbidden'});return true }
  if (!['owner','manager'].includes(store.role)) { send(res,403,{error:'insufficient_role'});return true }
  const zoneResult = await pool.query('SELECT time_zone FROM stores WHERE id=$1',[store.id])
  const timeZone = zoneResult.rows[0]?.time_zone
  if (!validTimeZone(timeZone)) { send(res,503,{error:'invalid_store_time_zone'}); return true }
  if (kind === 'product-search') {
    if (id) { send(res,404,{error:'not_found'}); return true }
    await merchantProductSearch(req,res,url,pool,store,timeZone,send,imageUrl)
    return true
  }
  if (kind === 'drafts') {
    let draftBody = {}
    if (req.method !== 'GET') { try { draftBody = await readJson(req) } catch(e) { jsonError(e,res); return true } }
    await draftRoute(req,res,pool,store,id,draftBody,send,imageExists,imageUrl)
    return true
  }
  if (req.method === 'GET' && kind !== 'image-uploads' && (!id || kind === 'products')) {
    const table = kind==='categories' ? 'categories' : 'products'
    const columns = kind==='categories' ? 'id,name,sort_order AS "sortOrder"' : 'id,category_id AS "categoryId",name,price_cents AS "priceCents",active,sold_out AS "soldOut",image_object_key AS "imageObjectKey",description,discount_price_cents AS "discountPriceCents",discount_start AS "discountStart",discount_end AS "discountEnd",CASE WHEN discount_price_cents IS NOT NULL AND (discount_start IS NULL OR discount_start <= now()) AND (discount_end IS NULL OR discount_end > now()) THEN discount_price_cents ELSE price_cents END AS "effectivePriceCents"'
    const extra = kind === 'products' ? `,${inventoryColumns('products')},publish_at AS "publishAt",version,${publishedSql('products')} AS "effectiveActive"` : ''
    const {rows}=await pool.query(`SELECT ${columns}${extra} FROM ${table} WHERE store_id=$1 ${id?'AND id=$2':''} ORDER BY ${kind==='categories'?'sort_order,name':'created_at DESC'} ${kind==='products'?'LIMIT 500':''}`,id?[store.id,id]:[store.id])
    if(id) { send(res,rows.length?200:404,rows.length?{product:{...rows[0],imageUrl:imageUrl(rows[0].imageObjectKey)}}:{error:'not_found'});return true }
    send(res,200,{timeZone,items:kind==='products' ? rows.map(p=>({...p,imageUrl:imageUrl(p.imageObjectKey)})) : rows});return true
  }
  if (!['POST','PATCH','DELETE'].includes(req.method)) { send(res,405,{error:'method_not_allowed'});return true }
  if (kind==='image-uploads') {
    if (req.method!=='POST'||id) {send(res,405,{error:'method_not_allowed'});return true}
    let body;try{body=await readJson(req)}catch(e){jsonError(e,res);return true}
    const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
    const ext=types[body.contentType]
    if(!ext||!Number.isInteger(body.sizeBytes)||body.sizeBytes<1||body.sizeBytes>5*1024*1024){send(res,400,{error:'invalid_image'});return true}
    if(!process.env.S3_BUCKET||!process.env.S3_ENDPOINT||!process.env.S3_ACCESS_KEY_ID||!process.env.S3_SECRET_ACCESS_KEY){send(res,503,{error:'object_storage_not_configured'});return true}
    const key=`stores/${store.id}/products/${randomUUID()}.${ext}`
    const client=objectClient()
    const command=new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,ContentType:body.contentType})
    const uploadUrl=await getSignedUrl(client,command,{expiresIn:300})
    send(res,200,{key,uploadUrl,contentType:body.contentType,expiresIn:300,maxBytes:5*1024*1024});return true
  }
  let body={}
  if(req.method!=='DELETE'){try{body=await readJson(req)}catch(e){jsonError(e,res);return true}}
  if (kind==='categories') {
    if(req.method==='POST' && !id){
      const name=text(body.name,100)
      const sortOrder=body.sortOrder===undefined?0:body.sortOrder
      if(!name||!Number.isInteger(sortOrder)||Math.abs(sortOrder)>100000){send(res,400,{error:'invalid_category'});return true}
      const {rows}=await pool.query('INSERT INTO categories(store_id,name,sort_order) VALUES($1,$2,$3) RETURNING id,name,sort_order AS "sortOrder"',[store.id,name,sortOrder]);send(res,201,{category:rows[0]});return true
    }
    if(id && req.method==='PATCH'){
      const name=text(body.name,100)
      if(!name){send(res,400,{error:'invalid_category'});return true}
      const {rows}=await pool.query('UPDATE categories SET name=$3 WHERE store_id=$1 AND id=$2 RETURNING id,name',[store.id,id,name]);send(res,rows.length?200:404,rows.length?{category:rows[0]}:{error:'not_found'});return true
    }
    if(id && req.method==='DELETE'){
      try {const {rowCount}=await pool.query('DELETE FROM categories WHERE store_id=$1 AND id=$2',[store.id,id]);send(res,rowCount?200:404,rowCount?{ok:true}:{error:'not_found'})}
      catch(e){if(e.code==='23503')send(res,409,{error:'category_has_products'});else throw e}return true
    }
  }
  if(kind==='products'){
    // Narrow PATCHes preserve all unrelated fields, including concurrent edits.
    const patchColumns = { active: 'active', soldOut: 'sold_out', categoryId: 'category_id' }
    const patchKeys = Object.keys(body)
    if (req.method === 'PATCH' && id && patchKeys.length > 0 && patchKeys.every(key => Object.hasOwn(patchColumns, key))) {
      if (patchKeys.some(key => key === 'categoryId'
        ? typeof body[key] !== 'string' || !uuidPattern.test(body[key])
        : typeof body[key] !== 'boolean')) {
        send(res,400,{error:'invalid_product_patch'});return true
      }
      try {
        const values = [store.id, id, ...patchKeys.map(key => body[key])]
        const assignments = patchKeys.map((key,index) => `${patchColumns[key]}=$${index + 3}`)
        if (Object.hasOwn(body,'active')) assignments.push('publish_at=NULL')
        // The existing composite FK rejects categories from any other store.
        const { rows } = await pool.query(`UPDATE products SET ${assignments.join(',')},version=version+1,updated_at=now() WHERE store_id=$1 AND id=$2 ${body.active === true ? 'AND (publish_at IS NULL OR publish_at <= statement_timestamp())' : ''} RETURNING id`, values)
        send(res,rows.length?200:409,rows.length?{id:rows[0].id}:{error:'not_found_or_pending_schedule'})
      } catch(e) { if(e.code==='23503')send(res,400,{error:'invalid_category'});else throw e }
      return true
    }
    if((req.method==='POST'&&!id)||(req.method==='PATCH'&&id)){
      const name=text(body.name,200),price=cents(body.priceCents),active=boolean(body.active),soldOut=boolean(body.soldOut)
      const categoryId=body.categoryId===null?null:(typeof body.categoryId==='string'&&uuidPattern.test(body.categoryId)?body.categoryId:undefined)
      const imageKey=body.imageObjectKey===null?null:body.imageObjectKey
      const validKey=imageKey===null||(typeof imageKey==='string'&&imageKey.startsWith(`stores/${store.id}/products/`)&&/^stores\/[0-9a-f-]+\/products\/[0-9a-f-]+\.(jpg|png|webp)$/.test(imageKey))
      if(!name||price===null||active===null||soldOut===null||categoryId===undefined||!validKey){send(res,400,{error:'invalid_product'});return true}
      const description = body.description === undefined ? undefined : (typeof body.description === 'string' && body.description.length <= 1000 ? body.description : false)
      const discountPrice = body.discountPriceCents === undefined ? undefined : (body.discountPriceCents === null ? null : cents(body.discountPriceCents))
      const parseTime = v => v === null ? null : (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : false)
      const start = body.discountStart === undefined ? undefined : parseTime(body.discountStart)
      const end = body.discountEnd === undefined ? undefined : parseTime(body.discountEnd)
      if (description === false || (discountPrice === null && body.discountPriceCents !== null) || start === false || end === false || (start && end && Date.parse(start)>=Date.parse(end))) {send(res,400,{error:'invalid_promotion'});return true}
      if (discountPrice !== undefined && discountPrice !== null && discountPrice >= price) {send(res,400,{error:'invalid_discount_price'});return true}
      if (imageKey !== null && !await imageExists(imageKey)) { send(res,400,{error:'image_not_uploaded'});return true }
      const scheduleChanged = Object.hasOwn(body,'publishLocalTime') || body.cancelSchedule === true
      let publishAt = null
      if (body.publishLocalTime != null) {
        try {
          if (body.publishTimeZone !== timeZone || active) throw Error('invalid_schedule')
          publishAt = localPublishTime(body.publishLocalTime,timeZone)
        } catch(e) { send(res,400,{error:e.message}); return true }
      }
      if (body.sourceDraftId !== undefined && (!uuidPattern.test(body.sourceDraftId) || !Number.isSafeInteger(body.expectedDraftVersion) || id)) { send(res,400,{error:'invalid_source_draft'});return true }
      if (body.sourceDraftId && !categoryId) { send(res,400,{error:'category_required_to_publish'});return true }
      const publishPayload = JSON.stringify({name,categoryId,price,active,soldOut,imageKey,description:description??'',discountPrice:discountPrice??null,start:start??null,end:end??null,publishAt,inventory:body.inventory??null})
      // Locks and versions prevent an old form from reviving a cancelled schedule.
      const client = await pool.connect()
      try{
        await client.query('BEGIN')
        if (body.sourceDraftId) {
          const draft = await client.query('SELECT state,version,published_product_id,publish_payload=$3::jsonb AS same_payload FROM product_drafts WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,body.sourceDraftId,publishPayload])
          const row = draft.rows[0]
          if (row?.state === 'published') {
            await client.query('COMMIT')
            send(res,row.same_payload?200:409,row.same_payload?{id:row.published_product_id}:{error:'draft_already_published_reload'});return true
          }
          if (!row || row.state !== 'draft' || row.version !== body.expectedDraftVersion) { await client.query('ROLLBACK');send(res,409,{error:'draft_changed_reload'});return true }
        }
        if (id) {
          const current = await client.query('SELECT version,publish_at,publish_at > statement_timestamp() AS pending FROM products WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,id])
          if (!current.rows.length) { await client.query('ROLLBACK');send(res,404,{error:'not_found'});return true }
          if (active && current.rows[0].pending && body.cancelSchedule !== true) {
            await client.query('ROLLBACK');send(res,409,{error:'cancel_schedule_explicitly_first'});return true
          }
          if ((body.expectedVersion !== undefined && body.expectedVersion !== current.rows[0].version) ||
            ((publishAt || current.rows[0].publish_at) && body.expectedVersion === undefined)) {
            await client.query('ROLLBACK');send(res,409,{error:'product_changed_reload'});return true
          }
          // Omitting schedule controls preserves the existing plan, even if it
          // became effective while the merchant was editing another field.
          if (!scheduleChanged && current.rows[0].publish_at) publishAt = new Date(current.rows[0].publish_at).toISOString()
        }
        // Validate against database time immediately before writing, after locks.
        if (publishAt && scheduleChanged) {
          const future = await client.query('SELECT $1::timestamptz > clock_timestamp() AS valid',[publishAt])
          if (!future.rows[0].valid) { await client.query('ROLLBACK');send(res,400,{error:'publish_time_must_be_future'});return true }
        }
        const values=[store.id,categoryId,name,price,publishAt ? false : active,soldOut,imageKey]
        const descValue=description===undefined?'':description
        const discValue=discountPrice===undefined?null:discountPrice
        const startValue=start===undefined?null:start
        const endValue=end===undefined?null:end
        const sql=req.method==='POST'
          ? `INSERT INTO products(store_id,category_id,name,price_cents,active,sold_out,image_object_key,description,discount_price_cents,discount_start,discount_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`
          : `UPDATE products SET category_id=$2,name=$3,price_cents=$4,active=$5,sold_out=$6,image_object_key=$7,publish_at=NULL,
              description=CASE WHEN $9::boolean THEN $10 ELSE description END,
              discount_price_cents=CASE WHEN $11::boolean THEN $12::integer ELSE discount_price_cents END,
              discount_start=CASE WHEN $13::boolean THEN $14::timestamptz ELSE discount_start END,
              discount_end=CASE WHEN $15::boolean THEN $16::timestamptz ELSE discount_end END,
              updated_at=now() WHERE store_id=$1 AND id=$8 RETURNING id`
        const args=req.method==='POST'?[...values,descValue,discValue,startValue,endValue]:[...values,id,description!==undefined,descValue,discountPrice!==undefined,discValue,start!==undefined,startValue,end!==undefined,endValue]
        const {rows}=await client.query(sql,args)
        if (rows.length) {
          if (body.inventory !== undefined) {
            const stockProduct=await client.query('SELECT * FROM products WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,rows[0].id])
            await configureInventory(client,stockProduct.rows[0],body.inventory,subject,!id)
          }
          await client.query('UPDATE products SET publish_at=$3,version=version+1 WHERE store_id=$1 AND id=$2',[store.id,rows[0].id,publishAt])
          if (body.sourceDraftId) await client.query("UPDATE product_drafts SET state='published',published_product_id=$3,publish_payload=$4::jsonb,version=version+1,updated_at=now() WHERE store_id=$1 AND id=$2",[store.id,body.sourceDraftId,rows[0].id,publishPayload])
        }
        await client.query('COMMIT')
        send(res,rows.length?(req.method==='POST'?201:200):404,rows.length?{id:rows[0].id}:{error:'not_found'})
      }catch(e){await client.query('ROLLBACK');if(e.inventoryError)send(res,409,{error:e.message});else if(e.code==='23503'||e.code==='23514')send(res,400,{error:'invalid_product_or_category'});else throw e}finally{client.release()}return true
    }
    if(req.method==='DELETE'&&id){
      // Soft-delete preserves historical order data and avoids accidental erasure.
      const {rowCount}=await pool.query('UPDATE products SET active=false,publish_at=NULL,version=version+1,updated_at=now() WHERE store_id=$1 AND id=$2',[store.id,id]);send(res,rowCount?200:404,rowCount?{ok:true}:{error:'not_found'});return true
    }
  }
  send(res,405,{error:'method_not_allowed'});return true
}
