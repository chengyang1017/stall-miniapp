import { CartDisplayItem } from './cart'

// 仅供单设备演示。上线前必须迁移至具备身份验证和权限控制的服务端。
export interface DemoOrderItem {
  productId: string
  name: string
  quantity: number
  price: number
  subtotal: number
}

export interface DemoOrder {
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
  return Array.isArray(value) ? value : []
}

export function createDemoOrder(input: OrderInput): DemoOrder {
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
      subtotal: item.subtotal
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
  wx.setStorageSync(KEY, [order, ...loadDemoOrders()])
  return order
}
