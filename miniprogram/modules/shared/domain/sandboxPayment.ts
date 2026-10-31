export function sandboxPaymentView(data:any){
 const paymentNames:Record<string,string>={creating:'付款请求恢复中',open:'待付款',processing:'付款处理中',succeeded:'Sandbox 付款已确认',failed:'付款失败，可重试',cancelled:'已取消付款',expired:'付款超时',refund_required:'已收测试款，补偿退款处理中',review:'支付结果需人工核对'}
 const refundNames:Record<string,string>={pending:'退款申请已保存',processing:'退款处理中',submitted:'退款已提交，待渠道确认',succeeded:'退款成功',review:'退款失败或结果不确定，需人工核对'}
 const channels:Record<string,string>={card:'银行卡',alipay:'支付宝',wechat_pay:'微信（Stripe 外部测试）'}
 const attempts=(data.attempts||[]).map((a:any)=>({...a,label:a.status==='open'&&a.failureCode?'付款失败，可在原会话重试':paymentNames[a.status]||'待核对',channelText:channels[a.actualChannel||a.channel]||'待核对',amountText:(Number(a.amountCents)/100).toFixed(2)}))
 const refunds=(data.refunds||[]).map((r:any)=>({...r,label:refundNames[r.status]||'待核对',amountText:(Number(r.amountCents)/100).toFixed(2)}))
 const receipts=(data.receipts||[]).map((r:any)=>({...r,totalText:(Number(r.totalCents)/100).toFixed(2),channelText:channels[r.channel]||'待核对',items:(r.items||[]).map((i:any)=>({...i,unitText:(Number(i.unitPriceCents)/100).toFixed(2)}))}))
 return {attempts,refunds,receipts,stale:data.stale===true,canRefund:data.canRefund===true}
}
