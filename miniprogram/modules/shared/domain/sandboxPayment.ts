export function sandboxPaymentView(data:any){
 const paymentNames:Record<string,string>={creating:'付款请求恢复中',open:'待付款',processing:'付款处理中',succeeded:'Sandbox 付款已确认',failed:'付款失败，可重试',cancelled:'已取消付款',expired:'付款超时',refund_required:'已收测试款，补偿退款处理中',review:'支付结果需人工核对',refunded:'异常收款已核实全额退回'}
 const refundNames:Record<string,string>={pending:'退款申请已保存',processing:'退款处理中',submitted:'退款已提交，待渠道确认',succeeded:'退款成功',review:'退款失败或结果不确定，需人工核对'}
 const channels:Record<string,string>={card:'银行卡',alipay:'支付宝',wechat_pay:'微信（Stripe 外部测试）'}
 const attempts=(data.attempts||[]).map((a:any)=>({...a,label:a.status==='open'&&a.failureCode?'付款失败，可在原会话重试':paymentNames[a.status]||'待核对',channelText:channels[a.actualChannel||a.channel]||'待核对',amountText:(Number(a.amountCents)/100).toFixed(2)}))
 const refunds=(data.refunds||[]).map((r:any)=>({...r,kindText:r.kind==='review_compensation'?'渠道异常补偿退款':r.kind==='merchant'?'商家退款':'超时收款补偿退款',label:refundNames[r.status]||'待核对',amountText:(Number(r.amountCents)/100).toFixed(2)}))
 // Summarize only provider-confirmed refunds as completed; a submitted, pending
 // or manual-review refund is never presented as money already returned.
 const refundCents=(items:any[])=>items.reduce((sum:number,r:any)=>sum+(Number.isSafeInteger(Number(r.amountCents))&&Number(r.amountCents)>0?Number(r.amountCents):0),0)
 const confirmedRefunds=refunds.filter((r:any)=>r.status==='succeeded')
 const awaitingRefunds=refunds.filter((r:any)=>['pending','processing','submitted'].includes(r.status))
 const reviewRefunds=refunds.filter((r:any)=>r.status==='review')
 const merchantRefunds=refunds.filter((r:any)=>r.kind==='merchant')
 const confirmedMerchantCents=refundCents(merchantRefunds.filter((r:any)=>r.status==='succeeded'))
 const confirmedMerchantPayment=attempts.find((a:any)=>a.status==='succeeded')
 const originalPaidCents=confirmedMerchantPayment?Number(confirmedMerchantPayment.amountCents):0
 const confirmedRemainingCents=originalPaidCents>0?Math.max(0,originalPaidCents-confirmedMerchantCents):0
 const money=(value:number)=>(value/100).toFixed(2)
 const refundSummary={hasRefunds:refunds.length>0,
  completedText:money(refundCents(confirmedRefunds)),
  awaitingText:money(refundCents(awaitingRefunds)),
  reviewText:money(refundCents(reviewRefunds)),
  merchantCompletedText:money(confirmedMerchantCents),
  merchantRemainingText:money(confirmedRemainingCents),
  merchantPaidKnown:originalPaidCents>0,
  hasAwaiting:awaitingRefunds.length>0,hasReview:reviewRefunds.length>0}
 const receipts=(data.receipts||[]).map((r:any)=>({...r,totalText:(Number(r.totalCents)/100).toFixed(2),subtotalText:(Number(r.subtotalCents)/100).toFixed(2),deliveryFeeText:(Number(r.deliveryFeeCents)/100).toFixed(2),channelText:channels[r.channel]||'待核对',items:(r.items||[]).map((i:any)=>({...i,unitText:(Number(i.unitPriceCents)/100).toFixed(2),lineTotalText:(Number(i.lineTotalCents)/100).toFixed(2)}))}))
 const mismatchRefunds=refunds.filter((r:any)=>r.kind==='review_compensation')
 const latestAttempt=attempts.length?attempts[attempts.length-1]:null
 const retryChannel=latestAttempt&&['failed','expired','cancelled'].includes(latestAttempt.status)&&['card','alipay','wechat_pay'].includes(latestAttempt.channel)?latestAttempt.channel:null
 const retryLabel=latestAttempt?.status==='failed'?'上次付款未成功，可重新尝试':latestAttempt?.status==='expired'?'上次付款已过期，可重新尝试':latestAttempt?.status==='cancelled'?'上次付款已取消，可重新选择':''
 const resumed=data.resumeCheckout
 const resumeCheckout=resumed&&['card','alipay','wechat_pay'].includes(resumed.channel)&&typeof resumed.url==='string'&&/^https:\/\/checkout\.stripe\.com\//.test(resumed.url)
  ?{channel:resumed.channel,channelText:channels[resumed.channel],url:resumed.url}:null
 return {attempts,refunds,receipts,refundSummary,resumeCheckout,retryChannel,retryLabel,
  retryChannelText:retryChannel?channels[retryChannel]:'',
  requiresPaymentReview:latestAttempt?.status==='review'||latestAttempt?.status==='processing'||latestAttempt?.status==='creating',
  hasMismatchRefund:mismatchRefunds.length>0,
  hasSuccessfulMismatchRefund:mismatchRefunds.some((r:any)=>r.status==='succeeded'&&!!r.refundId),
  stale:data.stale===true,canRefund:data.canRefund===true,
  refundableAmountCents:Number.isSafeInteger(data.refundableAmountCents)&&data.refundableAmountCents>0?data.refundableAmountCents:0,
  refundableAmountText:(Math.max(0,Number(data.refundableAmountCents)||0)/100).toFixed(2)}
}

/** Text-only export of an immutable server receipt; never creates or changes a payment. */
export function sandboxReceiptText(receipt:any):string{
 if(!receipt?.sandbox||!receipt.id||!receipt.sha256||!receipt.orderId)return ''
 const money=(cents:any)=>(Number(cents)/100).toFixed(2)
 const items=Array.isArray(receipt.items)?receipt.items:[]
 return [
  'Stripe Sandbox 测试电子小票',
  String(receipt.notice||'测试交易，不代表真实收款'),
  '订单编号：'+receipt.orderId,
  '支付渠道：'+(receipt.channelText||receipt.channel||'未确认'),
  '支付时间：'+(receipt.paidAt||'未记录'),
  ...items.map((item:any)=>String(item.name||'商品')+' × '+Number(item.quantity)+'  ¥'+money(item.lineTotalCents)),
  '商品小计：¥'+money(receipt.subtotalCents),
  '配送费：¥'+money(receipt.deliveryFeeCents),
  '合计：¥'+money(receipt.totalCents),
  '交易参考：'+(receipt.transactionId||'未记录'),
  'PaymentIntent：'+(receipt.paymentIntentId||'未记录'),
  '小票校验摘要：'+receipt.sha256
 ].join('\n')
}
