import type { SavedAddress } from '../domain/address'
import type { PublicDeliveryArea } from '../../shared/domain/delivery'
export type { PublicDeliveryArea } from '../../shared/domain/delivery'
export { deliveryStoreKey } from '../../shared/domain/delivery'
export function resolveDeliveryArea(address:SavedAddress,areas:PublicDeliveryArea[],storeKey:string):PublicDeliveryArea|undefined {
  if(address.deliveryStoreKey&&address.deliveryStoreKey!==storeKey)return undefined
  if(address.deliveryAreaId)return address.deliveryStoreKey===storeKey?areas.find(a=>a.id===address.deliveryAreaId):undefined
  const matches=areas.filter(a=>a.name===address.area)
  return matches.length===1?matches[0]:undefined
}
export function deliveryAddressReason(address:SavedAddress,areas:PublicDeliveryArea[],storeKey:string):string {
  const area=resolveDeliveryArea(address,areas,storeKey)
  if(!area)return '不可配送：原区域已删除或不属于当前店铺，请编辑重选'
  if(!area.enabled)return '不可配送：该区域已暂停'
  if(area.requiresLocation&&(!Number.isFinite(address.latitude)||!Number.isFinite(address.longitude)))return '不可配送：该区域需补充地图位置'
  return ''
}
