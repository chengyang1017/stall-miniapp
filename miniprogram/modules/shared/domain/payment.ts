// A fulfillment permission is not evidence of real money received.
export function paymentLabel(order:any):string{
 if(order.paymentSource==='staging_simulated')return order.paymentStatus==='paid'?'测试订单 · 模拟支付已确认（非真实收款）':'测试订单 · 模拟支付状态待核对'
 if(['pending','processing','submitted','review'].includes(order.sandboxRefundStatus))return order.sandboxRefundStatus==='review'?'Sandbox 退款失败或待人工核对':'Sandbox 退款处理中（非真实收款）'
 if(order.paymentSource==='stripe:sandbox')return ({paid:'Stripe Sandbox 测试付款已确认（非真实收款）',refunded:'Sandbox 已全额退款',partially_refunded:'Sandbox 已部分退款'} as Record<string,string>)[order.paymentStatus]||'Sandbox 支付状态待核对'
 if(order.sandboxPaymentStatus)return ({creating:'Sandbox 付款请求恢复中',open:'Sandbox 待付款',failed_retryable:'Sandbox 付款失败，可在原会话重试',processing:'Sandbox 付款处理中',failed:'Sandbox 付款失败，可重试',cancelled:'Sandbox 付款已取消',expired:'Sandbox 付款超时',refund_required:'Sandbox 补偿退款待处理',review:'Sandbox 支付需人工核对'} as Record<string,string>)[order.sandboxPaymentStatus]||'Sandbox 支付状态待核对'
 return ({unpaid:'待支付',paid:'后台标记已支付（未独立核验）',refunded:'已退款状态（待核验）',partially_refunded:'部分退款状态（待核验）'} as Record<string,string>)[order.paymentStatus]||'支付状态待核实'
}
export function fulfillmentPaymentReady(order:any):boolean{return order.paymentStatus==='paid'}
