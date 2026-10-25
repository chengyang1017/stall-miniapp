export interface DeliveryArea { id: string; name: string; enabled: boolean; centerLat?: number; centerLng?: number; radiusMeters?: number }
export interface DeliverySlot { id: string; label: string; start: string; end: string; enabled: boolean; weekdays?:number[];areaIds?:string[]; centerLat?: number; centerLng?: number; radiusMeters?: number }
export interface SpecialDeliveryDate {date:string;paused:boolean}
export interface DeliveryConfig { areas: DeliveryArea[]; slots: DeliverySlot[];deliveryPaused?:boolean;specialDates?:SpecialDeliveryDate[] }
export interface PublicDeliveryArea {id:string;name:string;enabled:boolean;requiresLocation?:boolean}
export function deliveryStoreKey(cfg:{apiBase:string;storeSlug:string}):string{return cfg.apiBase.replace(/\/$/,'')+'/'+cfg.storeSlug}
