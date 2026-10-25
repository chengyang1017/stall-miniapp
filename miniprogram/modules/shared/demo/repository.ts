import type { StoreData,DemoOrder } from '../domain/demo'
import { expireDemoInventory } from '../domain/demoRules'
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
const ORDERS_KEY='stall_demo_orders_v1'
export function loadDemoOrders(): DemoOrder[] {
  const value = wx.getStorageSync(ORDERS_KEY)
  const current=loadStore().inventoryOrders || []
  return [...current,...(Array.isArray(value)?value:[]).filter(o=>!current.some(row=>row.id===o.id))] as DemoOrder[]
}
export function saveDemoOrders(orders:DemoOrder[]):void {
  const store=loadStore(),ids=new Set((store.inventoryOrders || []).map(o=>o.id))
  store.inventoryOrders=orders.filter(o=>ids.has(o.id))
  expireDemoInventory(store)
  saveStore(store)
  wx.setStorageSync(ORDERS_KEY,orders.filter(o=>!ids.has(o.id)))
}

