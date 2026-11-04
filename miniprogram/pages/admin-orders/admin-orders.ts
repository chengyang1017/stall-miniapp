import { paymentLabel,fulfillmentPaymentReady } from '../../modules/shared/domain/payment'
import { stableRowsPatch } from '../../modules/shared/runtime/stableRows'
import {loadWorkflowOrders,updateWorkflowOrder,chinaTime} from '../../modules/merchant/demo/orders'
import {saveDemoOrders} from '../../modules/merchant/demo/orders'
import { merchantOrderConfig, merchantOrderContextKey, fetchMerchantOrderPage, updateMerchantOrder, saveMerchantOrderNote, MerchantOrderCounts, MerchantOrderQuery } from '../../modules/merchant/api/orders'
import {saveMerchantEta} from '../../utils/merchantEtaCloud'
import {sandboxPaymentRequest} from '../../modules/shared/api/sandboxPayment'
import {sandboxPaymentView} from '../../modules/shared/domain/sandboxPayment'
const tabs=[{key:'latest',label:'全部订单'},{key:'unpaid',label:'待支付'},{key:'new',label:'待接单'},{key:'accepted',label:'已接单'},{key:'preparing',label:'备货中'},{key:'delivering',label:'配送中'},{key:'delivered',label:'已送达'},{key:'cancelled',label:'已取消'},{key:'abnormal',label:'配送异常'},{key:'other',label:'取消 / 异常'}]
const labels:Record<string,string>={new:'新订单',accepted:'已接单',preparing:'备货中',delivering:'配送中',delivered:'已送达',cancelled:'已取消',abnormal:'配送异常'}
function state(o:any):string{const s=String(o.fulfillmentStatus||'new');return ['canceled','refunded'].includes(s)?'cancelled':s==='exception'?'abnormal':s}
function matches(o:any,tab:string):boolean{return tab==='latest'||(tab==='other'?['cancelled','abnormal'].includes(state(o)):(tab==='unpaid'?state(o)==='new'&&o.paymentStatus==='unpaid':state(o)===tab&&(tab!=='new'||fulfillmentPaymentReady(o))))}
function beijingDay(iso:string):string{const t=Date.parse(iso);return Number.isFinite(t)?new Date(t+8*3600000).toISOString().slice(0,10):''}
function validRange(from:string,to:string):boolean{if(!from&&!to)return true;const ok=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s&&s>='2000-01-01'&&s<='2100-12-31';return ok(from)&&ok(to)&&from<=to&&Date.parse(to)-Date.parse(from)<366*86400000}
function emptyCounts():MerchantOrderCounts{return {all:0,new:0,accepted:0,preparing:0,delivering:0,delivered:0,cancelled:0,abnormal:0,other:0}}
function errorMessage(e:unknown):string{const s=String(e);if(/orders_changed|cursor/.test(s))return '订单数据已变化或分页已过期，请刷新后继续加载';if(/401|403|not_logged_in/.test(s))return '登录已失效或无操作权限，请重新登录有权限的商家账号';if(s.includes('payment_not_confirmed'))return '尚未确认支付，现有支付或库存预留规则禁止此操作';if(s.includes('inventory_reservation_expired'))return '库存预留已过期，服务器已处理，请刷新核对';if(/invalid_transition|state_changed|inventory_released/.test(s))return '订单状态或库存预留已变化，请刷新核对';if(s.includes('400'))return '查询条件或操作参数无效，请检查日期范围和输入';return '请求失败或结果未能确认，请检查网络后刷新核对，勿重复操作'}
Page({
 async viewSandboxPayment(e:any){
  const cfg=merchantOrderConfig(),id=String(e.currentTarget.dataset.id||''),context=merchantOrderContextKey(),serial=this.serial
  if(!cfg||!this.visible)return
  this.setData({sandboxOrderId:id,sandbox:null,sandboxError:''})
  try{const r=await sandboxPaymentRequest(cfg,id,true)
   if(this.visible&&serial===this.serial&&context===merchantOrderContextKey())this.setData({sandbox:sandboxPaymentView(r)})
  }catch(_){if(this.visible&&serial===this.serial&&context===merchantOrderContextKey())this.setData({sandboxError:'Sandbox 未启用、无权限或网络不可用，无法确认最新结果'})}
 },
 requestSandboxRefund(){
  const cfg=merchantOrderConfig(),id=this.data.sandboxOrderId,s=this.data.sandbox,context=merchantOrderContextKey(),serial=this.serial
  if(!cfg||!s?.canRefund||this.data.sandboxRefundBusy||!this.visible)return
  const current=()=>this.visible&&serial===this.serial&&context===merchantOrderContextKey()&&id===this.data.sandboxOrderId
  wx.showModal({title:'Sandbox 测试退款',content:'输入退款金额（元）；仅测试交易，原始小票保留。',editable:true,placeholderText:'例如 1.00',success:async(r:any)=>{
   if(!r.confirm||!current())return
   if(!/^\d{1,7}(\.\d{1,2})?$/.test(r.content||'')){wx.showToast({title:'请输入有效金额',icon:'none'});return}
   const amount=Math.round(Number(r.content)*100),reserved=s.refunds.filter((x:any)=>x.kind==='merchant').reduce((n:number,x:any)=>n+Number(x.amountCents),0)
   const key='refund_'+id+'_'+amount+'_'+reserved
   this.setData({sandboxRefundBusy:true})
   try{await sandboxPaymentRequest(cfg,id,true,'sandbox-refund',{amountCents:amount},key)
    if(current())await this.viewSandboxPayment({currentTarget:{dataset:{id}}})
   }catch(_){if(current())this.setData({sandboxError:'退款申请未确认，请查询记录后重试；不得当作已退款'})}
   finally{if(current())this.setData({sandboxRefundBusy:false})}
  }})
 },
 loaded:[] as any[],localRows:[] as any[],localFiltered:[] as any[],counts:emptyCounts(),context:'',serial:0,nextCursor:'',localOffset:0,visible:false,
 data:{sandbox:null as any,sandboxError:'',sandboxOrderId:'',sandboxRefundBusy:false,dateResults:[] as any[],currentTab:'latest',orderSearchText:'',dateFrom:'',dateTo:'',queryDirty:false,
  orderTabs:tabs.map(t=>({...t,count:0})),countsKnown:false,globalTotal:0,globalPending:0,matchingCount:0,
  noteInputs:{} as Record<string,string>,etaInputs:{} as Record<string,string>,cloudMode:false,cloudBusy:false,loadingMore:false,cloudError:'',moreError:'',hasMore:false,refreshRequired:false,canManage:true,
  batchMode:false,selectedIds:[] as string[],selectedMap:{} as Record<string,boolean>,selectedCount:0,allSelected:false,operationBusy:false,operationProgress:'',batchResult:'',batchFailures:[] as Array<{id:string;reason:string}>},
 onShow(){this.visible=true;this.setData({sandbox:null,sandboxOrderId:'',sandboxError:'',sandboxRefundBusy:false});this.syncContext();if(!this.data.operationBusy)this.fetchPage(true,this.loaded.length>0)},
 onHide(){this.visible=false;this.serial++;this.setData({cloudBusy:false,loadingMore:false})},
 onUnload(){this.visible=false;this.serial++;this.loaded=[];this.localRows=[];this.localFiltered=[]},
 async onPullDownRefresh(){try{if(!this.data.operationBusy)await this.refresh()}finally{wx.stopPullDownRefresh()}},
 onReachBottom(){this.loadMore()},
 query():MerchantOrderQuery{return {q:this.data.orderSearchText.trim(),state:this.data.currentTab,from:this.data.dateFrom,to:this.data.dateTo}},
 syncContext(){const context=merchantOrderContextKey();if(context===this.context)return;this.loaded=[];this.localRows=[];this.localFiltered=[];this.nextCursor='';this.counts=emptyCounts();this.setSelection([]);this.setData({dateResults:[],currentTab:'latest',orderSearchText:'',dateFrom:'',dateTo:'',etaInputs:{},noteInputs:{},batchMode:false,batchResult:'',batchFailures:[],countsKnown:false,globalTotal:0,globalPending:0,hasMore:false,matchingCount:0,queryDirty:false,refreshRequired:false,moreError:'',cloudError:'',cloudMode:!!merchantOrderConfig(),canManage:!merchantOrderConfig()});this.context=context},
 setCounts(counts:MerchantOrderCounts){this.counts=counts;this.setData({countsKnown:true,globalTotal:counts.all,globalPending:counts.new,orderTabs:tabs.map(t=>({...t,count:Number((counts as any)[t.key==='latest'?'all':t.key]||0)}))})},
 setSelection(ids:string[]){const map:Record<string,boolean>={};ids.forEach(id=>{map[id]=true});const eligible=this.loaded.filter(o=>['new','accepted'].includes(state(o))&&(!this.data.cloudMode||fulfillmentPaymentReady(o)));this.setData({selectedIds:ids,selectedMap:map,selectedCount:ids.length,allSelected:!!eligible.length&&ids.length===eligible.length})},
 changedQuery(){this.serial++;this.setSelection([]);this.setData({batchMode:false,queryDirty:true,cloudBusy:false,loadingMore:false,refreshRequired:false,batchResult:'',batchFailures:[],moreError:''})},
 orderSearchInput(e:any){if(this.data.operationBusy)return;this.changedQuery();this.setData({orderSearchText:String(e.detail.value||'').slice(0,100)})},
 searchOrders(){if(!this.data.operationBusy&&!this.data.cloudBusy&&!this.data.loadingMore)this.refresh()},
 clearOrderSearch(){if(this.data.operationBusy)return;this.changedQuery();this.setData({orderSearchText:''});this.refresh()},
 switchOrderTab(e:any){if(this.data.operationBusy)return;const tab=String(e.currentTarget.dataset.tab);if(!tabs.some(t=>t.key===tab))return;this.changedQuery();this.setData({currentTab:tab});this.refresh()},
 selectOrderDate(e:any){if(this.data.operationBusy)return;const key=String(e.currentTarget.dataset.key),v=String(e.detail.value||'');if(!['dateFrom','dateTo'].includes(key))return;this.changedQuery();this.setData({[key]:v,...key==='dateFrom'&&!this.data.dateTo?{dateTo:v}:{},...key==='dateTo'&&!this.data.dateFrom?{dateFrom:v}:{}});this.refresh()},
 selectTodayOrders(){if(this.data.operationBusy)return;const d=beijingDay(new Date().toISOString());this.changedQuery();this.setData({dateFrom:d,dateTo:d});this.refresh()},
 clearOrderDate(){if(this.data.operationBusy)return;this.changedQuery();this.setData({dateFrom:'',dateTo:''});this.refresh()},
 render(append=false){
  const views=this.loaded.map(o=>{
   const s=state(o),cloud=this.data.cloudMode,c=o.contactSnapshot||{},slot=o.deliverySlotSnapshot||{},next=({new:'accepted',accepted:'preparing',preparing:'delivering'} as Record<string,string>)[s]||''
   return {...o,statusText:labels[s]||s,totalText:cloud?(Number(o.totalCents)/100).toFixed(2):o.totalText,receiverName:cloud?String(c.receiverName||''):o.receiverName||'',phone:cloud?String(c.phone||''):o.phone||'',
    area:cloud?String(c.areaName||slot.areaName||c.areaId||''):o.area||'',detail:cloud?String(c.detail||''):o.detail||'',note:cloud?String(c.note||''):o.note||'',slotText:cloud?[slot.date,slot.label,slot.start&&slot.end?slot.start+'–'+slot.end:''].filter(Boolean).join(' '):o.slotText||'',
    items:(o.items||[]).map((i:any,index:number)=>({...i,lineKey:i.lineId||o.id+':'+index,subtotal:i.subtotal==null?'':String(i.subtotal)})),createdText:chinaTime(o.createdAt),deliveredText:o.deliveredAt?chinaTime(o.deliveredAt):'',
    issueReason:o.issueReason||'',issueTimeText:o.issueTime?chinaTime(o.issueTime):'',nextStatus:next,nextLabel:({accepted:'接单',preparing:'开始备货',delivering:'开始配送'} as Record<string,string>)[next]||'',
    allowCancel:cloud?['new','accepted','preparing'].includes(s):!['delivered','cancelled','abnormal'].includes(s),allowAbnormal:s==='delivering',allowEta:['accepted','preparing','delivering'].includes(s),
    merchantNote:o.merchantNote||'',merchantNoteVersion:o.merchantNoteVersion||1,noteDraft:this.data.noteInputs[o.id]!==undefined?this.data.noteInputs[o.id]:o.merchantNote||'',
    etaValue:o.estimatedArrival||'',etaDraft:this.data.etaInputs[o.id]!==undefined?this.data.etaInputs[o.id]:o.estimatedArrival||'',batchEligible:['new','accepted'].includes(s)&&(!cloud||fulfillmentPaymentReady(o)),paymentBlocked:cloud&&!fulfillmentPaymentReady(o),
    paymentLabel:paymentLabel(o)}
  })
  if(append){const update:Record<string,any>={};views.slice(this.data.dateResults.length).forEach((v,i)=>{update['dateResults['+(this.data.dateResults.length+i)+']']=v});this.setData(update)}else this.setData(stableRowsPatch('dateResults',this.data.dateResults,views,'id'))
  this.setSelection(this.data.selectedIds.filter(id=>this.loaded.some(o=>o.id===id&&['new','accepted'].includes(state(o))&&(!this.data.cloudMode||fulfillmentPaymentReady(o)))))
 },
 async refresh(){if(this.data.operationBusy)return false;return this.fetchPage(true,this.loaded.length>0)},
 async loadMore(){if(this.data.operationBusy||this.data.cloudBusy||this.data.loadingMore||this.data.queryDirty||this.data.refreshRequired||!this.data.hasMore)return;if(this.context!==merchantOrderContextKey()){await this.refresh();return}await this.fetchPage(false)},
 async fetchPage(reset:boolean,keepRows=false):Promise<boolean>{
  const context=merchantOrderContextKey(),cfg=merchantOrderConfig()
  this.syncContext()
  const query=this.query(),serial=++this.serial
  if(!validRange(query.from,query.to)){this.setSelection([]);this.setData({dateResults:[],queryDirty:true,cloudBusy:false,loadingMore:false,cloudError:'请选择合法日期范围，开始日期不能晚于结束日期，最多366天'});return false}
  if(reset){this.nextCursor='';this.localOffset=0;if(!keepRows)this.loaded=[];this.setSelection([]);this.setData({cloudMode:!!cfg,cloudBusy:true,loadingMore:false,queryDirty:false,cloudError:'',moreError:'',refreshRequired:false,hasMore:false,...keepRows?{}:{dateResults:[],countsKnown:false}})}
  else this.setData({loadingMore:true,moreError:''})
  try{
   let rows:any[],hasMore:boolean,matchingCount:number,counts:MerchantOrderCounts,canManage=true,cursorResult=''
   if(cfg){const page=await fetchMerchantOrderPage(cfg,query,reset?'':this.nextCursor);rows=page.orders;hasMore=page.hasMore;matchingCount=page.matchingCount;counts=page.counts;canManage=page.canManage;cursorResult=page.nextCursor||''}
   else{
    if(reset){this.localRows=loadWorkflowOrders().slice().sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)||(a.id<b.id?1:a.id>b.id?-1:0));const q=query.q.toLowerCase();this.localFiltered=this.localRows.filter(o=>matches(o,query.state)&&(!q||[o.id,o.receiverName,o.phone].some(v=>String(v||'').toLowerCase().includes(q)))&&(!query.from||beijingDay(o.createdAt)>=query.from&&beijingDay(o.createdAt)<=query.to))}
    counts=emptyCounts();this.localRows.forEach(o=>{counts.all++;const key=state(o);if(key in counts)(counts as any)[key]++});counts.other=counts.cancelled+counts.abnormal
    rows=this.localFiltered.slice(this.localOffset,this.localOffset+30);this.localOffset+=rows.length;matchingCount=this.localFiltered.length;hasMore=this.localOffset<matchingCount
   }
   if(serial!==this.serial||context!==merchantOrderContextKey()||!this.visible)return false
   this.nextCursor=cursorResult
   const seen=new Set(reset?[]:this.loaded.map(o=>o.id));const incoming=rows.filter(o=>{if(seen.has(o.id))return false;seen.add(o.id);return true})
   this.loaded=reset?incoming:this.loaded.concat(incoming);this.setCounts(counts);this.setData({matchingCount,hasMore,canManage});this.render(!reset);return true
  }catch(e){if(serial===this.serial&&context===merchantOrderContextKey()){
   if(/401|403|not_logged_in/.test(String(e))){this.loaded=[];this.localRows=[];this.localFiltered=[];this.nextCursor='';this.setSelection([]);this.setData({dateResults:[],canManage:false,countsKnown:false,batchMode:false,hasMore:false,batchFailures:[],cloudError:errorMessage(e)});return false}
   const needs=/orders_changed|cursor/.test(String(e));if(needs){this.setSelection([]);this.setData({batchMode:false,refreshRequired:true,queryDirty:true,countsKnown:false})}
   this.setData(reset?{cloudError:errorMessage(e),countsKnown:false}:{moreError:errorMessage(e)});
  }return false}
  finally{if(serial===this.serial){this.setData({cloudBusy:false,loadingMore:false});if(context!==merchantOrderContextKey()){this.syncContext();this.setData({cloudError:'商家会话或店铺已变化，请重新读取'})}}}
 },
 toggleBatchMode(){if(this.data.operationBusy||this.data.cloudBusy||this.data.queryDirty||!this.data.canManage)return;this.setSelection([]);this.setData({batchMode:!this.data.batchMode,batchResult:''})},
 toggleOrder(e:any){if(!this.data.batchMode||this.data.operationBusy||this.data.queryDirty)return;const id=String(e.currentTarget.dataset.id),o=this.loaded.find(o=>o.id===id);if(!o||!['new','accepted'].includes(state(o))||this.data.cloudMode&&!fulfillmentPaymentReady(o))return;const ids=this.data.selectedIds.includes(id)?this.data.selectedIds.filter(x=>x!==id):this.data.selectedIds.concat(id);if(ids.length>50){wx.showToast({title:'一次最多选择50单',icon:'none'});return}this.setSelection(ids)},
 selectAll(){if(!this.data.batchMode||this.data.operationBusy||this.data.queryDirty)return;const eligible=this.loaded.filter(o=>['new','accepted'].includes(state(o))&&(!this.data.cloudMode||fulfillmentPaymentReady(o)));if(!this.data.allSelected&&eligible.length>50){wx.showToast({title:'超过50单，请手动选择',icon:'none'});return}this.setSelection(this.data.allSelected?[]:eligible.map(o=>o.id))},
 clearBatchSelection(){if(this.data.batchMode&&!this.data.operationBusy)this.setSelection([])},
 canAct(id:string):boolean{return this.visible&&!this.data.operationBusy&&!this.data.batchMode&&!this.data.queryDirty&&!this.data.cloudBusy&&!this.data.loadingMore&&!this.data.refreshRequired&&this.data.canManage&&this.context===merchantOrderContextKey()&&this.loaded.some(o=>o.id===id)},
 applyState(id:string,next:string){const o=this.loaded.find(o=>o.id===id);if(!o)return;o.fulfillmentStatus=next;this.setData({countsKnown:false});if(!matches(o,this.data.currentTab)){this.loaded=this.loaded.filter(o=>o.id!==id);this.setData({matchingCount:Math.max(0,this.data.matchingCount-1)})}this.render()},
 async afterAction(context:string){if(this.visible)await this.fetchPage(true,context===merchantOrderContextKey())},
 async next(e:any){
  const id=String(e.currentTarget.dataset.id||''),next=String(e.currentTarget.dataset.status||'');if(!this.canAct(id)||!['accepted','preparing','delivering'].includes(next))return
  if(this.data.cloudMode&&!fulfillmentPaymentReady(this.loaded.find(o=>o.id===id)))return
  const context=this.context,cfg=merchantOrderConfig();this.setData({operationBusy:true,operationProgress:'正在更新订单'})
  try{if(cfg)await updateMerchantOrder(cfg,id,next);else if(!updateWorkflowOrder(id,next as any))throw Error('invalid_transition_or_payment_not_confirmed');if(context!==merchantOrderContextKey())throw Error('context_changed');this.applyState(id,next)}
  catch(error){if(this.visible)wx.showModal({title:'操作失败或未确认',content:errorMessage(error),showCancel:false})}
  finally{await this.afterAction(context);this.setData({operationBusy:false,operationProgress:''})}
 },
 async recordOrderIssue(e:any){
  const id=String(e.currentTarget.dataset.id||''),type=String(e.currentTarget.dataset.type||'');if(!this.canAct(id)||!['cancelled','abnormal'].includes(type))return
  const context=this.context,cfg=merchantOrderConfig(),before=state(this.loaded.find(o=>o.id===id));let attempted=false;this.setData({operationBusy:true,operationProgress:'请填写原因'})
  try{
   const result=await new Promise<any>(resolve=>wx.showModal({title:type==='cancelled'?'取消订单':'记录配送异常',editable:true,placeholderText:'请输入1至200字原因',success:resolve,fail:()=>resolve({confirm:false})}))
   if(!result.confirm)return
   const reason=String(result.content||'').trim();if(!reason||reason.length>200)throw Error('invalid_reason')
   if(context!==merchantOrderContextKey()||!this.visible)throw Error('context_changed')
   attempted=true
   if(cfg)await updateMerchantOrder(cfg,id,type,reason)
   else{const orders=loadWorkflowOrders() as any[],o=orders.find(o=>o.id===id);if(!o||state(o)!==before||['delivered','cancelled','abnormal'].includes(before)||type==='abnormal'&&before!=='delivering')throw Error('invalid_transition');o.fulfillmentStatus=type;o.issueReason=reason;o.issueTime=new Date().toISOString();saveDemoOrders(orders)}
   if(context===merchantOrderContextKey()){this.applyState(id,type);const row=this.loaded.find(o=>o.id===id);if(row){row.issueReason=reason;this.render()}}
  }catch(error){if(this.visible)wx.showModal({title:'操作失败或未确认',content:String(error).includes('invalid_reason')?'原因需为1至200字':errorMessage(error),showCancel:false})}
  finally{if(attempted||!this.loaded.length)await this.afterAction(context);this.setData({operationBusy:false,operationProgress:''})}
 },
 etaInput(e:any){if(this.data.operationBusy||this.data.batchMode||this.data.queryDirty)return;const id=String(e.currentTarget.dataset.id);this.setData({['etaInputs.'+id]:String(e.detail.value)})},
 async saveEta(e:any){
  const id=String(e.currentTarget.dataset.id||'');if(!this.canAct(id))return
  const o=this.loaded.find(o=>o.id===id),value=String(this.data.etaInputs[id]!==undefined?this.data.etaInputs[id]:o.estimatedArrival||'').trim()
  if(value.length>60){wx.showToast({title:'预计时间最多60字',icon:'none'});return}
  const context=this.context,cfg=merchantOrderConfig();this.setData({operationBusy:true,operationProgress:'正在保存预计时间'})
  try{if(cfg)await saveMerchantEta(id,value);else if(!updateWorkflowOrder(id,'eta',value))throw Error('invalid_transition');if(context!==merchantOrderContextKey())throw Error('context_changed');o.estimatedArrival=value;const inputs={...this.data.etaInputs};delete inputs[id];this.setData({etaInputs:inputs});this.render();wx.showToast({title:'预计时间已保存',icon:'success'})}
  catch(error){if(this.visible)wx.showModal({title:'保存失败',content:errorMessage(error),showCancel:false})}
  finally{await this.afterAction(context);this.setData({operationBusy:false,operationProgress:''})}
 },
 noteInput(e:any){const id=String(e.currentTarget.dataset.id||'');if(!this.canAct(id))return;this.setData({['noteInputs.'+id]:String(e.detail.value||'').slice(0,1000)})},
 async saveInternalNote(e:any){
  const id=String(e.currentTarget.dataset.id||'');if(!this.canAct(id))return
  const order=this.loaded.find(o=>o.id===id),note=String(this.data.noteInputs[id]!==undefined?this.data.noteInputs[id]:order.merchantNote||'').trim()
  const context=this.context,cfg=merchantOrderConfig();this.setData({operationBusy:true,operationProgress:'正在保存商家内部备注'})
  try{
   let saved:{note:string;version:number}
   if(cfg)saved=await saveMerchantOrderNote(cfg,id,note,order.merchantNoteVersion||1)
   else{
    const orders=loadWorkflowOrders(),current=orders.find(o=>o.id===id)
    if(!current||(current.merchantNoteVersion||1)!==(order.merchantNoteVersion||1))throw Error('merchant_note_changed_refresh')
    current.merchantNote=note;current.merchantNoteVersion=(current.merchantNoteVersion||1)+1;saveDemoOrders(orders);saved={note,version:current.merchantNoteVersion}
   }
   if(context!==merchantOrderContextKey())throw Error('context_changed')
   order.merchantNote=saved.note;order.merchantNoteVersion=saved.version
   const drafts={...this.data.noteInputs};delete drafts[id];this.setData({noteInputs:drafts});this.render();wx.showToast({title:'内部备注已保存'})
  }catch(e){if(this.visible&&context===merchantOrderContextKey())wx.showModal({title:'内部备注未保存',content:/409|changed_refresh/.test(String(e))?'备注版本已变化，输入已保留。请刷新核对后重试。':errorMessage(e),showCancel:false})}
  finally{await this.afterAction(context);this.setData({operationBusy:false,operationProgress:''})}
 },
 async runBatch(e:any){
  if(!this.data.batchMode||this.data.operationBusy||this.data.cloudBusy||this.data.loadingMore||this.data.queryDirty||this.data.refreshRequired||!this.data.canManage)return
  const next=String(e.currentTarget.dataset.status||''),expected=next==='accepted'?'new':next==='preparing'?'accepted':''
  const ids=this.data.selectedIds.slice(),source=this.loaded.slice(),context=this.context,cfg=merchantOrderConfig()
  if(!expected||!ids.length||ids.length>50||context!==merchantOrderContextKey())return
  this.setData({operationBusy:true,operationProgress:'等待确认',batchResult:'',batchFailures:[]})
  let succeeded=0,confirmed=false;const failures:Array<{id:string;reason:string}>=[]
  try{
   const ok=await new Promise<boolean>(resolve=>wx.showModal({title:next==='accepted'?'批量接单':'批量开始备货',content:'已选择 '+ids.length+' 单。仅允许 '+expected+' → '+next+'；不符合状态、支付或库存规则的订单会计为失败。是否继续？',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
   if(!ok)return
   confirmed=true
   for(let i=0;i<ids.length;i++){
    const id=ids[i];this.setData({operationProgress:'正在处理 '+(i+1)+' / '+ids.length+' 单'})
    try{
     if(!this.visible||context!==merchantOrderContextKey())throw Error('session_changed_not_executed')
     const o=source.find(o=>o.id===id);if(!o||state(o)!==expected)throw Error('invalid_transition');if(cfg&&!fulfillmentPaymentReady(o))throw Error('payment_not_confirmed')
     if(cfg)await updateMerchantOrder(cfg,id,next);else if(!updateWorkflowOrder(id,next as any))throw Error('invalid_transition_or_payment_not_confirmed')
     succeeded++;if(context===merchantOrderContextKey()&&this.visible)this.applyState(id,next)
    }catch(error){failures.push({id,reason:String(error).includes('session_changed')?'未执行：页面或会话已变化':errorMessage(error)})}
   }
   const result='已选 '+ids.length+' 单：成功 '+succeeded+' 单，失败或未确认 '+failures.length+' 单。'+(failures.length?'不符合状态、网络未确认或未执行均计入失败；刷新核对后重试。':'')
   this.setData({batchResult:result,...this.visible&&context===merchantOrderContextKey()?{batchFailures:failures}:{}})
   if(this.visible&&context===merchantOrderContextKey())wx.showModal({title:failures.length?'批量操作有失败':'批量操作完成',content:result,showCancel:false})
  }finally{if(confirmed||!this.loaded.length)await this.afterAction(context);if(confirmed&&context===merchantOrderContextKey()&&this.visible)this.setSelection(failures.map(f=>f.id).filter(id=>this.loaded.some(o=>o.id===id&&['new','accepted'].includes(state(o))&&(!this.data.cloudMode||fulfillmentPaymentReady(o)))));this.setData({operationBusy:false,operationProgress:''})}
 }
})
