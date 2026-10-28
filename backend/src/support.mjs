import { authenticate, permittedStore } from './auth.mjs'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const send = (res,status,body) => { res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body)) }
const fail = (status,error) => { throw Object.assign(new Error(error),{status}) }
async function body(req) {
  let size=0;const chunks=[]
  for await (const chunk of req) {size+=chunk.length;if(size>4096)fail(413,'body_too_large');chunks.push(chunk)}
  try { const b=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!b||Array.isArray(b)||typeof b!=='object')fail(400,'invalid_body');return b } catch(e) {if(e.status)throw e;fail(400,'invalid_json')}
}
const projection = `id,seq::text AS seq,sender_role AS sender,client_key AS "clientKey",content,created_at AS "createdAt"`
export async function supportRoute(req,res,url,pool) {
  const match=/^\/v1\/(merchant\/)?stores\/([a-z0-9][a-z0-9-]{1,62})\/support(?:\/(.*))?$/.exec(url.pathname)
  if(!match)return false
  let db
  try {
    const subject=await authenticate(pool,req);if(!subject)fail(401,'unauthorized')
    const merchant=!!match[1],role=merchant?'merchant':'customer',tail=match[3]||'conversation'
    const store=merchant?await permittedStore(pool,subject,match[2]):(await pool.query('SELECT id FROM stores WHERE slug=$1 AND is_active=true',[match[2]])).rows[0]
    if(!store)fail(merchant?403:404,merchant?'forbidden':'store_not_found')
    if(!['GET','POST'].includes(req.method))fail(405,'method_not_allowed')
    const params=url.searchParams,allowed=new Set(req.method==='POST'?[]:tail==='conversations'?['limit','cursor']:tail==='unread'||tail==='conversation'?[]:['limit','before','after'])
    for(const k of params.keys())if(!allowed.has(k)||params.getAll(k).length!==1)fail(400,'invalid_query')
    const rawLimit=params.get('limit')||'30',limit=Number(rawLimit);if(!/^\d{1,3}$/.test(rawLimit)||limit<1||limit>100)fail(400,'invalid_limit')
    db=await pool.connect();await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'")
    if(req.method==='GET'&&tail==='unread') {
      const read=merchant?'merchant_read_seq':'customer_read_seq',opposite=merchant?'customer':'merchant'
      const r=await db.query(`SELECT count(*)::int AS unread FROM support_messages m JOIN support_conversations c ON c.id=m.conversation_id WHERE c.store_id=$1 AND ($2::boolean OR c.customer_subject=$3) AND m.sender_role=$4 AND m.seq>c.${read}`,[store.id,merchant,subject,opposite])
      await db.query('COMMIT');send(res,200,r.rows[0]);return true
    }
    if(merchant&&tail==='conversations'&&req.method==='GET') {
      let cursor=null
      if(params.has('cursor')) {try {const raw=params.get('cursor');if(raw.length>1024||!raw)throw Error();cursor=JSON.parse(Buffer.from(raw,'base64url'));if(!uuid.test(cursor.id)||typeof cursor.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at)||!Number.isFinite(Date.parse(cursor.at))||new Date(cursor.at).toISOString().slice(0,23)!==cursor.at.slice(0,23)||!/^[0-9a-f]{32}$/.test(cursor.rev)||cursor.store!==store.id)throw Error()}catch{fail(400,'invalid_cursor')}}
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
      const rev=(await db.query("SELECT md5(coalesce(string_agg(id::text||':'||last_seq::text,',' ORDER BY id),'')) AS rev FROM support_conversations WHERE store_id=$1",[store.id])).rows[0].rev
      if(cursor&&cursor.rev!==rev)fail(409,'inbox_changed_refresh')
      const r=await db.query(`SELECT c.id,c.status,c.last_seq::text AS "lastSeq",c.last_message_at AS "lastMessageAt",to_char(c.last_message_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at,
        (SELECT content FROM support_messages WHERE conversation_id=c.id ORDER BY seq DESC LIMIT 1) AS preview,
        (SELECT count(*)::int FROM support_messages WHERE conversation_id=c.id AND sender_role='customer' AND seq>c.merchant_read_seq) AS unread
        FROM support_conversations c WHERE store_id=$1 AND ($2::timestamptz IS NULL OR (last_message_at,id)<($2::timestamptz,$3::uuid)) ORDER BY last_message_at DESC,id DESC LIMIT $4`,[store.id,cursor?.at||null,cursor?.id||null,limit+1])
      const more=r.rows.length>limit,rows=r.rows.slice(0,limit),last=rows.at(-1)
      await db.query('COMMIT');send(res,200,{conversations:rows,hasMore:more,nextCursor:more?Buffer.from(JSON.stringify({at:last.at,id:last.id,rev,store:store.id})).toString('base64url'):null});return true
    }
    const detail=merchant?/^conversations\/([0-9a-f-]{36})\/(messages|read)$/.exec(tail):/^(messages|read|conversation)$/.exec(tail)
    if(!detail)fail(404,'not_found')
    const action=merchant?detail[2]:detail[1],id=merchant?detail[1]:null
    if(id&&!uuid.test(id))fail(400,'invalid_conversation')
    let b=null
    if(req.method==='POST') {b=await body(req);if(Object.keys(b).some(k=>!(action==='read'?['through']:['content','clientKey']).includes(k)))fail(400,'invalid_fields')}
    if(action==='messages'&&req.method==='POST') {
      if(typeof b.content!=='string'||!b.content.trim()||[...b.content.trim()].length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff]/u.test(b.content)||typeof b.clientKey!=='string'||!uuid.test(b.clientKey))fail(400,'invalid_message')
      // Serialize this sender across all conversations: DB-wide, survives process restarts.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['support:'+subject])
      if(!merchant)await db.query('INSERT INTO support_conversations(store_id,customer_subject) VALUES($1,$2) ON CONFLICT(store_id,customer_subject) DO NOTHING',[store.id,subject])
    }
    const c=(await db.query(`SELECT * FROM support_conversations WHERE store_id=$1 AND ${merchant?'id=$2':'customer_subject=$2'} FOR UPDATE`,[store.id,id||subject])).rows[0]
    if(!c) {if(!merchant&&req.method==='GET') {await db.query('COMMIT');send(res,200,action==='conversation'?{conversation:null}:{messages:[],hasMore:false,conversation:null});return true}fail(404,'conversation_not_found')}
    if(action==='conversation'&&req.method==='GET') {await db.query('COMMIT');send(res,200,{conversation:{id:c.id,status:c.status,lastSeq:c.last_seq}});return true}
    if(action==='messages'&&req.method==='POST') {
      const previous=(await db.query(`SELECT ${projection} FROM support_messages WHERE conversation_id=$1 AND sender_subject=$2 AND client_key=$3`,[c.id,subject,b.clientKey])).rows[0]
      if(previous) {if(previous.content!==b.content.trim()||previous.sender!==role)fail(409,'idempotency_conflict');await db.query('COMMIT');send(res,200,{message:previous,conversationId:c.id});return true}
      if(c.status!=='open')fail(409,'conversation_closed')
      const count=Number((await db.query("SELECT count(*) AS n FROM support_messages WHERE sender_subject=$1 AND created_at>clock_timestamp()-interval '1 minute'",[subject])).rows[0].n)
      if(count>=20)fail(429,'send_rate_limited')
      const next=(await db.query('UPDATE support_conversations SET last_seq=last_seq+1,last_message_at=clock_timestamp() WHERE id=$1 RETURNING last_seq',[c.id])).rows[0].last_seq
      const message=(await db.query(`INSERT INTO support_messages(conversation_id,seq,sender_role,sender_subject,client_key,content) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${projection}`,[c.id,next,role,subject,b.clientKey,b.content.trim()])).rows[0]
      await db.query('COMMIT');send(res,200,{message,conversationId:c.id});return true
    }
    if(action==='read'&&req.method==='POST') {
      if(typeof b.through!=='string'||!/^\d{1,16}$/.test(b.through)||BigInt(b.through)>BigInt(c.last_seq))fail(400,'invalid_read_sequence')
      const col=merchant?'merchant_read_seq':'customer_read_seq'
      await db.query(`UPDATE support_conversations SET ${col}=greatest(${col},$2::bigint) WHERE id=$1`,[c.id,b.through]);await db.query('COMMIT');send(res,200,{ok:true});return true
    }
    if(action==='messages'&&req.method==='GET') {
      const before=params.get('before'),after=params.get('after');if(before&&after)fail(400,'invalid_direction')
      if([before,after].some(v=>v!==null&&!/^\d{1,16}$/.test(v)))fail(400,'invalid_sequence')
      const r=await db.query(`SELECT ${projection} FROM support_messages WHERE conversation_id=$1 ${after?'AND seq>$2':before?'AND seq<$2':'AND seq<$2'} ORDER BY seq ${after?'ASC':'DESC'} LIMIT $3`,[c.id,after||before||'9223372036854775807',limit+1])
      const more=r.rows.length>limit,messages=r.rows.slice(0,limit);if(!after)messages.reverse()
      await db.query('COMMIT');send(res,200,{messages,hasMore:more,conversation:{id:c.id,status:c.status,lastSeq:c.last_seq,customerReadSeq:c.customer_read_seq,merchantReadSeq:c.merchant_read_seq}});return true
    }
    fail(405,'method_not_allowed')
  }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});send(res,e.status||503,{error:e.status?e.message:'support_unavailable'})}
  finally{db?.release()}
  return true
}
