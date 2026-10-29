// Read-only schema preflight for the unified gateway payment implementation.
// Run only with an explicitly isolated Neon DATABASE_URL; no data is changed.
import {Pool} from 'pg'
const fail=message=>{throw Error(message)}
const required={
 orders:['id','store_id','total_cents','currency','payment_status','fulfillment_status','inventory_state','inventory_expires_at','created_at'],
 payment_events:['order_id','provider','provider_event_id','event_type','amount_cents'],
 inventory_reservations:['store_id','order_id','product_id','quantity','state'],
 products:['id','store_id','stock_mode','stock_quantity'],
 inventory_movements:['store_id','product_id','order_id','source','operation_key']
}
export async function inspectPaymentSchema(db){
 const cols=(await db.query(`SELECT table_name,column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name=ANY($1::text[])`,[Object.keys(required)])).rows
 const existing=new Set(cols.map(r=>r.table_name+'.'+r.column_name))
 const missing=Object.entries(required).flatMap(([table,columns])=>columns.filter(c=>!existing.has(table+'.'+c)).map(c=>table+'.'+c))
 const unique=(await db.query(`SELECT EXISTS (
   SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(i.indkey)
   WHERE n.nspname='public' AND c.relname='payment_events' AND i.indisunique
   GROUP BY i.indexrelid HAVING array_agg(a.attname ORDER BY a.attnum) @> ARRAY['provider','provider_event_id']::name[]
   AND count(*)=2) AS protected`)).rows[0]?.protected===true
 return {ok:missing.length===0&&unique,missing,providerEventUnique:unique}
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1].replaceAll('\\','/')).href){
 if(process.env.PAYMENT_READONLY_PREFLIGHT!=='true')fail('Set PAYMENT_READONLY_PREFLIGHT=true explicitly')
 if(process.env.PAYMENT_DB_ENV!=='isolated-test')fail('PAYMENT_DB_ENV=isolated-test is required')
 if(!process.env.DATABASE_URL)fail('DATABASE_URL required')
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},max:1})
 try{
  const db=await pool.connect()
  try{
   await db.query('BEGIN READ ONLY')
   const identity=(await db.query('SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS server')).rows[0]
   const report=await inspectPaymentSchema(db)
   await db.query('ROLLBACK')
   console.log(JSON.stringify({identity,...report},null,2))
   if(!report.ok)process.exitCode=1
  }finally{db.release()}
 }finally{await pool.end()}
}
