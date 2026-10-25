export const FULFILLMENT_STATES=['new','accepted','preparing','delivering','delivered','cancelled','abnormal'] as const
export type FulfillmentStatus=typeof FULFILLMENT_STATES[number]
export type PaymentStatus='unpaid'|'paid'|'refunded'|'partially_refunded'
export const ORDER_STEPS:Readonly<Record<FulfillmentStatus,FulfillmentStatus|null>>={new:'accepted',accepted:'preparing',preparing:'delivering',delivering:'delivered',delivered:null,cancelled:null,abnormal:null}
export interface OrderIdentity {id:string;createdAt:string;paymentStatus:PaymentStatus;fulfillmentStatus:FulfillmentStatus}
