export interface Category { id: string; name: string }
export interface Product {
  createdAt?: string; updatedAt?: string
  id: string; categoryId: string; name: string; price: number;
  discountPrice: number | null; discountStart: string; discountEnd: string;
  available: boolean; soldOut?: boolean; description?: string; imageUrl?: string
  publishAt?: string | null; version?: number; effectiveActive?: boolean
  stockMode?: 'unlimited' | 'finite'; stockQuantity?: number; lowStockThreshold?: number; inventoryVersion?: number
}
export interface InventoryMovement { id:string; productId:string; orderId?:string|null; beforeMode:string; afterMode:string; beforeQuantity:number; delta:number; afterQuantity:number; source:string; reason:string; createdAt:string }
export interface DemoReservation {orderId:string;productId:string;quantity:number;expiresAt:string;state:'held'|'released'|'committed'}
export interface ProductDraftPayload {
  productName: string; productDescription: string; selectedCategory: string
  priceText: string; discountText: string; startText: string; endText: string
  imageObjectKey: string | null; productImageUrl?: string
  isAvailable: boolean; isSoldOut: boolean
  scheduleEnabled: boolean; scheduleDate: string; scheduleTime: string
  discountStartUtc?: string | null; discountEndUtc?: string | null
  stockMode?: 'unlimited'|'finite'; stockQuantityText?:string; lowStockThresholdText?:string
}
export interface ProductDraft { id: string; payload: ProductDraftPayload; version: number; imageUrl?: string; createdAt?: string; updatedAt?: string }
export interface StoreData { categories: Category[]; products: Product[]; drafts?: ProductDraft[]; timeZone?: string;
  inventoryMovements?:InventoryMovement[]; inventoryReservations?:DemoReservation[]; inventoryOrders?:Array<any> }
export const MAX_STOCK = 1000000
export function stockAllows(product: {stockMode?:string;stockQuantity?:number;outOfStock?:boolean}, quantity=1): boolean {
  return !product.outOfStock && (product.stockMode !== 'finite' || (Number.isSafeInteger(product.stockQuantity) && Number(product.stockQuantity)>=quantity))
}
export function inventoryMovement(store:StoreData,product:Product,afterMode:'unlimited'|'finite',afterQuantity:number,source:string,reason:string,orderId?:string):void {
  const before=product.stockQuantity || 0
  if(!Number.isSafeInteger(before)||before<0||before>MAX_STOCK||!Number.isSafeInteger(afterQuantity)||afterQuantity<0||afterQuantity>MAX_STOCK)throw new Error('库存变化超出有效范围')
  store.inventoryMovements=store.inventoryMovements || []
  store.inventoryMovements.push({id:newId(),productId:product.id,orderId:orderId || null,beforeMode:product.stockMode || 'unlimited',afterMode,beforeQuantity:before,delta:afterQuantity-before,afterQuantity,source,reason,createdAt:new Date().toISOString()})
  product.stockMode=afterMode;product.stockQuantity=afterQuantity;product.inventoryVersion=(product.inventoryVersion || 1)+1
}
export function expireDemoInventory(store:StoreData):boolean {
  let changed=false
  for(const order of store.inventoryOrders || []){
    if(order.inventoryState!=='held'||order.paymentStatus!=='unpaid'||!['new','cancelled'].includes(order.fulfillmentStatus || 'new'))continue
    const expiry=Date.parse(order.inventoryExpiresAt)
    if(order.fulfillmentStatus!=='cancelled'&&(!Number.isFinite(expiry)||expiry>Date.now()))continue
    const source=order.fulfillmentStatus==='cancelled'?'cancel':'expiry'
    for(const hold of (store.inventoryReservations || []).filter(h=>h.orderId===order.id&&h.state==='held')){
      const product=store.products.find(p=>p.id===hold.productId)
      if(!product||product.stockMode!=='finite'||Number(product.stockQuantity)+hold.quantity>MAX_STOCK)throw new Error('库存预留不一致，请人工核对')
      inventoryMovement(store,product,'finite',Number(product.stockQuantity)+hold.quantity,source,source==='cancel'?'演示订单取消，释放预留':'演示未支付预留超时，释放库存',order.id)
      hold.state='released'
    }
    order.inventoryState='released';order.fulfillmentStatus='cancelled';order.issueReason=source==='expiry'?'未支付预留超时，库存已释放':order.issueReason
    changed=true
  }
  return changed
}
export function productIsPublished(product: Product, now = Date.now()): boolean {
  if (typeof product.effectiveActive === 'boolean') return product.effectiveActive
  if (product.publishAt) return Number.isFinite(Date.parse(product.publishAt)) && Date.parse(product.publishAt) <= now
  return product.available
}
export function productIsPending(product: Product, now = Date.now()): boolean {
  if (typeof product.effectiveActive === 'boolean') return !!product.publishAt && !product.effectiveActive
  return !!product.publishAt && Date.parse(product.publishAt) > now
}
const KEY = 'stall_demo_v1'
const initial: StoreData = {
  categories: [{ id: 'c1', name: '主食' }, { id: 'c2', name: '饮料' }],
  products: [
    { id: 'p1', categoryId: 'c1', name: '炒饭', price: 15, discountPrice: 12, discountStart: '', discountEnd: '', available: true },
    { id: 'p2', categoryId: 'c2', name: '豆浆', price: 5, discountPrice: null, discountStart: '', discountEnd: '', available: true }
  ]
}
export function loadStore(): StoreData {
  const saved = wx.getStorageSync(KEY) as StoreData | undefined
  if (saved && Array.isArray(saved.categories) && Array.isArray(saved.products)) { if(expireDemoInventory(saved))saveStore(saved);return saved }
  saveStore(initial)
  return JSON.parse(JSON.stringify(initial)) as StoreData
}
export function saveStore(data: StoreData): void { wx.setStorageSync(KEY, data) }
export function newId(): string { return `${Date.now()}_${Math.floor(Math.random() * 100000)}` }
export function effectivePrice(p: Product, now = Date.now()): number {
  if (p.discountPrice === null || p.discountPrice >= p.price || p.discountPrice < 0) return p.price
  const start = p.discountStart ? new Date(p.discountStart.replace(' ', 'T')).getTime() : -Infinity
  const end = p.discountEnd ? new Date(p.discountEnd.replace(' ', 'T')).getTime() : Infinity
  return Number.isNaN(start) || Number.isNaN(end) || now < start || now >= end ? p.price : p.discountPrice
}
export function money(n: number): string { return n.toFixed(2) }
