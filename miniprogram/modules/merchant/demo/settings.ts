import type { HoursConfig } from '../../shared/domain/business'
import type { DeliveryConfig } from '../../shared/domain/delivery'
import { writeDemoConfiguration } from '../../shared/demo/configuration'
export { loadHours,businessState } from '../../shared/demo/storeHours'
export type { HoursConfig,DayHours } from '../../shared/domain/business'
export * from '../../shared/demo/delivery'
export { getMinimumOrder,minimumOrderShortfall,minimumShortfallCents } from '../../shared/demo/minimumOrder'
export { validateDeliveryConfig } from '../../shared/domain/deliveryRules'
export function saveHours(value:HoursConfig):void{writeDemoConfiguration('hours',value)}
export function saveDelivery(value:DeliveryConfig):void{writeDemoConfiguration('delivery',value)}
export function saveMinimumOrder(value:number):void{
 if(!Number.isFinite(value)||value<0||value>999999)throw Error('Invalid minimum order')
 writeDemoConfiguration('minimum',Math.round(value*100)/100)
}
