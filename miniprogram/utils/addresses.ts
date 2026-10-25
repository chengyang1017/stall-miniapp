import type { SavedAddress } from '../modules/customer/domain/address'
export type { SavedAddress } from '../modules/customer/domain/address'
const KEY = 'stall_addresses_v1'
const SELECTED_KEY = 'stall_selected_address_v1'
import { getCloudContext } from '../modules/shared/runtime/context'
import { cachedCloudAddresses, selectedCloudAddress, selectCloudAddress } from '../modules/customer/api/addresses'

export function loadAddresses(): SavedAddress[] {
  if(getCloudContext())return cachedCloudAddresses()
  const value = wx.getStorageSync(KEY)
  return Array.isArray(value) ? value : []
}

export function saveAddresses(items: SavedAddress[]): void {
  if(getCloudContext())throw Error('cloud_address_requires_authorized_api')
  wx.setStorageSync(KEY, items)
}

export function getSelectedAddress(): SavedAddress | undefined {
  if(getCloudContext())return selectedCloudAddress()
  const items = loadAddresses()
  const selectedId = wx.getStorageSync(SELECTED_KEY)
  return items.find(a => a.id === selectedId) || items.find(a => a.isDefault) || items[0]
}

export function selectAddress(id: string): void {
  if(getCloudContext()){selectCloudAddress(id);return}
  wx.setStorageSync(SELECTED_KEY, id)
}
