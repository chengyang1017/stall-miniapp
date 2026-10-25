import { cloudIdentity as supportIdentity } from '../modules/shared/runtime/context'
import { authorizedGet } from '../modules/shared/runtime/auth'
import { getCloudContext } from '../modules/shared/runtime/context'
import { loadWorkflowOrders } from '../modules/merchant/demo/orders'
import { loadStore } from '../modules/merchant/demo/store'

export interface AnalyticsQuery {from:string;to:string;q:string;categoryId:string;rankBy:string;top:number}
export interface AnalyticsProduct {key:string;productId:string|null;name:string;quantity:number;orderCount:number;orderCents:number;paidCents:number;lastOrderAt:string|null;stockLabel:string;historicalCategories:string;currentName:string}
export interface AnalyticsDay {day:string;orderCount:number;orderCents:number;paidCents:number;quantity:number}
export interface AnalyticsSummary {orderCount:number;paidCount:number;unpaidCount:number;cancelCount:number;unverifiedCount:number;effectiveOrderCount:number;orderCents:number;paidCents:number;unpaidCents:number;averageCents:number;quantity:number}
export interface AnalyticsReport {summary:AnalyticsSummary;daily:AnalyticsDay[];hourly:Array<{hour:number;orderCount:number}>;ranking:AnalyticsProduct[];products:AnalyticsProduct[];totalProducts:number;hasMore:boolean;snapshot:string;page:number;categories:Array<{id:string;name:string}>;notice:string;amountScope:string;source:string}
export const analyticsPresets=['今天','昨天','最近7天','最近30天','本月','上月','自定义日期范围']
export const rankKeys=['quantity','orderCents','paidCents','orderCount']
export const rankLabels=['按下单件数','按商品订单金额','按已确认支付金额','按未取消订单数']
export const trendKeys=['orderCount','orderCents','paidCents','quantity']
export const trendLabels=['订单数量（含取消）','订单金额','已确认支付金额','商品下单数量']
export function beijingDay(iso=new Date().toISOString()):string {const t=Date.parse(iso);return Number.isFinite(t)?new Date(t+8*3600000).toISOString().slice(0,10):''}
export function beijingTime(iso:string|null):string {return iso?new Date(Date.parse(iso)+8*3600000).toISOString().replace('T',' ').slice(0,19):'无有效订单'}
export function analyticsRange(index:number):{from:string;to:string} {
  const today=beijingDay(), t=Date.parse(today+'T00:00:00Z'), day=(n:number)=>new Date(n).toISOString().slice(0,10)
  if(index===1)return {from:day(t-86400000),to:day(t-86400000)}
  if(index===2 || index===3)return {from:day(t-(index===2?6:29)*86400000),to:today}
  if(index===4)return {from:today.slice(0,7)+'-01',to:today}
  if(index===5){const end=Date.parse(today.slice(0,7)+'-01T00:00:00Z')-86400000;return {from:day(end).slice(0,7)+'-01',to:day(end)}}
  return {from:today,to:today}
}
export function validAnalyticsRange(from:string,to:string):boolean {
  const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s&&s>='2000-01-01'&&s<='2100-12-31'
  return valid(from)&&valid(to)&&from<=to&&Date.parse(to)-Date.parse(from)<366*86400000
}
export function analyticsContext():string {const c=getCloudContext();return c?supportIdentity():'local-demo'}
export async function cloudAnalytics(query:AnalyticsQuery,page=1,snapshot=''):Promise<AnalyticsReport> {
  const cfg=getCloudContext();if(!cfg)throw Error('missing_cloud_context')
  const r=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/analytics`,{...query,page,...snapshot?{snapshot}:{}})
  if(!r||r.source!=='cloud'||!r.summary||!Array.isArray(r.products)||!Array.isArray(r.daily)||!Array.isArray(r.hourly)||!Array.isArray(r.ranking)||!Array.isArray(r.categories)||typeof r.snapshot!=='string')throw Error('invalid_analytics_response')
  return r
}
function amount(v:unknown):number {const n=Number(v), result=Math.round(n*100);if(!Number.isFinite(n)||!Number.isSafeInteger(result)||result<0)throw Error('演示订单金额无效');return result}
export function localAnalytics(query:AnalyticsQuery):AnalyticsReport {
  const orders=loadWorkflowOrders(),store=loadStore(),current=new Map(store.products.map(p=>[p.id,p])),group=new Map<string,any>(),selected=new Map<string,{amount:number;quantity:number}>()
  const categories=store.categories.slice(),categoryIds=new Set(categories.map(c=>c.id)),q=query.q.trim().toLowerCase(),filtered=!!q||!!query.categoryId
  const match=(id:string,name:string)=>!q||id.toLowerCase()===q||name.toLowerCase().includes(q)||(current.get(id)?.name || '').toLowerCase().includes(q)
  const inRange=orders.filter(o=>{const day=beijingDay(o.createdAt);return day&&day>=query.from&&day<=query.to})
  if(inRange.length>10000||store.products.length>10000)throw Error('数据过多，请缩小日期范围')
  let lineCount=0
  for(const o of inRange)for(const i of o.items || []) {
    if(++lineCount>50000)throw Error('明细过多，请缩小日期范围')
    const categoryId=i.categoryIdSnapshot || null
    if(categoryId&&!categoryIds.has(categoryId)){categoryIds.add(categoryId);categories.push({id:categoryId,name:(i.categoryNameSnapshot || '未命名分类')+'（历史分类）'})}
    if(!match(i.productId || '',i.name || '')||(query.categoryId==='unknown'?categoryId!==null:query.categoryId&&categoryId!==query.categoryId))continue
    if(!Number.isSafeInteger(i.quantity)||i.quantity<1)throw Error('演示订单数量无效')
    const total=amount(i.subtotal),line=selected.get(o.id)||{amount:0,quantity:0};line.amount+=total;line.quantity+=i.quantity;selected.set(o.id,line)
    const key=i.productId || 'legacy:'+i.name
    const row=group.get(key)||{key,productId:i.productId || null,name:i.name,quantity:0,orderCount:0,orderCents:0,paidCents:0,lastOrderAt:null,ids:new Set<string>(),categoryNames:new Set<string>(),nameAt:''}
    const createdAt=new Date(o.createdAt).toISOString(),tie=createdAt+o.id+String(lineCount)
    if(tie>row.nameAt){row.name=i.name;row.nameAt=tie}
    row.categoryNames.add(i.categoryNameSnapshot || '未记录历史分类')
    if(!['cancelled','canceled','refunded'].includes(String(o.fulfillmentStatus))) {
      row.quantity+=i.quantity;row.orderCents+=total;row.ids.add(o.id)
      if(!row.lastOrderAt||createdAt>row.lastOrderAt)row.lastOrderAt=createdAt
    }
    group.set(key,row)
  }
  for(const p of store.products)if(match(p.id,p.name)&&query.categoryId!=='unknown'&&(!query.categoryId||p.categoryId===query.categoryId)&&!group.has(p.id))group.set(p.id,{key:p.id,productId:p.id,name:p.name,quantity:0,orderCount:0,orderCents:0,paidCents:0,lastOrderAt:null,ids:new Set<string>(),categoryNames:new Set<string>()})
  const summary:AnalyticsSummary={orderCount:0,paidCount:0,unpaidCount:0,cancelCount:0,unverifiedCount:0,effectiveOrderCount:0,orderCents:0,paidCents:0,unpaidCents:0,averageCents:0,quantity:0}
  const daily:AnalyticsDay[]=[],days=new Map<string,AnalyticsDay>(),hourly=Array.from({length:24},(_,hour)=>({hour,orderCount:0}))
  for(let t=Date.parse(query.from+'T00:00:00Z');t<=Date.parse(query.to+'T00:00:00Z');t+=86400000){const row={day:new Date(t).toISOString().slice(0,10),orderCount:0,orderCents:0,paidCents:0,quantity:0};daily.push(row);days.set(row.day,row)}
  for(const o of inRange) {
    const line=selected.get(o.id);if(filtered&&!line)continue
    const day=days.get(beijingDay(o.createdAt))!;summary.orderCount++;day.orderCount++;hourly[new Date(Date.parse(o.createdAt)+8*3600000).getUTCHours()].orderCount++
    if(['cancelled','canceled','refunded'].includes(String(o.fulfillmentStatus))){summary.cancelCount++;continue}
    const value=filtered?line!.amount:amount(o.totalText), quantity=line?.quantity || 0
    summary.effectiveOrderCount++;summary.orderCents+=value;summary.quantity+=quantity;day.orderCents+=value;day.quantity+=quantity
    // All local orders are unverified; a local payment label cannot establish receipt.
    if(o.paymentStatus==='unpaid'){summary.unpaidCount++;summary.unpaidCents+=value}else summary.unverifiedCount++
  }
  summary.averageCents=summary.effectiveOrderCount?Math.round(summary.orderCents/summary.effectiveOrderCount):0
  const rows:AnalyticsProduct[]=[...group.values()].map(r=>{const p=current.get(r.productId);return {key:r.key,productId:r.productId,name:r.name,quantity:r.quantity,orderCount:r.ids.size,orderCents:r.orderCents,paidCents:0,lastOrderAt:r.lastOrderAt,
    historicalCategories:([...r.categoryNames].sort().slice(0,20).join('、')+(r.categoryNames.size>20?' 等'+r.categoryNames.size+'个分类名称':'')) || '无匹配历史订单',currentName:p?.name || '',stockLabel:!p?'无法关联当前商品':(p.stockMode!=='finite'?'不限库存':Number(p.stockQuantity)===0?'缺货（零库存）':'库存 '+p.stockQuantity+(Number(p.stockQuantity)<=Number(p.lowStockThreshold || 0)?' · 库存不足预警':''))+(p.soldOut?' · 手动售罄':'')}})
  rows.sort((a,b)=>Number((b as any)[query.rankBy])-Number((a as any)[query.rankBy])||(a.key<b.key?-1:a.key>b.key?1:0))
  for(const n of [...Object.values(summary),...rows.flatMap(r=>[r.quantity,r.orderCents,r.orderCount])])if(!Number.isSafeInteger(n)||n<0)throw Error('统计值超出安全范围')
  return {summary,daily,hourly,products:rows,totalProducts:rows.length,hasMore:false,snapshot:'local',page:1,categories,ranking:rows.filter(r=>r.orderCount>0).slice(0,query.top),source:'local',amountScope:filtered?'匹配商品快照金额，不含配送费':'订单总额，含配送费',notice:'本地演示数据，确认收款始终为零。销量为未取消订单的下单件数，包含未支付。旧订单没有历史分类时不归入当前分类。'}
}
function csvCell(value:unknown):string {let s=String(value==null?'':value);if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
export function localAnalyticsCsv(report:AnalyticsReport,type:string,query:AnalyticsQuery):{csv:string;filename:string} {
  let rows:unknown[][]=[['本地演示数据','开始日期',query.from,'结束日期',query.to,'时区','Asia/Shanghai','币种','CNY'],['统计口径',report.notice],['总览/趋势金额口径',report.amountScope],['商品筛选',query.q || '全部','分类筛选ID',query.categoryId || '全部']]
  if(type==='overview')rows=rows.concat([['指标','数值'],['订单总数',report.summary.orderCount],['已确认支付订单数',0],['未支付订单数',report.summary.unpaidCount],['取消订单数',report.summary.cancelCount],['其他未核验支付状态订单数',report.summary.unverifiedCount],['订单总金额',(report.summary.orderCents/100).toFixed(2)],['已确认支付金额','0.00'],['未支付订单金额',(report.summary.unpaidCents/100).toFixed(2)],['客单价',(report.summary.averageCents/100).toFixed(2)],['商品下单数量',report.summary.quantity]])
  else if(type==='daily')rows=rows.concat([['北京时间日期','订单数量（含取消）','订单金额','已确认支付金额','商品下单数量'],...report.daily.map(r=>[r.day,r.orderCount,(r.orderCents/100).toFixed(2),'0.00',r.quantity])])
  else {if(report.products.length>5000)throw Error('商品超过5000条，请缩小筛选范围');rows=rows.concat([['商品ID','快照商品名称','下单件数','未取消订单数','商品订单金额（不含配送费）','已确认支付金额','历史分类快照','当前库存状态','最近有效订单时间（北京时间）'],...report.products.map(r=>[r.productId || '',r.name,r.quantity,r.orderCount,(r.orderCents/100).toFixed(2),'0.00',r.historicalCategories,r.stockLabel,r.lastOrderAt?beijingTime(r.lastOrderAt):''])])}
  return {csv:'\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n',filename:`demo-sales-${type}-${query.from}-${query.to}.csv`}
}
export async function analyticsExport(query:AnalyticsQuery,type:string,snapshot:string):Promise<{csv:string;filename:string}> {
  const cfg=getCloudContext();if(!cfg)throw Error('missing_cloud_context')
  return authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/analytics/export`,{...query,type,snapshot})
}
export async function shareAnalyticsCsv(file:{csv:string;filename:string}):Promise<void> {
  if(typeof file.csv!=='string'||!/^\uFEFF/.test(file.csv)||! /^(demo-)?sales-(overview|products|daily)-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/.test(file.filename)||encodeURIComponent(file.csv).replace(/%[a-f0-9]{2}/gi,'x').length>5*1024*1024)throw Error('导出文件格式或大小不符合限制')
  const path=wx.env.USER_DATA_PATH+'/'+file.filename
  await new Promise<void>((resolve,reject)=>wx.getFileSystemManager().writeFile({filePath:path,data:file.csv,encoding:'utf8',success:()=>resolve(),fail:reject}))
  await new Promise<void>(resolve=>{
    const unavailable=()=>{wx.showModal({title:'CSV 已保存',content:'文件已保存到小程序本地目录，当前环境无法分享，请使用支持文件分享的微信真机。',showCancel:false});resolve()}
    if(typeof wx.shareFileMessage==='function')wx.shareFileMessage({filePath:path,fileName:file.filename,success:()=>resolve(),fail:unavailable})
    else unavailable()
  })
}
