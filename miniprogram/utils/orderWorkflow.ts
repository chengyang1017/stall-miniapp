import { DemoOrder, loadDemoOrders } from './orders'

export type FulfillmentStatus = 'new' | 'accepted' | 'preparing' | 'delivering' | 'delivered'
export interface WorkflowOrder extends DemoOrder {
  fulfillmentStatus?: FulfillmentStatus
  estimatedArrival?: string
  deliveredAt?: string
}
const KEY = 'stall_demo_orders_v1'
export function loadWorkflowOrders(): WorkflowOrder[] {
  return loadDemoOrders() as WorkflowOrder[]
}
export function updateWorkflowOrder(id: string, action: FulfillmentStatus | 'eta', eta = ''): boolean {
  const orders = loadWorkflowOrders()
  const order = orders.find(o => o.id === id)
  if (!order) return false
  const current = order.fulfillmentStatus || 'new'
  const transitions: Record<FulfillmentStatus, FulfillmentStatus | null> = {
    new: 'accepted', accepted: 'preparing', preparing: 'delivering',
    delivering: 'delivered', delivered: null
  }
  if (action === 'eta') {
    if (current === 'delivered' || current === 'new') return false
    if (eta.length > 60) return false
    order.estimatedArrival = eta.trim()
  } else {
    if (transitions[current] !== action) return false
    if (action === 'delivered' && !(order as any).deliveryPhotoPath) return false
    order.fulfillmentStatus = action
    if (action === 'delivered') order.deliveredAt = new Date().toISOString()
  }
  wx.setStorageSync(KEY, orders)
  return true
}
export function workflowLabel(status?: FulfillmentStatus): string {
  if ((status as string) === 'cancelled' || (status as string) === 'canceled') return '已取消'
  if ((status as string) === 'abnormal') return '配送异常'
  const map: Record<FulfillmentStatus, string> = {
    new: '新订单', accepted: '已接单', preparing: '备货中',
    delivering: '配送中', delivered: '已送达（演示）'
  }
  return map[status || 'new'] || '新订单'
}
export function chinaTime(iso: string): string {
  const timestamp = Date.parse(iso)
  if (!Number.isFinite(timestamp)) return iso
  const shifted = new Date(timestamp + 8 * 60 * 60 * 1000)
  return shifted.toISOString().replace('T', ' ').slice(0, 16) + ' (UTC+8)'
}
