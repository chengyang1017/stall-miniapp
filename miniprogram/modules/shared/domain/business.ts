export interface DayHours { enabled: boolean; start: string; end: string }
export interface HoursConfig { accepting: boolean; notice: string; days: DayHours[] }
export interface CloudBusiness extends HoursConfig {storeName?:string;configured:boolean;open:boolean;label:string;minimumOrderCents:number;revision?:string|null;timeZone:string;deliveryPaused?:boolean;todayDeliveryPaused?:boolean;noteTags?:string[];placeholderStyle?:string;placeholderImageKey?:string|null;customPlaceholderUrl?:string|null}
