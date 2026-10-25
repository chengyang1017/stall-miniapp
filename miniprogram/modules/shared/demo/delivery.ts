import type { DeliveryConfig } from '../domain/delivery'
export type { DeliveryArea,DeliverySlot,SpecialDeliveryDate,DeliveryConfig } from '../domain/delivery'
const KEY = 'stall_delivery_v1'
const defaults: DeliveryConfig = {
  areas: [{id:'area1',name:'阳光小区',enabled:true}],
  slots: [{id:'slot1',label:'午间',start:'11:00',end:'13:00',enabled:true}, {id:'slot2',label:'晚间',start:'17:00',end:'19:00',enabled:true}]
}
export function loadDelivery(): DeliveryConfig {
  const saved = wx.getStorageSync(KEY) as DeliveryConfig | undefined
  if (saved && Array.isArray(saved.areas) && Array.isArray(saved.slots)) return saved
  return JSON.parse(JSON.stringify(defaults)) as DeliveryConfig
}
export function availableAreas() { return loadDelivery().areas.filter(a=>a.enabled) }
export function availableSlots(areaId?:string,now=new Date()) {
  const c=loadDelivery(),day=new Date(now.getTime()+8*3600000),date=day.toISOString().slice(0,10)
  if(c.deliveryPaused||(c.specialDates||[]).some(d=>d.date===date&&d.paused))return []
  return c.slots.filter(s=>s.enabled&&(!s.weekdays||s.weekdays.includes(day.getUTCDay()))&&(!s.areaIds||!!areaId&&s.areaIds.includes(areaId)))
}
// Client-side demo check. The server must revalidate before real orders.
export function isPointDeliverable(areaName: string, latitude?: number | null, longitude?: number | null): boolean {
  const area = availableAreas().find(a => a.name === areaName)
  if (!area) return false
  if (area.centerLat == null || area.centerLng == null || area.radiusMeters == null) return true
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(latitude - area.centerLat)
  const dLng = toRad(longitude - area.centerLng)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(latitude)) * Math.cos(toRad(area.centerLat)) * Math.sin(dLng / 2) ** 2
  const distance = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
  return distance <= area.radiusMeters
}
