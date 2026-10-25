import { createHash } from 'node:crypto'
import { authenticate, permittedStore } from './auth.mjs'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ranks=['quantity','orderCents','paidCents','orderCount']
const DAY=86400000
const fail=(res,status,error)=>send(res,status,{error})
function send(res,status,data) {res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))}
function dateOk(s) {return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s && s>='2000-01-01' && s<='2100-12-31'}
function cents(v) {const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('invalid_analytics_amount');return n}
function stock(p) {return !p?'无法关联当前商品':(p.stock_mode!=='finite'?'不限库存':p.stock_quantity===0?'缺货（零库存）':`库存 ${p.stock_quantity}${p.stock_quantity<=p.low_stock_threshold?' · 库存不足预警':''}`)+(p.sold_out?' · 手动售罄':'')}
function cell(v) {let s=String(v??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
const money=n=>(n/100).toFixed(2)

function buildReport(orders,lines,products,query) {
  const byProduct=new Map(products.map(p=>[p.id,p])), byOrder=new Map(), matched=new Map(), groups=new Map()
  const filtered=!!query.q || !!query.categoryId
  const q=query.q.toLowerCase()
  const matchesName=(id,name)=>!q || id?.toLowerCase()===q || name.toLowerCase().includes(q) || (byProduct.get(id)?.name || '').toLowerCase().includes(q)
  for(const o of orders)byOrder.set(o.id,o)
  for(const line of lines) {
    const o=byOrder.get(line.order_id)
    if(!o || !matchesName(line.product_id,line.product_name) || (query.categoryId==='unknown'?line.category_id_snapshot!==null:query.categoryId && line.category_id_snapshot!==query.categoryId))continue
    const total=cents(line.line_total_cents), entry=matched.get(o.id)||{amount:0,quantity:0}
    entry.amount+=total;entry.quantity+=line.quantity;matched.set(o.id,entry)
    const key=line.product_id || 'legacy:'+line.product_name
    let row=groups.get(key)
    if(!row) {row={key,productId:line.product_id,name:line.product_name,quantity:0,orderCents:0,paidCents:0,orderIds:new Set(),lastOrderAt:null,nameAt:'',categories:new Set()};groups.set(key,row)}
    const at=o.created_at.toISOString(), tie=at+o.id+line.id
    if(tie>row.nameAt){row.name=line.product_name;row.nameAt=tie}
    row.categories.add(line.category_name_snapshot || '未记录历史分类')
    if(o.fulfillment_status==='cancelled')continue
    row.quantity+=line.quantity;row.orderCents+=total;row.orderIds.add(o.id)
    if(!row.lastOrderAt || at>row.lastOrderAt)row.lastOrderAt=at
  }
  for(const p of products) {
    if(!matchesName(p.id,p.name) || query.categoryId==='unknown' || query.categoryId && p.category_id!==query.categoryId || groups.has(p.id))continue
    groups.set(p.id,{key:p.id,productId:p.id,name:p.name,quantity:0,orderCents:0,paidCents:0,orderIds:new Set(),lastOrderAt:null,categories:new Set()})
  }
  const summary={orderCount:0,paidCount:0,unpaidCount:0,cancelCount:0,unverifiedCount:0,effectiveOrderCount:0,orderCents:0,paidCents:0,unpaidCents:0,averageCents:0,quantity:0}
  const daily=[], byDay=new Map(), hourly=Array.from({length:24},(_,hour)=>({hour,orderCount:0}))
  for(let t=Date.parse(query.from+'T00:00:00Z');t<=Date.parse(query.to+'T00:00:00Z');t+=DAY) {
    const row={day:new Date(t).toISOString().slice(0,10),orderCount:0,orderCents:0,paidCents:0,quantity:0};daily.push(row);byDay.set(row.day,row)
  }
  for(const o of orders) {
    const selected=matched.get(o.id)
    if(filtered && !selected)continue
    const day=byDay.get(o.business_day)
    if(!day)continue
    summary.orderCount++;day.orderCount++;hourly[o.business_hour].orderCount++
    if(o.fulfillment_status==='cancelled'){summary.cancelCount++;continue}
    const amount=filtered?selected.amount:cents(o.total_cents), quantity=selected?.quantity || 0
    summary.effectiveOrderCount++;summary.orderCents+=amount;summary.quantity+=quantity;day.orderCents+=amount;day.quantity+=quantity
    if(o.payment_status==='unpaid'){summary.unpaidCount++;summary.unpaidCents+=amount}
    else summary.unverifiedCount++
    // There is no verified successful payment callback in this application yet.
    // Neither a status label, fulfillment nor inventory movement proves receipt.
  }
  summary.averageCents=summary.effectiveOrderCount?Math.round(summary.orderCents/summary.effectiveOrderCount):0
  const rows=[...groups.values()].map(row=>({key:row.key,productId:row.productId,name:row.name,quantity:row.quantity,orderCount:row.orderIds.size,orderCents:row.orderCents,paidCents:0,
    lastOrderAt:row.lastOrderAt,historicalCategories:([...row.categories].sort().slice(0,20).join('、')+(row.categories.size>20?` 等${row.categories.size}个分类名称`:'')) || '无匹配历史订单',
    currentName:byProduct.get(row.productId)?.name || '',stockLabel:stock(byProduct.get(row.productId))}))
  rows.sort((a,b)=>b[query.rankBy]-a[query.rankBy] || (a.key<b.key?-1:a.key>b.key?1:0))
  for(const value of [...Object.values(summary),...rows.flatMap(r=>[r.quantity,r.orderCount,r.orderCents]),...daily.flatMap(r=>[r.orderCount,r.orderCents,r.quantity])])if(!Number.isSafeInteger(value)||value<0)throw Error('analytics_numeric_limit')
  return {summary,daily,hourly,rows,ranking:rows.filter(row=>row.orderCount>0).slice(0,query.top),amountScope:filtered?'匹配商品快照金额，不含配送费':'订单总额，含配送费',
    notice:'销量为未取消订单的下单件数，包含未支付；取消订单不计金额和件数。当前无可信支付成功核验链路，确认收款为零。分类仅依据下单时快照；旧订单归入未记录历史分类。'}
}

function exportReport(report,type,query) {
  const meta=[['报表类型',type,'开始日期',query.from,'结束日期',query.to,'时区','Asia/Shanghai','币种','CNY'],['统计说明',report.notice],['总览/趋势金额口径',report.amountScope],['商品筛选',query.q || '全部','分类筛选ID',query.categoryId || '全部']]
  let records
  if(type==='overview')records=[['指标','数值'],...Object.entries({订单总数:report.summary.orderCount,已确认支付订单数:0,未支付订单数:report.summary.unpaidCount,取消订单数:report.summary.cancelCount,其他未核验支付状态订单数:report.summary.unverifiedCount,订单总金额:money(report.summary.orderCents),已确认支付金额:'0.00',未支付订单金额:money(report.summary.unpaidCents),客单价:money(report.summary.averageCents),商品下单数量:report.summary.quantity})]
  else if(type==='daily')records=[['北京时间日期','订单数量（含取消）','订单金额','已确认支付金额','商品下单数量'],...report.daily.map(r=>[r.day,r.orderCount,money(r.orderCents),'0.00',r.quantity])]
  else {
    if(report.rows.length>5000)throw Error('export_limit')
    records=[['商品ID','商品快照名称（最近匹配订单）','下单件数','未取消订单数','商品订单金额（不含配送费）','已确认支付金额','历史分类快照','当前库存状态','最近有效订单时间（北京时间）'],...report.rows.map(r=>[r.productId || '',r.name,r.quantity,r.orderCount,money(r.orderCents),'0.00',r.historicalCategories,r.stockLabel,r.lastOrderAt?new Date(Date.parse(r.lastOrderAt)+8*3600000).toISOString().replace('T',' ').slice(0,19):''])]
  }
  const csv='\uFEFF'+[...meta,...records].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
  if(Buffer.byteLength(csv,'utf8')>5*1024*1024)throw Error('export_limit')
  return {csv,filename:`sales-${type}-${query.from}-${query.to}.csv`}
}

export async function salesAnalyticsRoute(req,res,url,pool) {
  const match=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/analytics(?:\/(export))?$/.exec(url.pathname)
  if(!match)return false
  if(req.method!=='GET'){fail(res,405,'method_not_allowed');return true}
  const subject=await authenticate(pool,req)
  if(!subject){fail(res,401,'login_required');return true}
  const store=await permittedStore(pool,subject,match[1])
  if(!store || !['owner','manager'].includes(store.role)){fail(res,403,'forbidden');return true}
  const input=url.searchParams, query={from:input.get('from'),to:input.get('to'),q:(input.get('q')||'').trim(),categoryId:(input.get('categoryId')||'').toLowerCase(),rankBy:input.get('rankBy')||'quantity',top:Number(input.get('top')||10)}
  const allowed=['from','to','q','categoryId','rankBy','top','page','snapshot',...(match[2]?['type']:[])]
  const pageText=input.get('page')||'1', page=Number(pageText), type=input.get('type')
  if([...input.keys()].some(k=>!allowed.includes(k)||input.getAll(k).length!==1)||!dateOk(query.from)||!dateOk(query.to)||query.from>query.to||Date.parse(query.to)-Date.parse(query.from)>=366*DAY ||
    (input.get('q')||'').length>100 || query.categoryId && query.categoryId!=='unknown' && !uuid.test(query.categoryId) || !ranks.includes(query.rankBy)||![10,20,50].includes(query.top)||
    !/^[1-9][0-9]{0,3}$/.test(pageText)||page>2000 || page>1&&!input.has('snapshot') || input.has('snapshot')&&!/^[a-f0-9]{64}$/.test(input.get('snapshot')) || match[2]&&!['overview','products','daily'].includes(type)) {
    fail(res,400,'invalid_analytics_query');return true
  }
  const client=await pool.connect();let open=false
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true
    await client.query("SET LOCAL statement_timeout='5000ms'")
    const {rows:orders}=await client.query(`SELECT o.id,o.created_at,o.total_cents,o.payment_status,o.fulfillment_status,
      to_char(o.created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS business_day,extract(hour FROM o.created_at AT TIME ZONE 'Asia/Shanghai')::int AS business_hour FROM orders o
      WHERE o.store_id=$1 AND o.currency='CNY' AND o.created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Shanghai')
      AND o.created_at < (($3::date+1)::timestamp AT TIME ZONE 'Asia/Shanghai')
      AND (($4::text='' AND $5::text='') OR EXISTS(SELECT 1 FROM order_items i
        LEFT JOIN products p ON p.store_id=o.store_id AND p.id=i.product_id WHERE i.order_id=o.id
        AND ($4='' OR ($4='unknown' AND i.category_id_snapshot IS NULL) OR i.category_id_snapshot::text=$4)
        AND ($5='' OR i.product_name ILIKE $6 ESCAPE E'\\\\' OR i.product_id::text=lower($5) OR p.name ILIKE $6 ESCAPE E'\\\\')))
      ORDER BY o.created_at,o.id LIMIT 10001`,[store.id,query.from,query.to,query.categoryId,query.q,'%'+query.q.replace(/[\\%_]/g,'\\$&')+'%'])
    if(orders.length>10000)throw Error('analysis_limit')
    const {rows:lines}=await client.query(`SELECT oi.id,oi.order_id,oi.product_id,oi.product_name,oi.quantity,oi.line_total_cents,oi.category_id_snapshot,oi.category_name_snapshot
      FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.store_id=$1 AND o.id=ANY($2::uuid[]) ORDER BY oi.id LIMIT 50001`,[store.id,orders.map(o=>o.id)])
    if(lines.length>50000)throw Error('analysis_limit')
    const {rows:products}=await client.query(`SELECT id,name,category_id,stock_mode,stock_quantity,low_stock_threshold,sold_out FROM products WHERE store_id=$1
      AND (id=ANY($2::uuid[]) OR (($3::text='' OR name ILIKE $4 ESCAPE E'\\\\' OR id::text=lower($3)) AND ($5::text IN ('','unknown') OR category_id::text=$5))) ORDER BY id LIMIT 10001`,
      [store.id,[...new Set(lines.map(l=>l.product_id).filter(Boolean))],query.q,'%'+query.q.replace(/[\\%_]/g,'\\$&')+'%',query.categoryId])
    if(products.length>10000)throw Error('analysis_limit')
    const {rows:categories}=await client.query('SELECT id,name FROM categories WHERE store_id=$1 ORDER BY sort_order,name,id LIMIT 10001',[store.id])
    if(categories.length>10000)throw Error('analysis_limit')
    const categoryIds=new Set(categories.map(c=>c.id))
    for(const line of lines)if(line.category_id_snapshot && !categoryIds.has(line.category_id_snapshot)) {
      categoryIds.add(line.category_id_snapshot);categories.push({id:line.category_id_snapshot,name:(line.category_name_snapshot || '未命名分类')+'（历史分类）'})
    }
    if(categories.length>10000)throw Error('analysis_limit')
    await client.query('COMMIT');open=false
    const report=buildReport(orders,lines,products,query)
    if(match[2] && type==='products' && report.rows.length>5000)throw Error('export_limit')
    const digest=createHash('sha256').update(JSON.stringify([query,report.summary,report.daily,report.hourly,categories]))
    for(const row of report.rows)digest.update('\n').update(JSON.stringify(row))
    const snapshot=digest.digest('hex')
    if(input.has('snapshot') && input.get('snapshot')!==snapshot){fail(res,409,'analytics_changed_refresh');return true}
    if(match[2])send(res,200,exportReport(report,type,query))
    else send(res,200,{...report,rows:undefined,products:report.rows.slice((page-1)*30,page*30),totalProducts:report.rows.length,hasMore:page*30<report.rows.length,page,snapshot,categories,source:'cloud',timeZone:'Asia/Shanghai',currency:'CNY',from:query.from,to:query.to})
  } catch(error) {
    if(['analysis_limit','export_limit'].includes(error.message))fail(res,413,'analytics_too_large_narrow_filters_or_dates')
    else if(['42P01','42703'].includes(error.code))fail(res,503,'analytics_migrations_required')
    else if(error.code==='57014' || /timeout/i.test(error.message))fail(res,503,'analytics_timeout_narrow_dates')
    else throw error
  } finally {if(open)await client.query('ROLLBACK').catch(()=>{});client.release()}
  return true
}
