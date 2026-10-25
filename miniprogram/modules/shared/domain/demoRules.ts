import type { StoreData,Product } from './demo'
export const MAX_STOCK = 1000000
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
export function newId(): string { return `${Date.now()}_${Math.floor(Math.random() * 100000)}` }
export function effectivePrice(p: Product, now = Date.now()): number {
  if (p.discountPrice === null || p.discountPrice >= p.price || p.discountPrice < 0) return p.price
  const start = p.discountStart ? new Date(p.discountStart.replace(' ', 'T')).getTime() : -Infinity
  const end = p.discountEnd ? new Date(p.discountEnd.replace(' ', 'T')).getTime() : Infinity
  return Number.isNaN(start) || Number.isNaN(end) || now < start || now >= end ? p.price : p.discountPrice
}

