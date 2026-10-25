import type { FulfillmentStatus } from './orders'
export function workflowLabel(status?: FulfillmentStatus): string {
  if ((status as string) === 'cancelled' || (status as string) === 'canceled') return '已取消'
  if ((status as string) === 'abnormal') return '配送异常'
  const map: Record<FulfillmentStatus, string> = {
    new: '新订单', accepted: '已接单', preparing: '备货中',
    delivering: '配送中', delivered: '已送达（演示）',cancelled:'已取消',abnormal:'配送异常'
  }
  return map[status || 'new'] || '新订单'
}
