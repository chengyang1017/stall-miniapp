export interface SavedAddress {
  version?:number
  deliveryAreaId?:string
  deliveryStoreKey?:string
  id: string
  receiverName: string
  phone: string
  area: string
  detail: string
  isDefault: boolean
  latitude?: number
  longitude?: number
  locationName?: string
  mapAddress?: string
}

const KEY = 'stall_addresses_v1'
const SELECTED_KEY = 'stall_selected_address_v1'
import { getMerchantContext } from './merchantContext'
import { cachedCloudAddresses,selectedCloudAddress,selectCloudAddress } from './cloudAddresses'

export function loadAddresses(): SavedAddress[] {
  if(getMerchantContext())return cachedCloudAddresses()
  const value = wx.getStorageSync(KEY)
  return Array.isArray(value) ? value : []
}

export function saveAddresses(items: SavedAddress[]): void {
  if(getMerchantContext())throw Error('cloud_address_requires_authorized_api')
  wx.setStorageSync(KEY, items)
}

export function getSelectedAddress(): SavedAddress | undefined {
  if(getMerchantContext())return selectedCloudAddress()
  const items = loadAddresses()
  const selectedId = wx.getStorageSync(SELECTED_KEY)
  return items.find(a => a.id === selectedId) || items.find(a => a.isDefault) || items[0]
}

export function selectAddress(id: string): void {
  if(getMerchantContext()){selectCloudAddress(id);return}
  wx.setStorageSync(SELECTED_KEY, id)
}
