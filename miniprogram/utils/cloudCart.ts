import { getRemoteProducts } from './remoteApi'
import { stockAllows } from './store'
import { getMerchantContext } from './merchantContext'
import { sessionScope } from './sessionScope'
import { supportIdentity } from './supportCloud'

export interface CloudCartRow { productId: string; quantity: number }
const KEY = 'stall_cloud_cart_v1'
export function cloudCartConfig(): { apiBase: string; storeSlug: string } | null {
  return getMerchantContext()
}
export function cloudCacheSuffix(slug:string):string {const cfg=getMerchantContext();return encodeURIComponent((cfg?.apiBase||'disabled')+'/'+slug)+':'+sessionScope()}
function storageKey(slug: string): string { return KEY + ':' + cloudCacheSuffix(slug) }
export function readCloudCart(slug: string): CloudCartRow[] {
  if(getMerchantContext()?.storeSlug!==slug)return []
  const rows = wx.getStorageSync(storageKey(slug))
  if (!Array.isArray(rows)) return []
  return rows.filter((r: any) => r && typeof r.productId === 'string' && Number.isInteger(r.quantity) && r.quantity > 0 && r.quantity <= 99)
}
export function writeCloudCart(slug: string, rows: CloudCartRow[]): void {
  if(getMerchantContext()?.storeSlug!==slug)throw Error('store_changed')
  wx.setStorageSync(storageKey(slug), rows)
  syncCloudBadge(slug)
}
export function syncCloudBadge(slug: string): void {
  const count = readCloudCart(slug).reduce((n, r) => n + r.quantity, 0)
  if (count) wx.setTabBarBadge({ index: 1, text: count > 99 ? '99+' : String(count), fail: () => {} })
  else wx.removeTabBarBadge({ index: 1, fail: () => {} })
}
export async function changeCloudCart(slug: string, productId: string, delta: number): Promise<boolean> {
  const context=supportIdentity();if(getMerchantContext()?.storeSlug!==slug)return false
  if (!productId || !Number.isSafeInteger(delta)) return false
  let stockLimit:number|null=null
  if (delta > 0) {
    try {
      const cfg = cloudCartConfig()
      if (!cfg || cfg.storeSlug !== slug) throw new Error('store_changed')
      const products = await getRemoteProducts(cfg.apiBase,cfg.storeSlug,[productId])
      const product = products.find(p=>p.id===productId)
      const current = cloudCartConfig()
      if (!product || product.soldOut || !stockAllows(product) || !current || current.apiBase !== cfg.apiBase || current.storeSlug !== slug) throw new Error('product_unavailable')
      stockLimit=product.stockMode==='finite'?Number(product.stockQuantity):null
    } catch (_) { wx.showToast({title:'商品不可购买或读取失败，请刷新',icon:'none'}); return false }
  }
  if(context!==supportIdentity())return false
  const rows = readCloudCart(slug)
  if(delta>0&&!rows.some(r=>r.productId===productId)&&rows.length>=40){wx.showToast({title:'购物车最多40种商品',icon:'none'});return false}
  const row = rows.find(r => r.productId === productId)
  if(delta>0&&stockLimit!==null&&(row?row.quantity:0)+delta>stockLimit){wx.showToast({title:'库存不足，请减少数量',icon:'none'});return false}
  if (!row && delta > 0) rows.push({ productId, quantity: Math.min(99, delta) })
  else if (row) row.quantity = Math.max(0, Math.min(99, row.quantity + delta))
  writeCloudCart(slug, rows.filter(r => r.quantity > 0))
  return true
}
export async function cloudCartDetails(cfg: { apiBase: string; storeSlug: string }): Promise<any> {
  const context=supportIdentity()
  // The remote catalog is the price authority for the display, never local demo data.
  const selected=readCloudCart(cfg.storeSlug)
  const catalog = selected.length?await getRemoteProducts(cfg.apiBase, cfg.storeSlug,selected.map(r=>r.productId)) as any[]:[]
  if(context!==supportIdentity()||getMerchantContext()?.apiBase!==cfg.apiBase||getMerchantContext()?.storeSlug!==cfg.storeSlug)throw Error('store_or_identity_changed')
  const cart = readCloudCart(cfg.storeSlug)
  const items: any[] = []
  for (const row of cart) {
    const p = catalog.find(r => String(r.id) === row.productId)
    if (!p || p.active === false || p.soldOut) continue
    const cents = Number(p.effectivePriceCents !== undefined && p.effectivePriceCents !== null ? p.effectivePriceCents : (p.currentPriceCents !== undefined && p.currentPriceCents !== null ? p.currentPriceCents : p.priceCents))
    if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('invalid_remote_price')
    items.push({ productId: row.productId, quantity: row.quantity, name: String(p.name || ''), imageUrl: String(p.imageUrl || ''), price: cents / 100, subtotal: cents * row.quantity / 100, priceText: (cents / 100).toFixed(2), subtotalText: (cents * row.quantity / 100).toFixed(2),stockInsufficient:!stockAllows(p,row.quantity),inventoryText:p.stockMode==='finite'?`可销售库存 ${p.stockQuantity} 件${!stockAllows(p,row.quantity)?'，库存不足，请减少数量':''}`:'不限库存' })
  }
  // Keep unavailable items in storage until a later user decision; never silently delete purchases.
  const totalCents = items.reduce((sum, row) => sum + Math.round(row.subtotal * 100), 0)
  return { items, totalCount: items.reduce((sum, row) => sum + row.quantity, 0), totalText: (totalCents / 100).toFixed(2) }
}
