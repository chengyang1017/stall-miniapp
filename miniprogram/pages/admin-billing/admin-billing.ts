import {loadWorkflowOrders,workflowLabel} from '../../modules/merchant/demo/orders'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { authorizedGet } from '../../modules/shared/runtime/auth'
import { businessContextKey } from '../../modules/merchant/api/business'
import {shareCsvFile} from '../../utils/shareCsvFile'
function localDay(value=new Date().toISOString()):string{const t=Date.parse(value);return Number.isFinite(t)?new Date(t+8*3600000).toISOString().slice(0,10):''}
function localTime(value:string):string{return new Date(Date.parse(value)+8*3600000).toISOString().slice(11,16)}
function yuan(cents:number):string{return (cents/100).toFixed(2)}
function cell(v:unknown):string{let s=String(v==null?'':v);if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
const cloudStatuses:Record<string,string>={new:'新订单',accepted:'已接单',preparing:'备货中',delivering:'配送中',delivered:'已送达',cancelled:'已取消',abnormal:'配送异常'}
Page({
 serial:0,context:'',cursor:'',
 data:{day:localDay(),allDates:false,rows:[] as any[],count:0,pending:0,delivered:0,cancelled:0,orderValue:'0.00',received:'0.00',unpaid:'0.00',notice:'',cloudMode:false,loading:false,loadingMore:false,exporting:false,error:'',moreError:'',hasMore:false},
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
  if(reset){this.cursor='';this.setData({rows:[],count:0,pending:0,delivered:0,cancelled:0,orderValue:'0.00',received:'0.00',unpaid:'0.00',cloudMode:!!cfg,loading:!!cfg,loadingMore:false,error:'',moreError:'',hasMore:false,notice:cfg?'云端数据库账单，尚无可信支付核验链路。':'本机演示订单，确认收款为零。'})}
  else this.setData({loadingMore:true,moreError:''})
  try{
   if(cfg){
    const r=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/billing`,{...this.query(),...this.cursor?{cursor:this.cursor}:{}})
    if(serial!==this.serial||context!==businessContextKey())return
    if(!r?.summary||!Array.isArray(r.items)||typeof r.hasMore!=='boolean')throw Error('invalid_billing_response')
    const x=r.summary,rows=r.items.map((o:any)=>({id:o.id,date:localDay(o.createdAt),time:localTime(o.createdAt),name:'',items:o.itemsText,amount:yuan(Number(o.totalCents)),payment:o.paymentStatus==='unpaid'?'未支付':'支付状态未核验',status:cloudStatuses[o.fulfillmentStatus]||'状态未识别'}))
    const seen=new Set(this.data.rows.map(o=>o.id)),add=rows.filter((o:any)=>!seen.has(o.id))
    const update:Record<string,any>={count:Number(x.orderCount),pending:Number(x.pendingCount),delivered:Number(x.deliveredCount),cancelled:Number(x.cancelCount),orderValue:yuan(Number(x.orderCents)),received:'0.00',unpaid:yuan(Number(x.unpaidCents)),hasMore:r.hasMore,notice:r.notice}
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
