import {LIVE_WECHAT_PAY_ENABLED} from '../../config/cloud'
import { paymentLabel } from '../../modules/shared/domain/payment'
import {loadWorkflowOrders,workflowLabel} from '../../modules/merchant/demo/orders'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { authorizedGet } from '../../modules/shared/runtime/auth'
import { businessContextKey } from '../../modules/merchant/api/business'
import {shareCsvFile} from '../../utils/shareCsvFile'
import {getAbnormalReviews,appendAbnormalReview} from '../../utils/wechatAbnormalReview'
function localDay(value=new Date().toISOString()):string{const t=Date.parse(value);return Number.isFinite(t)?new Date(t+8*3600000).toISOString().slice(0,10):''}
function localTime(value:string):string{return new Date(Date.parse(value)+8*3600000).toISOString().slice(11,16)}
function yuan(cents:number):string{return (cents/100).toFixed(2)}
function cell(v:unknown):string{let s=String(v==null?'':v);if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
const cloudStatuses:Record<string,string>={new:'新订单',accepted:'已接单',preparing:'备货中',delivering:'配送中',delivered:'已送达',cancelled:'已取消',abnormal:'配送异常'}
Page({
 serial:0,context:'',cursor:'',reviewPendingKeys:{} as Record<string,string>,
 data:{livePayEnabled:LIVE_WECHAT_PAY_ENABLED,day:localDay(),allDates:false,rows:[] as any[],count:0,pending:0,delivered:0,cancelled:0,orderValue:'0.00',received:'0.00',refunded:'0.00',pendingRefunds:'0.00',netReceived:'0.00',abnormalCollections:'0.00',abnormalRecords:[] as any[],abnormalRecordsMore:false,reviewBusy:false,reviewRefunds:0,unpaid:'0.00',notice:'',cloudMode:false,loading:false,loadingMore:false,exporting:false,error:'',moreError:'',hasMore:false},
 onShow(){this.refresh()},onUnload(){this.serial++},
 async onPullDownRefresh(){try{if(!this.data.exporting)await this.refresh()}finally{wx.stopPullDownRefresh()}},
 chooseDay(e:any){if(this.data.exporting)return;this.setData({day:String(e.detail.value),allDates:false});this.refresh()},
 selectToday(){if(this.data.exporting)return;this.setData({day:localDay(),allDates:false});this.refresh()},
 selectAll(){if(this.data.exporting)return;this.setData({allDates:true});this.refresh()},
 query():Record<string,string|number>{return this.data.allDates?{all:'1'}:{from:this.data.day,to:this.data.day}},
 refresh(){return this.loadPage(true)},
 async loadMore(){if(this.data.loading||this.data.loadingMore||this.data.exporting||!this.data.hasMore)return;if(this.context!==businessContextKey()){await this.refresh();return}await this.loadPage(false)},
 async loadPage(reset:boolean):Promise<void>{
  if(this.data.exporting)return
  const cfg=getCloudContext(),context=businessContextKey(),serial=++this.serial;this.context=context
  if(reset){this.cursor='';this.setData({rows:[],count:0,pending:0,delivered:0,cancelled:0,orderValue:'0.00',received:'0.00',refunded:'0.00',pendingRefunds:'0.00',netReceived:'0.00',abnormalCollections:'0.00',abnormalRecords:[] as any[],abnormalRecordsMore:false,reviewRefunds:0,unpaid:'0.00',cloudMode:!!cfg,loading:!!cfg,loadingMore:false,error:'',moreError:'',hasMore:false,notice:cfg?'云端订单核对，真实支付按服务端核验记录计算；不是官方结算账单。':'本机演示订单，确认收款为零。'})}
  else this.setData({loadingMore:true,moreError:''})
  try{
   if(cfg){
    const r=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/billing`,{...this.query(),...this.cursor?{cursor:this.cursor}:{}})
    if(serial!==this.serial||context!==businessContextKey())return
    if(!r?.summary||!Array.isArray(r.items)||typeof r.hasMore!=='boolean')throw Error('invalid_billing_response')
    const x=r.summary,rows=r.items.map((o:any)=>({id:o.id,date:localDay(o.createdAt),time:localTime(o.createdAt),name:'',items:o.itemsText,amount:yuan(Number(o.totalCents)),payment:paymentLabel(o),status:cloudStatuses[o.fulfillmentStatus]||'状态未识别'}))
    const seen=new Set(this.data.rows.map(o=>o.id)),add=rows.filter((o:any)=>!seen.has(o.id))
    const anomalies=r.abnormalCollections
    if(anomalies!==undefined&&(!anomalies||!Array.isArray(anomalies.items)||typeof anomalies.hasMore!=='boolean'))throw Error('invalid_billing_anomalies')
    const abnormalRecords=(anomalies?.items||[]).slice(0,10).map((e:any)=>({
      orderId:String(e.orderId||''),transactionId:String(e.transactionId||''),
      amount:yuan(Number(e.amountCents||0)),
      date:localDay(String(e.receivedAt||'')),time:localTime(String(e.receivedAt||''))
    }))
    const update:Record<string,any>={count:Number(x.orderCount),pending:Number(x.pendingCount),delivered:Number(x.deliveredCount),cancelled:Number(x.cancelCount),orderValue:yuan(Number(x.orderCents)),received:yuan(Number(x.paidCents||0)),refunded:yuan(Number(x.refundedCents||0)),pendingRefunds:yuan(Number(x.refundPendingCents||0)),netReceived:yuan(Number(x.netVerifiedCents||0)),abnormalCollections:yuan(Number(x.abnormalCollectionCents||0)),reviewRefunds:Number(x.refundReviewCount||0),unpaid:yuan(Number(x.unpaidCents)),hasMore:r.hasMore,abnormalRecords,abnormalRecordsMore:!!anomalies&&(anomalies.hasMore||anomalies.items.length>10),notice:r.notice}
    if(reset)update.rows=rows;else add.forEach((o:any,i:number)=>{update['rows['+(this.data.rows.length+i)+']']=o})
    this.cursor=r.nextCursor||'';this.setData(update)
   }else{
    const orders=loadWorkflowOrders().filter(o=>this.data.allDates||localDay(o.createdAt)===this.data.day).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
    let orderValue=0,unpaid=0,cancelled=0,delivered=0
    const rows=orders.map(o=>{
     const value=Math.round(Number(o.totalText)*100),status=String(o.fulfillmentStatus||'new'),cancel=['cancelled','canceled','refunded'].includes(status)
     if(!Number.isSafeInteger(value)||value<0)throw Error('invalid_demo_bill_amount')
     if(cancel)cancelled++;else{orderValue+=value;if(o.paymentStatus==='unpaid')unpaid+=value}
     if(status==='delivered')delivered++
     return {id:o.id,date:localDay(o.createdAt),time:localTime(o.createdAt),name:o.receiverName||'',items:o.items.map(i=>i.name+' ×'+i.quantity).join('、'),amount:yuan(value),payment:o.paymentStatus==='unpaid'?'未支付':'支付状态未核验',status:workflowLabel(o.fulfillmentStatus)}
    })
    this.setData({rows,count:orders.length,pending:orders.filter(o=>String(o.fulfillmentStatus||'new')==='new').length,delivered,cancelled,orderValue:yuan(orderValue),received:'0.00',unpaid:yuan(unpaid)})
   }
  }catch(error){if(serial===this.serial)this.setData(reset?{error:cfg?'账单读取失败，请检查网络、商家权限和后端版本；未回退演示数据。':'本机演示账单读取失败，请检查本地订单数据。'}:{moreError:'加载更多失败，请重试或刷新列表'})}
  finally{if(serial===this.serial){this.setData({loading:false,loadingMore:false});if(context!==businessContextKey())this.setData({rows:[],error:'店铺或模式已变化，请重新刷新账单'})}}
 },
 async reviewAbnormal(e:any){
  if(this.data.reviewBusy||this.data.exporting||this.data.loading||!this.data.livePayEnabled||!this.data.cloudMode)return
  const transactionId=String(e?.currentTarget?.dataset?.transaction||'')
  if(!/^[0-9]{8,32}$/.test(transactionId))return
  const context=businessContextKey()
  this.setData({reviewBusy:true})
  try{
   const options=['查看已有复核记录','已核对微信商户平台','已联系微信客服','已提交退款申请','升级人工处理']
   const selection:number=await new Promise((resolve,reject)=>wx.showActionSheet({
    itemList:options,success:r=>resolve(r.tapIndex),fail:reject
   }))
   if(context!==businessContextKey())return
   if(selection===0){
    const result=await getAbnormalReviews(transactionId)
    if(context!==businessContextKey())return
    const rows=Array.isArray(result?.reviews)?result.reviews:[]
    const labels:Record<string,string>={provider_checked:'已核对官方交易',support_contacted:'已联系客服',refund_requested:'已提交退款申请',escalated:'升级人工处理'}
    const lines=rows.slice(0,8).map((v:any)=>String(v.createdAt||'').slice(0,16)+' '+(labels[v.action]||'人工记录')+'：'+String(v.note||''))
    await new Promise<void>(resolve=>wx.showModal({title:'人工复核记录',content:lines.length?lines.join('\n')+(result.hasMore?'\n还有更早记录':''):'暂无人工复核记录',showCancel:false,success:()=>resolve(),fail:()=>resolve()}))
    return
   }
   const actions=['','provider_checked','support_contacted','refund_requested','escalated']
   const action=actions[selection]
   if(!action)return
   const note:string|null=await new Promise(resolve=>wx.showModal({
    title:'追加人工复核记录',content:'仅记录已实际执行的操作，不代表退款成功。',editable:true,
    placeholderText:'填写具体核对结果或处理说明（最多 500 字）',
    success:(r:any)=>resolve(r.confirm?String(r.content||'').trim():null),fail:()=>resolve(null)
   } as any))
   if(note===null)return
   if(!note||note.length>500){wx.showToast({title:'请输入 1–500 字说明',icon:'none'});return}
   if(context!==businessContextKey())return
   const key=transactionId+':'+action+':'+note
   let requestKey=this.reviewPendingKeys[key]
   if(!requestKey){
    requestKey='rev'+Date.now().toString(36)+Math.random().toString(36).slice(2).padEnd(12,'0')
    this.reviewPendingKeys[key]=requestKey
   }
   const reply=await appendAbnormalReview(transactionId,{requestKey,action,note})
   if(context!==businessContextKey())return
   if(!reply?.review?.manualEvidenceOnly)throw Error('review_unverified')
   delete this.reviewPendingKeys[key]
   wx.showToast({title:'已保存复核记录',icon:'success'})
  }catch(error){
   if(context===businessContextKey()&& !String(error).includes('cancel')){
    wx.showModal({title:'复核记录未确认',content:'无法确认记录是否保存。再次提交相同内容会使用原请求编号，避免重复写入；不会影响资金状态。',showCancel:false})
   }
  }finally{this.setData({reviewBusy:false})}
 },
 async exportAbnormalCsv(){
  if(this.data.loading||this.data.exporting||!this.data.cloudMode||!this.data.livePayEnabled)return
  const cfg=getCloudContext(),context=businessContextKey()
  if(!cfg||context!==this.context){this.refresh();return}
  this.setData({exporting:true})
  try{
   const file=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/billing/abnormal-export`,{...this.query(),format:'json'})
   if(context!==businessContextKey())throw Error('context_changed')
   if(typeof file?.csv!=='string'||typeof file?.filename!=='string')throw Error('invalid_abnormal_export')
   await shareCsvFile(file.csv,file.filename)
  }catch(error){
   wx.showModal({title:'异常到账导出失败',content:String(error).includes('413')?'记录超过限制，请缩小账单日期范围。':'请确认网络、正式支付配置和商家权限。',showCancel:false})
  }finally{this.setData({exporting:false})}
 },
 async exportCsv(){
  if(this.data.loading||this.data.loadingMore||this.data.exporting||this.data.error||!this.data.rows.length)return
  const cfg=getCloudContext(),context=businessContextKey();if(context!==this.context){this.refresh();return}
  this.setData({exporting:true})
  try{
   let csv:string,filename:string
   if(cfg){const file=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/billing/export`,{...this.query(),format:'json'});csv=file.csv;filename=file.filename}
   else{const header=['订单编号','下单日期（北京时间）','时间','商品快照','订单金额','支付状态（未核验）','履约状态','已确认收款'];csv='\uFEFF'+[['统计说明','本地演示数据，非真实收款流水；取消订单不计统计金额'],header,...this.data.rows.map(r=>[r.id,r.date,r.time,r.items,r.amount,r.payment,r.status,'0.00'])].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';filename='billing-demo-'+Date.now()+'.csv'}
   if(context!==businessContextKey())throw Error('context_changed')
   await shareCsvFile(csv,filename)
  }catch(error){wx.showModal({title:'导出失败',content:String(error).includes('413')?'导出超过10000单、50000条明细或5MB，请选择较小日期范围。':'未能生成或分享账单，请确认权限、网络并重试。',showCancel:false})}
  finally{this.setData({exporting:false})}
 }
})
