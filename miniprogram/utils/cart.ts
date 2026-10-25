
import { loadStore, effectivePrice, productIsPublished, stockAllows } from './store'

export interface CartItem {
  productId: string
  quantity: number
}

export interface CartDisplayItem {
  stockInsufficient?:boolean
  inventoryText?:string
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
  syncCartTabBadge()
}

export function addToCart(productId: string, quantity=1): boolean {
  const product = loadStore().products.find(
    p => p.id === productId
  )

  if (!product || !productIsPublished(product) || product.soldOut || !stockAllows(product) || !Number.isSafeInteger(quantity) || quantity<1) return false

  const cart = loadCart()
  const item = cart.find(p => p.productId === productId)
  if(!stockAllows(product,(item?item.quantity:0)+quantity)){wx.showToast({title:'库存不足',icon:'none'});return false}

  if (item) {
    item.quantity += quantity
  } else {
    cart.push({ productId, quantity })
  }

  saveCart(cart)
  return true
}

export function changeQuantity(
  productId: string,
  delta: number
): void {
  if (delta > 0) {
    const product = loadStore().products.find(p=>p.id===productId)
    if (!product || !productIsPublished(product) || product.soldOut || !stockAllows(product,(loadCart().find(row=>row.productId===productId)?.quantity || 0)+delta)) {wx.showToast({title:'库存不足或商品不可购买',icon:'none'});return}
  }
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

    if (!product || !productIsPublished(product) || product.soldOut) continue

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
      subtotalText: subtotal.toFixed(2),
      stockInsufficient:!stockAllows(product,entry.quantity),inventoryText:product.stockMode==='finite'?`可销售库存 ${product.stockQuantity} 件${!stockAllows(product,entry.quantity)?'，库存不足，请减少数量':''}`:'不限库存'
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

// CART_TAB_BADGE_V1
export function syncCartTabBadge(): void {
  const rows = wx.getStorageSync('stall_cart_v1')
  const count = Array.isArray(rows) ? rows.reduce((sum: number, row: any) => {
    const n = Number(row && row.quantity)
    return sum + (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)
  }, 0) : 0
  if (count > 0) {
    wx.setTabBarBadge({ index: 1, text: count > 99 ? '99+' : String(count), fail: () => {} })
  } else {
    wx.removeTabBarBadge({ index: 1, fail: () => {} })
  }
}
