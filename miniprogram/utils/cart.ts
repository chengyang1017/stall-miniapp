
import { loadStore, effectivePrice } from './store'

export interface CartItem {
  productId: string
  quantity: number
}

export interface CartDisplayItem {
  productId: string
  name: string
  quantity: number
  price: number
  subtotal: number
  priceText: string
  subtotalText: string
}

const CART_KEY = 'stall_cart_v1'

export function loadCart(): CartItem[] {
  const data = wx.getStorageSync(CART_KEY)
  if (!Array.isArray(data)) return []

  return data.filter(
    (item: CartItem) =>
      typeof item.productId === 'string' &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0
  )
}

export function saveCart(items: CartItem[]): void {
  wx.setStorageSync(CART_KEY, items)
}

export function addToCart(productId: string): void {
  const product = loadStore().products.find(
    p => p.id === productId
  )

  if (!product || !product.available) return

  const cart = loadCart()
  const item = cart.find(p => p.productId === productId)

  if (item) {
    item.quantity += 1
  } else {
    cart.push({ productId, quantity: 1 })
  }

  saveCart(cart)
}

export function changeQuantity(
  productId: string,
  delta: number
): void {
  const cart = loadCart()
  const item = cart.find(p => p.productId === productId)

  if (!item) return

  item.quantity += delta

  saveCart(
    cart.filter(p => p.quantity > 0)
  )
}

export function getCartDetails() {
  const products = loadStore().products
  const cart = loadCart()

  const items: CartDisplayItem[] = []

  for (const entry of cart) {
    const product = products.find(
      p => p.id === entry.productId
    )

    if (!product || !product.available) continue

    const price = effectivePrice(product)
    const subtotal = Math.round(
      price * entry.quantity * 100
    ) / 100

    items.push({
      productId: product.id,
      name: product.name,
      quantity: entry.quantity,
      price,
      subtotal,
      priceText: price.toFixed(2),
      subtotalText: subtotal.toFixed(2)
    })
  }

  // 清理已经删除或下架的商品
  saveCart(items.map(item => ({
    productId: item.productId,
    quantity: item.quantity
  })))

  const totalCents = items.reduce(
    (sum, item) => sum + Math.round(item.subtotal * 100),
    0
  )

  return {
    items,
    totalText: (totalCents / 100).toFixed(2),
    totalCount: items.reduce(
      (sum, item) => sum + item.quantity, 0
    )
  }
}
