export interface SavedAddress {
  id: string
  receiverName: string
  phone: string
  area: string
  detail: string
  isDefault: boolean
}

const KEY = 'stall_addresses_v1'
const SELECTED_KEY = 'stall_selected_address_v1'

export function loadAddresses(): SavedAddress[] {
  const value = wx.getStorageSync(KEY)
  return Array.isArray(value) ? value : []
}

export function saveAddresses(items: SavedAddress[]): void {
  wx.setStorageSync(KEY, items)
}

export function getSelectedAddress(): SavedAddress | undefined {
  const items = loadAddresses()
  const selectedId = wx.getStorageSync(SELECTED_KEY)
  return items.find(a => a.id === selectedId) || items.find(a => a.isDefault) || items[0]
}

export function selectAddress(id: string): void {
  wx.setStorageSync(SELECTED_KEY, id)
}
