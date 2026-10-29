// A fulfillment permission is not evidence of real money received.
export function paymentLabel(order:any):string{
 if(order.paymentSource==='staging_simulated')return order.paymentStatus==='paid'?'测试订单 · 模拟支付已确认（非真实收款）':'测试订单 · 模拟支付状态待核对'
 return ({unpaid:'待支付',paid:'后台标记已支付（未独立核验）',refunded:'已退款状态（待核验）',partially_refunded:'部分退款状态（待核验）'} as Record<string,string>)[order.paymentStatus]||'支付状态待核实'
}
export function fulfillmentPaymentReady(order:any):boolean{return order.paymentStatus==='paid'}
