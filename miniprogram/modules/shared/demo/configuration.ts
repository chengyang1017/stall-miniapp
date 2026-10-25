import type { HoursConfig } from '../domain/business'
import type { DeliveryConfig } from '../domain/delivery'
interface Settings {hours:HoursConfig;delivery:DeliveryConfig;minimum:number}
const keys={hours:'stall_store_hours_v1',delivery:'stall_delivery_v1',minimum:'stall_minimum_order_v1'}
export function writeDemoConfiguration<K extends keyof Settings>(kind:K,value:Settings[K]):void{wx.setStorageSync(keys[kind],value)}
