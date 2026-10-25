import { createHash } from 'node:crypto'
const states=['new','accepted','preparing','delivering','delivered','cancelled','abnormal']
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const instant=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
function validDay(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v&&v>='2000-01-01'&&v<='2100-12-31'}
export async function merchantOrderCounts(db,storeId){
  const columns=states.map(s=>`COUNT(*) FILTER(WHERE fulfillment_status='${s}')::int AS "${s}"`).join(',')
  const {rows}=await db.query(`SELECT COUNT(*)::int AS "all",${columns} FROM orders WHERE store_id=$1`,[storeId])
  return {...rows[0],other:rows[0].cancelled+rows[0].abnormal}
}
// Authentication and store authorization are performed by orderWorkflowRoute before entry.
export async function merchantOrderQuery(req,res,url,pool,store,subject,reply){
  const input=url.searchParams, q=(input.get('q')||'').trim(),from=input.get('from')||'',to=input.get('to')||''
  const state=input.get('state')||'all', size=input.get('limit')||'30',limit=Number(size)
  if([...input.keys()].some(k=>!['q','from','to','state','limit','cursor'].includes(k)||input.getAll(k).length!==1)||
    (input.get('q')||'').length>100||!['all','latest','other',...states].includes(state)||!/^\d{1,3}$/.test(size)||limit<1||limit>100||
    (from||to)&&(!validDay(from)||!validDay(to)||from>to||Date.parse(to)-Date.parse(from)>=366*86400000)){
    reply(res,400,{error:'invalid_order_query'});return
  }
  const fingerprint=createHash('sha256').update(JSON.stringify([store.id,subject,q,from,to,state,limit])).digest('hex')
  let cursor=null
  if(input.has('cursor'))try{
    const raw=input.get('cursor');if(!raw||raw.length>2048||!/^[A-Za-z0-9_-]+$/.test(raw))throw Error()
    cursor=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'))
    if(cursor.v!==1||cursor.f!==fingerprint||typeof cursor.id!=='string'||!uuid.test(cursor.id)||typeof cursor.key!=='string'||!instant.test(cursor.key)||!Number.isFinite(Date.parse(cursor.key))||
      typeof cursor.at!=='string'||!instant.test(cursor.at)||!Number.isFinite(Date.parse(cursor.at))||typeof cursor.revision!=='string'||!/^[a-f0-9]{32}$/.test(cursor.revision))throw Error()
  }catch{reply(res,400,{error:'invalid_order_cursor_refresh'});return}
  const client=await pool.connect();let open=false
  try{
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true
    await client.query("SET LOCAL statement_timeout='5000ms'")
    const {rows:[clock]}=await client.query(`SELECT to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`)
    const asOf=cursor?cursor.at:clock.at
    if(cursor&&(Date.parse(asOf)>Date.parse(clock.at)||Date.parse(asOf)<Date.parse(clock.at)-1800000)){reply(res,409,{error:'orders_changed_or_cursor_expired_refresh'});return}
    const params=[store.id,asOf],clauses=['o.store_id=$1','o.created_at<=$2::timestamptz'],bind=v=>{params.push(v);return '$'+params.length}
    if(states.includes(state))clauses.push(`o.fulfillment_status=${bind(state)}`)
    else if(state==='other')clauses.push("o.fulfillment_status IN ('cancelled','abnormal')")
    if(from){const a=bind(from),b=bind(to);clauses.push(`o.created_at>=(${a}::date::timestamp AT TIME ZONE 'Asia/Shanghai') AND o.created_at<((${b}::date+1)::timestamp AT TIME ZONE 'Asia/Shanghai')`)}
    if(q){
      if(uuid.test(q))clauses.push(`o.id=${bind(q)}::uuid`)
      else {const p=bind('%'+q.replace(/[\\%_]/g,'\\$&')+'%');clauses.push(`(o.id::text ILIKE ${p} ESCAPE E'\\\\' OR o.contact_snapshot->>'receiverName' ILIKE ${p} ESCAPE E'\\\\' OR o.contact_snapshot->>'phone' ILIKE ${p} ESCAPE E'\\\\')`)}
    }
    // Version only the complete matching set, not the page. Newer orders beyond
    // asOf and unrelated status queues do not invalidate an ongoing traversal.
    const {rows:[version]}=await client.query(`SELECT COUNT(*)::int AS count,
      md5(coalesce(string_agg(o.id::text||':'||o.fulfillment_status||':'||extract(epoch FROM o.updated_at)::text,'|' ORDER BY o.id),'')) AS revision
      FROM orders o WHERE `+clauses.join(' AND '),params)
    if(cursor&&cursor.revision!==version.revision){reply(res,409,{error:'orders_changed_or_cursor_expired_refresh'});return}
    const counts=await merchantOrderCounts(client,store.id)
    if(cursor){const at=bind(cursor.key),id=bind(cursor.id);clauses.push(`(o.created_at,o.id)<(${at}::timestamptz,${id}::uuid)`)}
    const {rows}=await client.query(`SELECT o.merchant_note AS "merchantNote",o.merchant_note_version AS "merchantNoteVersion",o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.fulfillment_status AS "fulfillmentStatus",o.total_cents AS "totalCents",
      o.delivered_at AS "deliveredAt",o.estimated_arrival AS "estimatedArrival",o.issue_reason AS "issueReason",o.contact_snapshot AS "contactSnapshot",o.delivery_slot_snapshot AS "deliverySlotSnapshot",
      o.inventory_state AS "inventoryState",o.inventory_expires_at AS "inventoryExpiresAt",to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
      FROM orders o WHERE ${clauses.join(' AND ')} ORDER BY o.created_at DESC,o.id DESC LIMIT ${bind(limit+1)}`,params)
    const hasMore=rows.length>limit,page=rows.slice(0,limit),ids=page.map(o=>o.id)
    if(page.some(o=>!Number.isSafeInteger(Number(o.totalCents))||Number(o.totalCents)<0)){reply(res,413,{error:'order_amount_out_of_range'});return}
    const lines=ids.length?await client.query(`SELECT i.id AS "lineId",i.order_id,i.product_id AS "productId",i.product_name AS name,i.quantity,i.line_total_cents AS "lineTotalCents"
      FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.store_id=$1 AND o.id=ANY($2::uuid[]) ORDER BY i.id LIMIT 4001`,[store.id,ids]):{rows:[]}
    if(lines.rows.length>4000){reply(res,413,{error:'order_page_too_large_reduce_limit'});return}
    if(lines.rows.some(i=>!Number.isSafeInteger(Number(i.lineTotalCents))||Number(i.lineTotalCents)<0)){reply(res,413,{error:'order_amount_out_of_range'});return}
    await client.query('COMMIT');open=false
    const byId=new Map();for(const line of lines.rows){const a=byId.get(line.order_id)||[];a.push({lineId:line.lineId,productId:line.productId,name:line.name,quantity:line.quantity,subtotal:(Number(line.lineTotalCents)/100).toFixed(2)});byId.set(line.order_id,a)}
    const last=page[page.length-1],nextCursor=hasMore?Buffer.from(JSON.stringify({v:1,f:fingerprint,at:asOf,revision:version.revision,id:last.id,key:last.cursorAt})).toString('base64url'):null
    reply(res,200,{orders:page.map(o=>({...o,items:byId.get(o.id)||[]})),counts,pendingCount:counts.new,pendingStatus:'new',matchingCount:version.count,hasMore,nextCursor,asOf,
      canManage:['owner','manager'].includes(store.role)})
  }finally{if(open)await client.query('ROLLBACK').catch(()=>{});client.release()}
}
