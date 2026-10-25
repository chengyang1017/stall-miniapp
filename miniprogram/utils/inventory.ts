import {loadStore,saveStore,Product,StoreData,MAX_STOCK,inventoryMovement} from './store'
export function stockInteger(raw:string):number {
  if(!/^\d+$/.test(raw.trim()))throw new Error('库存和阈值必须为非负整数')
  const value=Number(raw)
  if(!Number.isSafeInteger(value)||value>MAX_STOCK)throw new Error('库存和阈值不能超过1000000')
  return value
}
export function configureDemoInventory(store:StoreData,product:Product,mode:'unlimited'|'finite',quantity:number,threshold:number,expectedVersion:number,reason:string,initial=false):void {
  if(!reason.trim()||reason.trim().length>200)throw new Error('库存原因需为1至200字')
  if(!Number.isSafeInteger(quantity)||quantity<0||quantity>MAX_STOCK||!Number.isSafeInteger(threshold)||threshold<0||threshold>MAX_STOCK)throw new Error('库存或阈值无效')
  if(!initial&&(product.inventoryVersion || 1)!==expectedVersion)throw new Error('库存已变化，请刷新后重试')
  const held=(store.inventoryReservations || []).filter(h=>h.productId===product.id&&h.state==='held').reduce((n,h)=>n+h.quantity,0)
  if(held&&mode!==(product.stockMode || 'unlimited'))throw new Error('商品仍有预留订单，不能切换库存模式')
  const after=mode==='finite'?quantity:0
  if(after+held>MAX_STOCK)throw new Error('库存加预留数量不能超过1000000')
  inventoryMovement(store,product,mode,after,'manual',reason)
  product.lowStockThreshold=threshold
}
export function adjustDemoInventory(id:string,delta:number,expectedVersion:number,reason:string):void {
  if(!Number.isSafeInteger(delta)||!delta||Math.abs(delta)>MAX_STOCK||!reason.trim()||reason.trim().length>200)throw new Error('请填写有效数量和原因')
  const store=loadStore(),product=store.products.find(p=>p.id===id)
  if(!product||product.stockMode!=='finite')throw new Error('仅有限库存商品可补货或扣减')
  configureDemoInventory(store,product,'finite',Number(product.stockQuantity)+delta,product.lowStockThreshold || 0,expectedVersion,reason.trim())
  saveStore(store)
}
