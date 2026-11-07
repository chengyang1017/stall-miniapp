import {getSessionToken,cloudIdentity} from '../../shared/runtime/context'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export interface WechatLiveReceipt{
 type:'wechat_payment_record';invoice:false;provider:'wechatpay:live';currency:'CNY'
 orderId:string;storeName:string;transactionId:string;paidAt:string
 lines:{name:string;quantity:number;unitCents:number;lineCents:number}[]
 subtotalCents:number;deliveryFeeCents:number;totalCents:number
 refundedCents:number;refundPendingCents:number;netCents:number;paymentStatus:string;notice:string
}
export function formatWechatLiveReceipt(r:WechatLiveReceipt):string {
 const cash=(n:number)=>(n/100).toFixed(2)
 return ['微信支付记录（非税务发票）','店铺：'+r.storeName,'订单号：'+r.orderId,
  '微信支付交易号：'+r.transactionId,'付款时间：'+r.paidAt,
  ...r.lines.map(i=>i.name+' × '+i.quantity+'　¥'+cash(i.lineCents)),
  '商品金额：¥'+cash(r.subtotalCents),'配送费：¥'+cash(r.deliveryFeeCents),
  '原付款总额：¥'+cash(r.totalCents),'已成功退款：¥'+cash(r.refundedCents),
  '尚待确认的退款：¥'+cash(r.refundPendingCents),'已扣除成功退款金额：¥'+cash(r.netCents),
  r.notice].join('\n')
}
export function fetchWechatLiveReceipt(cfg:{apiBase:string;storeSlug:string},orderId:string,merchant=false):Promise<{receipt:WechatLiveReceipt;sha256:string}>{
 const identity=cloudIdentity(),token=getSessionToken()
 if(!token)return Promise.reject(Error('not_logged_in'))
 if(!uuid.test(orderId))return Promise.reject(Error('invalid_order_id'))
 const uri=cfg.apiBase.replace(/\/$/,'')+'/v1/'+(merchant?'merchant/':'')+'stores/'+cfg.storeSlug+'/orders/'+orderId+'/wechat-receipt'
 return new Promise((resolve,reject)=>wx.request({url:uri,method:'GET',timeout:15000,
  header:{Authorization:'Bearer '+token},
  success:(res:any)=>{
   if(identity!==cloudIdentity()){reject(Error('identity_changed'));return}
   const body=res.data
   if(res.statusCode!==200||!body||body.receipt?.type!=='wechat_payment_record'||
    body.receipt?.provider!=='wechatpay:live'||body.receipt?.invoice!==false||
    body.receipt?.orderId!==orderId||!/^[a-f0-9]{64}$/.test(body.sha256||'')){
    reject(Error('receipt_not_verified'));return
   }
   resolve(body)
  },fail:()=>reject(Error('receipt_network_unknown'))}))
}
