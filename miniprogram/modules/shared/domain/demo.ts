import type { Category } from './catalog'
import type { OrderIdentity,FulfillmentStatus } from './orders'
export type { Category } from './catalog'
export interface Product {
  createdAt?: string; updatedAt?: string
  id: string; categoryId: string; name: string; price: number;
  discountPrice: number | null; discountStart: string; discountEnd: string;
  available: boolean; soldOut?: boolean; description?: string; imageUrl?: string
  publishAt?: string | null; version?: number; effectiveActive?: boolean
  stockMode?: 'unlimited' | 'finite'; stockQuantity?: number; lowStockThreshold?: number; inventoryVersion?: number
}
export interface InventoryMovement { id:string; productId:string; orderId?:string|null; beforeMode:string; afterMode:string; beforeQuantity:number; delta:number; afterQuantity:number; source:string; reason:string; createdAt:string }
export interface DemoReservation {orderId:string;productId:string;quantity:number;expiresAt:string;state:'held'|'released'|'committed'}
export interface ProductDraftPayload {
  productName: string; productDescription: string; selectedCategory: string
  priceText: string; discountText: string; startText: string; endText: string
  imageObjectKey: string | null; productImageUrl?: string
  isAvailable: boolean; isSoldOut: boolean
  scheduleEnabled: boolean; scheduleDate: string; scheduleTime: string
  discountStartUtc?: string | null; discountEndUtc?: string | null
  stockMode?: 'unlimited'|'finite'; stockQuantityText?:string; lowStockThresholdText?:string
}
export interface ProductDraft { id: string; payload: ProductDraftPayload; version: number; imageUrl?: string; createdAt?: string; updatedAt?: string }
export interface StoreData { categories: Category[]; products: Product[]; drafts?: ProductDraft[]; timeZone?: string;
  inventoryMovements?:InventoryMovement[]; inventoryReservations?:DemoReservation[]; inventoryOrders?:Array<any> }
export interface DemoOrderItem {
  categoryIdSnapshot?: string | null
  categoryNameSnapshot?: string | null
  productId: string
  name: string
  quantity: number
  price: number
  subtotal: number
}

export interface DemoOrder extends Pick<OrderIdentity,'id'|'createdAt'> {
  merchantNote?:string
  merchantNoteVersion?:number
  inventoryState?: 'none'|'held'|'released'|'committed'
  inventoryExpiresAt?:string
  fulfillmentStatus?:string
  paymentStatus: 'unpaid'
  status: 'pending_payment'
  items: DemoOrderItem[]
  totalText: string
  receiverName: string
  phone: string
  area: string
  detail: string
  note: string
  slotId: string
  slotText: string
}


export interface WorkflowOrder extends DemoOrder {fulfillmentStatus?:FulfillmentStatus;estimatedArrival?:string;deliveredAt?:string}
export interface OrderDraftLine {productId:string;name:string;quantity:number;price:number;subtotal:number}
