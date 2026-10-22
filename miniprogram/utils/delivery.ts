export interface DeliveryArea { id: string; name: string; enabled: boolean }
export interface DeliverySlot { id: string; label: string; start: string; end: string; enabled: boolean }
export interface DeliveryConfig { areas: DeliveryArea[]; slots: DeliverySlot[] }
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
export function saveDelivery(data: DeliveryConfig): void { wx.setStorageSync(KEY, data) }
export function availableAreas() { return loadDelivery().areas.filter(a=>a.enabled) }
export function availableSlots() { return loadDelivery().slots.filter(s=>s.enabled) }
