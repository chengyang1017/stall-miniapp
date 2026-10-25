import { createHash } from 'node:crypto'
import { validRules } from './deliveryRules.mjs'
export const MAX_ARCHIVE_BYTES=4*1024*1024
export const digest = text => createHash('sha256').update(text).digest('hex')
export const archiveError = (code,status=400) => {throw Object.assign(new Error(code),{status})}
export const json = value => JSON.stringify(value)
export function orderSummary(orders){
 let all=0n,cancelled=0n,unpaid=0n,order=0n,cancelCount=0
 for(const o of orders){const n=BigInt(o.total_cents);all+=n;if(o.fulfillment_status==='cancelled'){cancelled+=n;cancelCount++}else{order+=n;if(o.payment_status==='unpaid')unpaid+=n}}
 return {orderCount:orders.length,cancelCount,allOrdersCents:String(all),orderCents:String(order),cancelledCents:String(cancelled),unpaidCents:String(unpaid),confirmedReceivedCents:'0',confirmedPaymentCount:0,notice:'CNY整数分；订单金额不含取消订单。数据库支付标签未经独立核验，不能作为实收。'}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function makeArchive(store,kind,range,datasets,createdAt){
 const files={},entries=[]
 for(const [name,data] of Object.entries(datasets)){const text=json(data);files[name]=text;entries.push({name,bytes:Buffer.byteLength(text),sha256:digest(text),records:Array.isArray(data)?data.length:1})}
 return {manifest:{format:'stall-merchant-archive',version:1,schemaVersion:14,store:{id:store.id,slug:store.slug},kind,createdAt,timeZone:store.time_zone||'Asia/Shanghai',displayTimeZone:'Asia/Shanghai',currency:'CNY',range,files:entries,
  omissions:['customer_identity_and_delivery_details','support_messages','auth_sessions_and_secrets','payment_events','inventory_audit_and_reservations','image_binary_objects'],
  notice:'经营数据归档，不是数据库灾难恢复备份；历史金额为订单快照，已确认收款为零，当前无可信支付核验链路。'},files}
}
export function catalogCsv(data){
 const cell=v=>{let s=v instanceof Date?v.toISOString():String(v??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
 const categories=new Map(data['categories.json'].map(c=>[c.id,c.name]))
 const rows=[['记录类型','商品或分类ID','商品名称','描述','分类ID','分类名称','原价（商品：分；草稿：原始元输入）','折后价（商品：分；草稿：原始元输入）','折扣开始（商品UTC；草稿保留原始输入）','折扣结束（商品UTC；草稿保留原始输入）','上架开关','手动售罄','库存模式','库存数量','预警阈值','图片对象引用','定时上架（商品UTC；草稿店铺时区原始输入）','草稿状态','版本','草稿原始内容JSON']]
 for(const c of data['categories.json'])rows.push(['分类',c.id,c.name,'','',c.name])
 for(const p of data['products.json'])rows.push(['商品',p.id,p.name,p.description,p.category_id,categories.get(p.category_id),p.price_cents,p.discount_price_cents,p.discount_start,p.discount_end,p.active,p.sold_out,p.stock_mode,p.stock_mode==='finite'?p.stock_quantity:'不限',p.low_stock_threshold,p.image_object_key,p.publish_at,'',p.version])
 for(const d of data['drafts.json']){const p=d.payload;rows.push(['草稿',d.id,p.productName,p.productDescription,p.selectedCategory,categories.get(p.selectedCategory),p.priceText,p.discountText,p.discountStartUtc||p.startText,p.discountEndUtc||p.endText,false,p.isSoldOut,p.stockMode,p.stockQuantityText,p.lowStockThresholdText,p.imageObjectKey,p.scheduleEnabled?`${p.scheduleDate} ${p.scheduleTime}（店铺时区）`:'',d.state,d.version,json(p)])}
 return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n'
}
// This is validation/preview only. It never calls product, inventory or order writes.
export function preflightArchive(value,store){
 if(!value||typeof value!=='object'||Array.isArray(value))archiveError('invalid_archive')
 const m=value.manifest,files=value.files
 if(!m||m.format!=='stall-merchant-archive'||m.version!==1||m.schemaVersion!==14)archiveError('incompatible_archive_version',409)
 if(m.store?.id!==store.id||m.store?.slug!==store.slug)archiveError('archive_store_mismatch',403)
 if(!files||typeof files!=='object'||Array.isArray(files)||!Array.isArray(m.files)||m.files.length>9||!Number.isFinite(Date.parse(m.createdAt))||m.currency!=='CNY')archiveError('invalid_manifest')
 const schemas={
  'catalog-json':['categories.json','products.json','drafts.json'],
  'settings-json':['settings.json'],
  'orders-json':['orders.json','order-items.json','order-summary.json'],
  'archive-json':['categories.json','products.json','drafts.json','settings.json','orders.json','order-items.json','order-summary.json']
 }
 const required=typeof m.kind==='string'&&Object.hasOwn(schemas,m.kind)?schemas[m.kind]:null
 if(!required||Object.keys(files).length!==required.length||m.files.length!==required.length||required.some(n=>!Object.hasOwn(files,n)))archiveError('invalid_file_list')
 const data={},names=new Set()
 for(const e of m.files){if(!e||typeof e!=='object'||Array.isArray(e)||!required.includes(e.name)||names.has(e.name)||typeof files[e.name]!=='string')archiveError('invalid_file_list');names.add(e.name)
  const text=files[e.name];if(Buffer.byteLength(text)!==e.bytes||digest(text)!==e.sha256)archiveError('archive_digest_mismatch')
  try{data[e.name]=JSON.parse(text)}catch{archiveError('invalid_data_json')}
  const v=data[e.name];if(['settings.json','order-summary.json'].includes(e.name)){if(!v||typeof v!=='object'||Array.isArray(v))archiveError('invalid_object_file')}else if(!Array.isArray(v)||v.length>({'categories.json':2000,'products.json':5000,'drafts.json':5000,'orders.json':5000,'order-items.json':20000}[e.name]||0))archiveError('invalid_record_count')
  if(e.records!==(Array.isArray(v)?v.length:1))archiveError('invalid_record_count')
 }
 const ids=name=>{const set=new Set();for(const r of data[name]||[]){if(!r||!uuid.test(r.id)||set.has(r.id))archiveError('invalid_or_duplicate_id');set.add(r.id)}return set}
 const cats=ids('categories.json'),products=ids('products.json'),orders=ids('orders.json');ids('drafts.json');ids('order-items.json')
 const integer=(n,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=0&&n<=max
 for(const c of data['categories.json']||[])if(typeof c.name!=='string'||!c.name.trim())archiveError('invalid_category_fields')
 const images=new Set(),warnings=[]
 const image=key=>{if(key==null||key==='')return;if(typeof key!=='string'||key.length>1000||!/^stores\/[0-9a-f-]{36}\/products\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)||!key.startsWith('stores/'+store.id+'/'))archiveError('invalid_image_reference');images.add(key)}
 for(const p of data['products.json']||[]){if(typeof p.name!=='string'||!p.name.trim()||typeof p.description!=='string'||!integer(p.price_cents)||!['finite','unlimited'].includes(p.stock_mode)||!integer(p.stock_quantity,1000000)||!integer(p.low_stock_threshold,1000000)||typeof p.active!=='boolean'||typeof p.sold_out!=='boolean')archiveError('invalid_product_fields');if(p.category_id&&!cats.has(p.category_id))archiveError('broken_category_reference');if(p.discount_price_cents!=null&&(!integer(p.discount_price_cents)||p.discount_price_cents>=p.price_cents))archiveError('invalid_discount');if(p.publish_at!=null&&(!Number.isFinite(Date.parse(p.publish_at))||p.active))archiveError('invalid_publish_schedule');image(p.image_object_key)}
 for(const d of data['drafts.json']||[]){if(!d.payload||typeof d.payload!=='object'||Array.isArray(d.payload)||!['draft','published','discarded'].includes(d.state)||!integer(d.version)||d.version<1)archiveError('invalid_draft_fields');image(d.payload.imageObjectKey);if(d.published_product_id&&!products.has(d.published_product_id))archiveError('broken_draft_product_reference');if(d.payload.selectedCategory&&!cats.has(d.payload.selectedCategory))warnings.push('草稿分类已不存在：'+d.id)}
 const amount=n=>(typeof n==='string'&&/^\d{1,16}$/.test(n)||typeof n==='number')&&integer(Number(n))
 for(const o of data['orders.json']||[]){if(o.currency!=='CNY'||!amount(o.subtotal_cents)||!amount(o.delivery_fee_cents)||!amount(o.total_cents)||Number(o.total_cents)!==Number(o.subtotal_cents)+Number(o.delivery_fee_cents)||!Number.isFinite(Date.parse(o.created_at))||!['unpaid','paid','refunded','partially_refunded'].includes(o.payment_status)||!['new','accepted','preparing','delivering','delivered','cancelled','abnormal'].includes(o.fulfillment_status))archiveError('invalid_order_snapshot')}
 const subtotals=new Map()
 for(const i of data['order-items.json']||[]){if(!orders.has(i.order_id)||i.product_id!=null&&!uuid.test(i.product_id)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>999||!integer(i.unit_price_cents)||!amount(i.line_total_cents)||Number(i.line_total_cents)!==i.unit_price_cents*i.quantity||typeof i.product_name!=='string')archiveError('invalid_order_item_snapshot');subtotals.set(i.order_id,(subtotals.get(i.order_id)||0n)+BigInt(i.line_total_cents));if(i.product_id&&data['products.json']&&!products.has(i.product_id))warnings.push('历史商品已不存在，保留原ID：'+i.id)}
 for(const i of data['order-items.json']||[])image(i.image_object_key_snapshot)
 for(const o of data['orders.json']||[])if(!subtotals.has(o.id)||subtotals.get(o.id)!==BigInt(o.subtotal_cents))archiveError('order_subtotal_snapshot_mismatch')
 if(data['order-summary.json']){const expected=orderSummary(data['orders.json']);if(Object.keys(expected).some(k=>expected[k]!==data['order-summary.json'][k]))archiveError('invalid_order_summary')}
 if(data['settings.json']){const s=data['settings.json'];if(typeof s.configured!=='boolean'||s.configured&&(!validRules(s.configuration)||typeof s.revision!=='string'||!/^[0-9a-f]{32}$/.test(s.revision))||!s.configured&&(s.configuration!==null||s.revision!==null))archiveError('invalid_settings');if(s.configured)image(s.configuration.placeholderImageKey)}
 return {valid:true,restoreAllowed:false,kind:m.kind,createdAt:m.createdAt,counts:Object.fromEntries(m.files.map(f=>[f.name,f.records])),imageReferences:[...images],warnings:[...new Set(warnings)].slice(0,50),notice:'摘要仅验证文件内部一致性，不证明来源可信；图片实体不包含，存在性按额外检查状态显示，未检查项或完整业务约束仍需核对。仅恢复预览，没有执行商品、库存或订单恢复写入。'}
}
