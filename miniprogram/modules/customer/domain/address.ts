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

