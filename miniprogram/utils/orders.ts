import { CartDisplayItem } from './cart'
import { loadStore, saveStore, expireDemoInventory, inventoryMovement, stockAllows, productIsPublished } from './store'

// 仅供单设备演示。上线前必须迁移至具备身份验证和权限控制的服务端。
export interface DemoOrderItem {
  categoryIdSnapshot?: string | null
  categoryNameSnapshot?: string | null
  productId: string
  name: string
  quantity: number
  price: number
  subtotal: number
}

export interface DemoOrder {
  merchantNote?:string
  merchantNoteVersion?:number
  inventoryState?: 'none'|'held'|'released'|'committed'
  inventoryExpiresAt?:string
  fulfillmentStatus?:string
  id: string
  createdAt: string
  paymentStatus: 'unpaid'
  status: 'pending_payment'
  items: DemoOrderItem[]
  totalText: string
  receiverName: string
  phone: string
  area: string
  detail: string
  note: string
  slotId: string
  slotText: string
}

type OrderInput = Omit<DemoOrder, 'id' | 'createdAt' | 'paymentStatus' | 'status' | 'items'> & {
  items: CartDisplayItem[]
}
const KEY = 'stall_demo_orders_v1'

export function loadDemoOrders(): DemoOrder[] {
  const value = wx.getStorageSync(KEY)
  const current=loadStore().inventoryOrders || []
  return [...current,...(Array.isArray(value)?value:[]).filter(o=>!current.some(row=>row.id===o.id))] as DemoOrder[]
}
export function saveDemoOrders(orders:DemoOrder[]):void {
  const store=loadStore(),ids=new Set((store.inventoryOrders || []).map(o=>o.id))
  store.inventoryOrders=orders.filter(o=>ids.has(o.id))
  expireDemoInventory(store)
  saveStore(store)
  wx.setStorageSync(KEY,orders.filter(o=>!ids.has(o.id)))
}

export function createDemoOrder(input: OrderInput): DemoOrder {
  const store=loadStore(),products = store.products
  if (!input.items.length || input.items.some(item=>{
    const product=products.find(p=>p.id===item.productId)
    return !product || !productIsPublished(product) || product.soldOut || !Number.isSafeInteger(item.quantity) || item.quantity<1 || item.quantity>99 || !stockAllows(product,item.quantity)
  }) || new Set(input.items.map(i=>i.productId)).size!==input.items.length) throw new Error('商品尚未上架、售罄或库存不足，请刷新后重试')
  const order: DemoOrder = {
    id: `DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    paymentStatus: 'unpaid',
    status: 'pending_payment',
    items: input.items.map(item => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.subtotal,
      categoryIdSnapshot: products.find(p=>p.id===item.productId)!.categoryId || null,
      categoryNameSnapshot: store.categories.find(c=>c.id===products.find(p=>p.id===item.productId)!.categoryId)?.name || null
    })),
    totalText: input.totalText,
    receiverName: input.receiverName,
    phone: input.phone,
    area: input.area,
    detail: input.detail,
    note: input.note,
    slotId: input.slotId,
    slotText: input.slotText
  }
  const finite=order.items.filter(item=>products.find(p=>p.id===item.productId)!.stockMode==='finite')
  order.inventoryState=finite.length?'held':'none'
  order.fulfillmentStatus='new'
  if(finite.length){
    order.inventoryExpiresAt=new Date(Date.now()+15*60000).toISOString()
    store.inventoryReservations=store.inventoryReservations || []
    for(const item of finite){
      const product=products.find(p=>p.id===item.productId)!
      inventoryMovement(store,product,'finite',Number(product.stockQuantity)-item.quantity,'order','演示待支付订单预留，尚未收款',order.id)
      store.inventoryReservations.push({orderId:order.id,productId:product.id,quantity:item.quantity,expiresAt:order.inventoryExpiresAt,state:'held'})
    }
  }
  store.inventoryOrders=[order,...(store.inventoryOrders || [])]
  // Inventory, holds, ledger and the new order share one local storage write.
  saveStore(store)
  return order
}
