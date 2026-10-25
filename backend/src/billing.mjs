import { createHash } from 'node:crypto'
import { allowReportExport } from './reportExportLimits.mjs'
import { authenticate, permittedStore } from './auth.mjs'
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
function response(res,status,data){res.writeHead(status,headers);res.end(JSON.stringify(data))}
function dateOk(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v&&v>='2000-01-01'&&v<='2100-12-31'}
function cell(v){let s=String(v??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
const notice='云端数据库账单；金额不含取消订单，确认收款为零：当前没有可信支付核验链路。已送达不代表已收款。'
export async function billingRoute(req,res,url,pool){
 const m=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/billing(?:\/(export))?$/.exec(url.pathname)
 if(!m)return false
 if(req.method!=='GET'){response(res,405,{error:'method_not_allowed'});return true}
 const who=await authenticate(pool,req);if(!who){response(res,401,{error:'login_required'});return true}
 const store=await permittedStore(pool,who,m[1]);if(!store||!['owner','manager'].includes(store.role)){response(res,403,{error:'forbidden'});return true}
 const q=url.searchParams,all=q.get('all')==='1',today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),from=q.get('from')||today,to=q.get('to')||from
 const limit=Number(q.get('limit')||50)
 if([...q.keys()].some(k=>!['all','from','to','limit','cursor','format'].includes(k)||q.getAll(k).length!==1)||q.has('all')&&q.get('all')!=='1'||all&&(q.has('from')||q.has('to'))||!all&&(!dateOk(from)||!dateOk(to)||from>to||Date.parse(to)-Date.parse(from)>=366*86400000)||!/^\d{1,3}$/.test(q.get('limit')||'50')||limit<1||limit>100||q.has('format')&&q.get('format')!=='json'){
   response(res,400,{error:'invalid_billing_query'});return true
 }
 const params=[store.id],where=["o.store_id=$1 AND o.currency='CNY'"]
 if(!all){params.push(from,to);where.push("o.created_at>=($2::date::timestamp AT TIME ZONE 'Asia/Shanghai') AND o.created_at<(($3::date+1)::timestamp AT TIME ZONE 'Asia/Shanghai')")}
 const fingerprint=createHash('sha256').update(JSON.stringify([store.id,all,all?'':from,all?'':to,limit])).digest('hex')
 let cursor=null
 if(q.has('cursor'))try{
   const raw=q.get('cursor');if(raw.length>1000||!/^[a-zA-Z0-9_-]+$/.test(raw))throw Error()
   cursor=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'))
   if(cursor.f!==fingerprint||typeof cursor.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cursor.id)||typeof cursor.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at)||!Number.isFinite(Date.parse(cursor.at)))throw Error()
 }catch{response(res,400,{error:'invalid_billing_cursor'});return true}
 if(m[2]&&!allowReportExport(store.id)){response(res,429,{error:'report_export_rate_limited'});return true}
 const client=await pool.connect();let open=false
 try{
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true
  await client.query("SET LOCAL statement_timeout='5000ms'")
  const summaryResult=await client.query(`SELECT COUNT(*)::int AS "orderCount",COUNT(*) FILTER(WHERE fulfillment_status='cancelled')::int AS "cancelCount",COUNT(*) FILTER(WHERE fulfillment_status='delivered')::int AS "deliveredCount",COUNT(*) FILTER(WHERE fulfillment_status='new')::int AS "pendingCount",COALESCE(SUM(total_cents) FILTER(WHERE fulfillment_status<>'cancelled'),0)::text AS "orderCents",0 AS "paidCents",COALESCE(SUM(total_cents) FILTER(WHERE fulfillment_status<>'cancelled' AND payment_status='unpaid'),0)::text AS "unpaidCents" FROM orders o WHERE `+where.join(' AND '),params)
  const summary=summaryResult.rows[0]
  if(Object.values(summary).some(v=>!Number.isSafeInteger(Number(v))||Number(v)<0)){response(res,413,{error:'billing_amount_too_large'});return true}
  const pageParams=params.slice(),pageWhere=where.slice()
  if(cursor&&!m[2]){pageParams.push(cursor.at,cursor.id);pageWhere.push('(o.created_at,o.id)<($'+(pageParams.length-1)+'::timestamptz,$'+pageParams.length+'::uuid)')}
  pageParams.push(m[2]?10001:limit+1)
  const {rows}=await client.query(`SELECT o.id,o.created_at AS "createdAt",o.payment_status AS "paymentStatus",o.fulfillment_status AS "fulfillmentStatus",o.currency,o.total_cents AS "totalCents",to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt" FROM orders o WHERE `+pageWhere.join(' AND ')+' ORDER BY o.created_at DESC,o.id DESC LIMIT $'+pageParams.length,pageParams)
  if(m[2]&&rows.length>10000){response(res,413,{error:'export_too_large_narrow_date_range'});return true}
  const hasMore=!m[2]&&rows.length>limit,items=m[2]?rows:rows.slice(0,limit),ids=items.map(o=>o.id)
  const details=ids.length?await client.query('SELECT i.order_id,i.product_name,i.quantity,i.unit_price_cents,i.line_total_cents FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.store_id=$1 AND o.id=ANY($2::uuid[]) ORDER BY i.id LIMIT 50001',[store.id,ids]):{rows:[]}
  if(details.rows.length>50000){response(res,413,{error:'billing_details_too_large'});return true}
  await client.query('COMMIT');open=false
  const byId=new Map(),snapshotById=new Map();for(const line of details.rows){const a=byId.get(line.order_id)||[];a.push(line.product_name+' × '+line.quantity);byId.set(line.order_id,a);const b=snapshotById.get(line.order_id)||[];b.push(line.product_name+' × '+line.quantity+'（成交单价¥'+(Number(line.unit_price_cents)/100).toFixed(2)+'，小计¥'+(Number(line.line_total_cents)/100).toFixed(2)+'）');snapshotById.set(line.order_id,b)}
  const result=items.map(o=>({...o,itemsText:(byId.get(o.id)||[]).join('；')}))
  const range=all?'all':from+'-'+to
  if(m[2]){
   const lines=[['订单编号','创建时间（北京时间）','支付状态（未核验）','配送状态','币种','订单金额（不含取消）','取消订单金额','已确认收款','商品成交快照明细'],...result.map(o=>[o.id,new Date(o.createdAt.getTime()+8*3600000).toISOString().replace('T',' ').slice(0,19),o.paymentStatus,o.fulfillmentStatus,o.currency,o.fulfillmentStatus==='cancelled'?'0.00':(Number(o.totalCents)/100).toFixed(2),o.fulfillmentStatus==='cancelled'?(Number(o.totalCents)/100).toFixed(2):'0.00','0.00',(snapshotById.get(o.id)||[]).join('；')])]
   const csv='\uFEFF'+[['统计说明',notice],...lines].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n',filename='billing-'+range+'.csv'
   if(Buffer.byteLength(csv)>5*1024*1024){response(res,413,{error:'export_too_large_narrow_date_range'});return true}
   if(q.get('format')==='json')response(res,200,{csv,filename})
   else{res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="'+filename+'"','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(csv)}
  }else{
   const last=items[items.length-1],nextCursor=hasMore?Buffer.from(JSON.stringify({f:fingerprint,id:last.id,at:last.cursorAt})).toString('base64url'):null
   response(res,200,{all,from:all?null:from,to:all?null:to,summary,items:result,nextCursor,hasMore,notice})
  }
 }finally{if(open)await client.query('ROLLBACK').catch(()=>{});client.release()}
 return true
}
