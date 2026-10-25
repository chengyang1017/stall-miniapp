// Local demo setting; server-side validation required before production.
const KEY = 'stall_minimum_order_v1'
export function getMinimumOrder(): number {
  const raw = Number(wx.getStorageSync(KEY) || 0)
  return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) / 100 : 0
}
export function minimumOrderShortfall(totalText: string): number {
  const total = Number(totalText)
  const cents = Number.isFinite(total) && total > 0 ? Math.round(total * 100) : 0
  return Math.max(0, Math.round(getMinimumOrder() * 100) - cents) / 100
}
export { minimumShortfallCents } from '../domain/money'
