import { authenticate, permittedStore } from './auth.mjs'

const slugPattern = /^[a-z0-9][a-z0-9-]{1,62}$/
const isoDate = /^\d{4}-\d{2}-\d{2}$/
const cols = ['订单编号','创建时间','支付状态','配送状态','币种','订单金额','实收金额','商品明细']
function dateOk(v) { if (!isoDate.test(v)) return false; const d=new Date(`${v}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===v }
function csvCell(v) { return '"'+String(v ?? '').replace(/^[=+@\-\t\r]/, "' $&").replace(/"/g,'""')+'"' }
function response(res, status, body) {res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
export async function billingRoute(req,res,url,pool) {
  const m=/^\/v1\/merchant\/stores\/([^/]+)\/billing(?:\/(export))?$/.exec(url.pathname)
  if(!m) return false
  if(req.method!=='GET') {response(res,405,{error:'method_not_allowed'});return true}
  if(!slugPattern.test(m[1])) {response(res,400,{error:'invalid_store'});return true}
  const subject=await authenticate(pool,req)
  if(!subject) {response(res,401,{error:'login_required'});return true}
  const store=await permittedStore(pool,subject,m[1])
  if(!store) {response(res,403,{error:'forbidden'});return true}
  const from=url.searchParams.get('from') || new Date().toISOString().slice(0,10)
  const to=url.searchParams.get('to') || from
  if(!dateOk(from)||!dateOk(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000){response(res,400,{error:'invalid_date_range'});return true}
  const params=[store.id,from,to]
  // Date filters refer to store business timezone UTC+8, consistently with earlier ordering phases.
  const where=`store_id=$1 AND (created_at AT TIME ZONE 'Asia/Shanghai')::date >= $2::date AND (created_at AT TIME ZONE 'Asia/Shanghai')::date <= $3::date`
  if(m[2]==='export') {
    const data=await pool.query(`SELECT id,created_at,payment_status,fulfillment_status,currency,total_cents FROM orders WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 10001`,params)
    if(data.rows.length>10000) {response(res,413,{error:'export_too_large_narrow_date_range'});return true}
    const ids=data.rows.map(r=>r.id)
    const details=ids.length?await pool.query('SELECT order_id,product_name,quantity FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY id',[ids]):{rows:[]}
    const byId=new Map()
    for(const d of details.rows) {const arr=byId.get(d.order_id)||[];arr.push(`${d.product_name} × ${d.quantity}`);byId.set(d.order_id,arr)}
    const lines=[cols.map(csvCell).join(',')]
    for(const o of data.rows) lines.push([o.id,o.created_at.toISOString(),o.payment_status,o.fulfillment_status,o.currency,(Number(o.total_cents)/100).toFixed(2),o.payment_status==='paid'?(Number(o.total_cents)/100).toFixed(2):'0.00',(byId.get(o.id)||[]).join('；')].map(csvCell).join(','))
    res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="billing-${from}-${to}.csv"`,'cache-control':'no-store','x-content-type-options':'nosniff'})
    res.end('\uFEFF'+lines.join('\r\n')+'\r\n');return true
  }
  const {rows}=await pool.query(`SELECT COUNT(*)::int AS "orderCount",COUNT(*) FILTER (WHERE fulfillment_status='cancelled')::int AS "cancelCount",COUNT(*) FILTER (WHERE fulfillment_status='delivered')::int AS "deliveredCount", COALESCE(SUM(total_cents),0)::text AS "orderCents",COALESCE(SUM(total_cents) FILTER (WHERE payment_status='paid'),0)::text AS "paidCents",COALESCE(SUM(total_cents) FILTER (WHERE payment_status='unpaid'),0)::text AS "unpaidCents" FROM orders WHERE ${where}`,params)
  response(res,200,{from,to,summary:rows[0],notice:'Paid total reflects database payment_status, not independent settlement reconciliation.'});return true
}
