import { loadStore, effectivePrice } from './store'
import { getCartDetails, CartDisplayItem } from './cart'

const KEY = 'stall_direct_purchase_v1'
interface DirectSelection { productId: string; quantity: number }
export function setDirectPurchase(productId: string, quantity: number): void {
  wx.setStorageSync(KEY, { productId, quantity } as DirectSelection)
}
export function clearDirectPurchase(): void { wx.removeStorageSync(KEY) }
export function hasDirectPurchase(): boolean { return !!wx.getStorageSync(KEY) }
export function getPurchaseDetails(): { items: CartDisplayItem[]; totalText: string; totalCount: number } {
  const selection = wx.getStorageSync(KEY) as DirectSelection | undefined
  if (!selection || !selection.productId) return getCartDetails()
  const quantity = selection.quantity
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return { items: [], totalText: '0.00', totalCount: 0 }
  const product = loadStore().products.find(p => p.id === selection.productId)
  if (!product || !product.available) return { items: [], totalText: '0.00', totalCount: 0 }
  const unitCents = Math.round(effectivePrice(product) * 100)
  const subtotalCents = unitCents * quantity
  const item: CartDisplayItem = {
    productId: product.id, name: product.name, quantity,
    price: unitCents / 100, subtotal: subtotalCents / 100,
    priceText: (unitCents / 100).toFixed(2), subtotalText: (subtotalCents / 100).toFixed(2)
  }
  return { items: [item], totalText: (subtotalCents / 100).toFixed(2), totalCount: quantity }
}
