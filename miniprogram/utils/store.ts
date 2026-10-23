export interface Category { id: string; name: string }
export interface Product {
  id: string; categoryId: string; name: string; price: number;
  discountPrice: number | null; discountStart: string; discountEnd: string;
  available: boolean; soldOut?: boolean; description?: string; imageUrl?: string
}
export interface StoreData { categories: Category[]; products: Product[] }
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
  if (saved && Array.isArray(saved.categories) && Array.isArray(saved.products)) return saved
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
