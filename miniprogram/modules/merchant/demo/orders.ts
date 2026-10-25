import type { WorkflowOrder } from '../../shared/domain/demo'
import type { FulfillmentStatus } from '../../shared/domain/orders'
import { ORDER_STEPS } from '../../shared/domain/orders'
import { loadDemoOrders,saveDemoOrders } from '../../shared/demo/repository'
export { saveDemoOrders,loadDemoOrders } from '../../shared/demo/repository'
export type { WorkflowOrder } from '../../shared/domain/demo'
export function loadWorkflowOrders():WorkflowOrder[]{return loadDemoOrders() as WorkflowOrder[]}
export function updateWorkflowOrder(id: string, action: FulfillmentStatus | 'eta', eta = ''): boolean {
  const orders = loadWorkflowOrders()
  const order = orders.find(o => o.id === id)
  if (!order) return false
  const current = order.fulfillmentStatus || 'new'
  const transitions=ORDER_STEPS
  if (action === 'eta') {
    if (current === 'delivered' || current === 'new') return false
    if (eta.length > 60) return false
    order.estimatedArrival = eta.trim()
  } else {
    if(order.inventoryState==='held'&&order.paymentStatus==='unpaid')return false
    if(order.inventoryState==='released')return false
    if (transitions[current] !== action) return false
    if (action === 'delivered' && !(order as any).deliveryPhotoPath) return false
    order.fulfillmentStatus = action
    if (action === 'delivered') order.deliveredAt = new Date().toISOString()
  }
  saveDemoOrders(orders)
  return true
}
export { workflowLabel } from '../../shared/domain/orderLabels'
export { chinaTime } from '../../shared/domain/time'
