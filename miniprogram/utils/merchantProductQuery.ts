import { Product, ProductDraft, StoreData, productIsPending, productIsPublished } from './store'

export interface MerchantProductQuery {
  q:string; categoryId:string; kind:string; state:string; soldOut:string;
  stockMode:string; stockState:string; discount:string; sort:string
}
export type MerchantCatalogItem = {kind:'product';product:Product} | {kind:'draft';draft:ProductDraft}
export const queryChoices = [
  {key:'kind',label:'商品类型',values:['all','product','draft'],labels:['全部（含草稿）','正式商品','草稿']},
  {key:'state',label:'上架状态',values:['all','active','inactive','scheduled'],labels:['全部上架状态','上架中','已下架（不含待定时）','待定时上架']},
  {key:'soldOut',label:'手动售罄',values:['all','yes','no'],labels:['全部手动状态','商家手动售罄','未手动售罄']},
  {key:'stockMode',label:'库存模式',values:['all','finite','unlimited'],labels:['全部库存模式','有限库存','不限库存']},
  {key:'stockState',label:'库存数量',values:['all','low','zero'],labels:['全部库存数量','低库存（大于零）','缺货（零库存）']},
  {key:'discount',label:'折扣设置',values:['all','yes','no'],labels:['全部折扣设置','有折扣','无折扣']},
  {key:'sort',label:'排序',values:['created','updated','name','priceAsc','priceDesc','stockAsc','stockDesc','scheduled'],labels:['最近创建','最近修改','商品名称','价格升序','价格降序','库存升序','库存降序','定时上架时间']}
]
export function defaultProductQuery():MerchantProductQuery {
  return {q:'',categoryId:'',kind:'all',state:'all',soldOut:'all',stockMode:'all',stockState:'all',discount:'all',sort:'created'}
}
export function cloudProductToLocal(p:any):Product {
  return {id:p.id,name:p.name,categoryId:p.categoryId || '',price:p.priceCents/100,
    discountPrice:p.discountPriceCents==null?null:p.discountPriceCents/100,discountStart:p.discountStart || '',discountEnd:p.discountEnd || '',
    available:p.active,soldOut:p.soldOut,imageUrl:p.imageUrl || '',description:p.description || '',publishAt:p.publishAt,
    effectiveActive:p.effectiveActive,version:p.version,stockMode:p.stockMode,stockQuantity:p.stockQuantity,
    lowStockThreshold:p.lowStockThreshold,inventoryVersion:p.inventoryVersion,createdAt:p.createdAt,updatedAt:p.updatedAt}
}
function draftNumber(value:string|undefined,money=false):number|null {
  if(!value || !(money?/^[0-9]{1,7}([.][0-9]{1,2})?$/:/^[0-9]{1,7}$/).test(value))return null
  return Number(value)<=1000000?Number(value):null
}
// Local demo alone queries the complete device store. Cloud mode never calls this fallback.
export function localMerchantQuery(store:StoreData,query:MerchantProductQuery):MerchantCatalogItem[] {
  const now=Date.now(), categories:Record<string,string>={}
  store.categories.forEach(c=>{categories[c.id]=c.name})
  const entries:MerchantCatalogItem[]=store.products.map(product=>({kind:'product' as const,product}))
  ;(store.drafts || []).forEach(draft=>entries.push({kind:'draft',draft}))
  const rows=entries.map(entry=>{
    const p=entry.kind==='product'?entry.product:null, d=entry.kind==='draft'?entry.draft:null, payload=d&&d.payload
    const categoryId=p?p.categoryId:payload!.selectedCategory
    const name=p?p.name:payload!.productName
    const price=p?p.price:draftNumber(payload!.priceText,true), discount=p?p.discountPrice:draftNumber(payload!.discountText,true)
    const stockMode=p?p.stockMode || 'unlimited':payload!.stockMode || 'unlimited'
    const quantity=p?(p.stockQuantity==null?0:p.stockQuantity):draftNumber(payload!.stockQuantityText)
    const threshold=p?(p.lowStockThreshold==null?5:p.lowStockThreshold):draftNumber(payload!.lowStockThresholdText)
    const source=p || d!, created=source.createdAt || '', updated=source.updatedAt || created
    const keys:Record<string,string|number|null>={created:created || null,updated:updated || null,name:name.toLowerCase(),priceAsc:price,priceDesc:price,
      stockAsc:stockMode==='finite'?quantity:null,stockDesc:stockMode==='finite'?quantity:null,scheduled:p&&p.publishAt?new Date(p.publishAt).toISOString():null}
    const keyword=query.q.trim().toLowerCase()
    const exactId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyword)
    const keywordMatch=exactId?source.id.toLowerCase()===keyword:!keyword || name.toLowerCase().indexOf(keyword)>=0 || (categories[categoryId] || '').toLowerCase().indexOf(keyword)>=0 || source.id.toLowerCase()===keyword
    const match=keywordMatch &&
      (query.kind==='all' || entry.kind===query.kind) && (!query.categoryId || categoryId===query.categoryId) &&
      (query.state==='all' || !!p && (query.state==='active'?productIsPublished(p,now):query.state==='scheduled'?productIsPending(p,now):!productIsPublished(p,now)&&!productIsPending(p,now))) &&
      (query.soldOut==='all' || !!p && !!p.soldOut===(query.soldOut==='yes')) &&
      (query.stockMode==='all' || stockMode===query.stockMode) &&
      (query.stockState==='all' || stockMode==='finite' && quantity!==null && (query.stockState==='zero'?quantity===0:quantity>0&&threshold!==null&&quantity<=threshold)) &&
      (query.discount==='all' || (discount!==null&&price!==null&&discount<price)===(query.discount==='yes'))
    return {entry,match,key:keys[query.sort],tie:entry.kind+':'+source.id}
  }).filter(row=>row.match)
  const desc=['created','updated','priceDesc','stockDesc'].indexOf(query.sort)>=0
  rows.sort((a,b)=>{
    if(a.key===null && b.key!==null)return 1
    if(b.key===null && a.key!==null)return -1
    if(a.key!==b.key && a.key!==null && b.key!==null)return (a.key<b.key?-1:1)*(desc?-1:1)
    return a.tie<b.tie?-1:a.tie>b.tie?1:0
  })
  return rows.map(row=>row.entry)
}
