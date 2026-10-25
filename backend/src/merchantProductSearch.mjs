import { createHash } from 'node:crypto'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const choices = {
  kind: ['all','product','draft'], state: ['all','active','inactive','scheduled'],
  soldOut: ['all','yes','no'], stockMode: ['all','finite','unlimited'],
  stockState: ['all','low','zero'], discount: ['all','yes','no'],
  sort: ['created','updated','name','priceAsc','priceDesc','stockAsc','stockDesc','scheduled']
}
// Drafts intentionally allow invalid raw inputs. Only safe, complete numbers participate in sorting/filtering.
const draftNumber = (field, money = false) => `CASE WHEN payload->>'${field}' ~ '${money ? '^[0-9]{1,7}([.][0-9]{1,2})?$' : '^[0-9]{1,7}$'}' THEN CASE WHEN (payload->>'${field}')::numeric<=1000000 THEN (payload->>'${field}')::numeric ${money ? '*100' : ''} END ELSE NULL END`
const productJson = `jsonb_build_object('id',p.id,'categoryId',p.category_id,'name',p.name,'priceCents',p.price_cents,
  'active',p.active,'soldOut',p.sold_out,'imageObjectKey',p.image_object_key,'description',p.description,
  'discountPriceCents',p.discount_price_cents,'discountStart',p.discount_start,'discountEnd',p.discount_end,
  'publishAt',p.publish_at,'version',p.version,'effectiveActive',coalesce(p.active OR p.publish_at <= $2::timestamptz,false),
  'stockMode',p.stock_mode,'stockQuantity',p.stock_quantity,'lowStockThreshold',p.low_stock_threshold,'inventoryVersion',p.inventory_version,
  'createdAt',p.created_at,'updatedAt',p.updated_at)`

// Called only after catalogRoute has authenticated the merchant and verified store/owner-or-manager access.
export async function merchantProductSearch(req,res,url,pool,store,timeZone,send,imageUrl) {
  if (req.method !== 'GET') { send(res,405,{error:'method_not_allowed'}); return }
  const input = url.searchParams, q = (input.get('q') || '').trim()
  const query = { q, categoryId: (input.get('categoryId') || '').toLowerCase() }
  const allowed = ['q','categoryId','limit','cursor',...Object.keys(choices)]
  if ([...input.keys()].some(k => !allowed.includes(k) || input.getAll(k).length !== 1) || (input.get('q') || '').length > 100 ||
      (query.categoryId && !uuid.test(query.categoryId))) { send(res,400,{error:'invalid_search'}); return }
  for (const [key, values] of Object.entries(choices)) {
    query[key] = input.get(key) || (key === 'sort' ? 'created' : 'all')
    if (!values.includes(query[key])) { send(res,400,{error:'invalid_filter_or_sort'}); return }
  }
  const size = input.get('limit') || '30'
  if (!/^\d{1,3}$/.test(size) || Number(size)<1 || Number(size)>100) { send(res,400,{error:'invalid_page_size'}); return }
  const limit = Number(size)
  const fingerprint = createHash('sha256').update(JSON.stringify([store.id,query,limit])).digest('hex')
  let cursor = null, asOf = new Date().toISOString()
  if (input.has('cursor')) {
    try {
      const raw = input.get('cursor')
      if (!raw || raw.length>4096 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw Error()
      cursor = JSON.parse(Buffer.from(raw,'base64url').toString('utf8'))
      if (cursor.v!==1 || cursor.f!==fingerprint || typeof cursor.id!=='string' || !uuid.test(cursor.id) || !['product','draft'].includes(cursor.kind) ||
          !(cursor.key===null || (typeof cursor.key==='string' && cursor.key.length<=500)) ||
          typeof cursor.at!=='string' || cursor.at.length>100 || !Number.isFinite(Date.parse(cursor.at)) || typeof cursor.revision!=='string' || !/^[0-9a-f]{96}$/.test(cursor.revision)) throw Error()
      asOf=cursor.at
    } catch { send(res,400,{error:'invalid_or_expired_cursor_refresh'}); return }
  }
  const client=await pool.connect()
  let transactionOpen=false
  try {
    // Each page uses a short read-only snapshot. A revision guard rejects later pages if
    // membership, sort fields or stock changed, rather than silently skipping moved rows.
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    transactionOpen=true
    const {rows:[snapshot]}=await client.query(`SELECT to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at,
      (SELECT md5(coalesce(string_agg(id::text||':'||version||':'||inventory_version||':'||extract(epoch FROM updated_at)::text,'|' ORDER BY id),'')) FROM products WHERE store_id=$1) ||
      (SELECT md5(coalesce(string_agg(id::text||':'||version,'|' ORDER BY id),'')) FROM product_drafts WHERE store_id=$1 AND state='draft') ||
      (SELECT md5(coalesce(string_agg(id::text||':'||name,'|' ORDER BY id),'')) FROM categories WHERE store_id=$1) AS revision`,[store.id])
    const databaseNow=new Date(snapshot.at).getTime()
    if(cursor && (Date.parse(cursor.at)>databaseNow || Date.parse(cursor.at)<databaseNow-1800000 || cursor.revision!==snapshot.revision)) {
      await client.query('ROLLBACK');transactionOpen=false
      send(res,409,{error:'catalog_changed_or_cursor_expired_refresh'});return
    }
    if(!cursor)asOf=snapshot.at
    const params=[store.id,asOf], bind=value=>{params.push(value);return '$'+params.length}
    const filters=[]
    if(query.kind!=='all')filters.push(`kind=${bind(query.kind)}`)
    if(query.state!=='all')filters.push(`kind='product' AND ${query.state==='active'?'published':query.state==='scheduled'?'pending':'NOT published AND NOT pending'}`)
    if(query.soldOut!=='all')filters.push(`kind='product' AND manual_sold_out=${bind(query.soldOut==='yes')}`)
    if(query.stockMode!=='all')filters.push(`stock_mode=${bind(query.stockMode)}`)
    if(query.stockState!=='all')filters.push(`stock_mode='finite' AND ${query.stockState==='zero'?'stock_quantity=0':'stock_quantity>0 AND stock_quantity<=threshold'}`)
    if(query.discount!=='all')filters.push(`has_discount=${bind(query.discount==='yes')}`)
    if(query.categoryId)filters.push(`category_id=${bind(query.categoryId)}`)
    if(q) {
      // Escape LIKE metacharacters: a literal % or _ is not a wildcard supplied by the client.
      const exact=bind(q.toLowerCase())
      if(uuid.test(q))filters.push(`id::text=${exact}`)
      else {
        const pattern=bind('%'+q.replace(/[\\%_]/g,'\\$&')+'%')
        filters.push(`(name ILIKE ${pattern} ESCAPE E'\\\\' OR category_name ILIKE ${pattern} ESCAPE E'\\\\' OR id::text=${exact})`)
      }
    }
    const sorts={created:'created_at',updated:'updated_at',name:'lower(name)',priceAsc:'price',priceDesc:'price',stockAsc:"CASE WHEN stock_mode='finite' THEN stock_quantity END",stockDesc:"CASE WHEN stock_mode='finite' THEN stock_quantity END",scheduled:'publish_at'}
    const sort=query.sort, descending=['created','updated','priceDesc','stockDesc'].includes(sort)
    // A single text key keeps cursors portable; numeric keys are padded and timestamp keys are UTC.
    let expression=sorts[sort]
    if(['created','updated','scheduled'].includes(sort)) expression=`to_char(${expression} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')`
    else if(sort!=='name') expression=`lpad((${expression})::bigint::text,20,'0')`
    const seek=[]
    if(cursor) {
      const kind=bind(cursor.kind), id=bind(cursor.id)
      const tail=`(kind COLLATE "C",id)>(${kind}::text COLLATE "C",${id}::uuid)`
      if(cursor.key===null)seek.push(`sort_key IS NULL AND ${tail}`)
      else {
        const key=bind(cursor.key)
        seek.push(`(sort_key ${descending?'<':'>'} ${key} COLLATE "C" OR (sort_key=${key} COLLATE "C" AND ${tail}) OR sort_key IS NULL)`)
      }
    }
    const sql=`WITH catalog AS (
      SELECT 'product'::text AS kind,p.id,p.name,p.category_id::text AS category_id,c.name AS category_name,p.price_cents::numeric AS price,
        p.stock_mode,p.stock_quantity::numeric AS stock_quantity,p.low_stock_threshold::numeric AS threshold,
        (p.discount_price_cents IS NOT NULL AND p.discount_price_cents<p.price_cents) AS has_discount,
        coalesce(p.active OR p.publish_at<=$2::timestamptz,false) AS published,
        (p.publish_at>$2::timestamptz) IS TRUE AS pending,p.sold_out AS manual_sold_out,
        p.created_at,p.updated_at,p.publish_at,${productJson} AS data
      FROM products p LEFT JOIN categories c ON c.store_id=p.store_id AND c.id=p.category_id
      WHERE p.store_id=$1 AND p.created_at<=$2::timestamptz
      UNION ALL
      SELECT 'draft',d.id,coalesce(d.payload->>'productName',''),d.payload->>'selectedCategory',c.name,${draftNumber('priceText',true)},
        coalesce(d.payload->>'stockMode','unlimited'),${draftNumber('stockQuantityText')},${draftNumber('lowStockThresholdText')},
        coalesce(${draftNumber('discountText',true)}<${draftNumber('priceText',true)},false),false,false,false,
        d.created_at,d.updated_at,NULL::timestamptz,jsonb_build_object('id',d.id,'payload',d.payload,'version',d.version,'createdAt',d.created_at,'updatedAt',d.updated_at)
      FROM product_drafts d LEFT JOIN categories c ON c.store_id=d.store_id AND c.id::text=d.payload->>'selectedCategory'
      WHERE d.store_id=$1 AND d.state='draft' AND d.created_at<=$2::timestamptz
    ), filtered AS (SELECT * FROM catalog ${filters.length?'WHERE '+filters.map(f=>'('+f+')').join(' AND '):''}),
    ordered AS (SELECT *,(${expression}) COLLATE "C" AS sort_key FROM filtered)
    SELECT kind,id,data,sort_key FROM ordered ${seek.length?'WHERE '+seek.join(' AND '):''}
    ORDER BY sort_key ${descending?'DESC':'ASC'} NULLS LAST,kind COLLATE "C" ASC,id ASC LIMIT ${bind(limit+1)}`
    const {rows}=await client.query(sql,params)
    await client.query('COMMIT');transactionOpen=false
    const hasMore=rows.length>limit, page=rows.slice(0,limit), last=page[page.length-1]
    const items=page.map(row=>({kind:row.kind,...row.kind==='product'
      ? {product:{...row.data,imageUrl:imageUrl(row.data.imageObjectKey)}}
      : {draft:{...row.data,imageUrl:imageUrl(row.data.payload.imageObjectKey)}}}))
    const nextCursor=hasMore&&last?Buffer.from(JSON.stringify({v:1,f:fingerprint,at:asOf,revision:snapshot.revision,key:last.sort_key,kind:last.kind,id:last.id})).toString('base64url'):null
    send(res,200,{items,nextCursor,hasMore,timeZone,asOf})
  } finally {
    if(transactionOpen)await client.query('ROLLBACK').catch(()=>{})
    client.release()
  }
}
