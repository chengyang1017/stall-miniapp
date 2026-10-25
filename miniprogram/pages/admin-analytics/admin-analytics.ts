import { AnalyticsQuery, AnalyticsReport, AnalyticsProduct, analyticsPresets, analyticsRange, validAnalyticsRange, analyticsContext, cloudAnalytics, localAnalytics, localAnalyticsCsv, analyticsExport, shareAnalyticsCsv, rankKeys, rankLabels, trendKeys, trendLabels, beijingTime } from '../../utils/salesAnalytics'
import { getCloudContext } from '../../modules/shared/runtime/context'

function errorText(error:unknown):string {
  const s=String(error)
  if(s.includes('413'))return '数据量超过限制，请缩小日期或商品筛选范围'
  if(s.includes('数据过多')||s.includes('明细过多')||s.includes('超过5000'))return '演示数据或导出行数超过限制，请缩小日期和筛选范围'
  if(s.includes('格式或大小'))return '导出文件格式无效或超过5MB限制'
  if(s.includes('migrations_required'))return '后端尚未具备报表所需结构，请由维护者检查迁移 009、011'
  if(s.includes('401')||s.includes('not_logged_in'))return '请先登录商家账号'
  if(s.includes('403'))return '当前账号无该店铺经营分析权限'
  if(s.includes('analytics_changed_refresh'))return '报表数据已变化，请刷新后继续加载或导出'
  if(s.includes('timeout'))return '统计超时，请缩小日期范围后重试'
  return '经营分析读取或导出失败，请检查网络、权限及后端版本后重试'
}
function money(n:number):string {return '¥'+(n/100).toFixed(2)}
function productView(p:AnalyticsProduct):any {return {...p,orderMoney:money(p.orderCents),paidMoney:money(p.paidCents),lastTime:beijingTime(p.lastOrderAt),salesLabel:p.quantity===0?'零销量（无有效下单件数）':'下单 '+p.quantity+' 件'}}
Page({
  serial:0, context:'', snapshot:'', localReport:null as AnalyticsReport|null, report:null as AnalyticsReport|null,
  appliedQuery:null as AnalyticsQuery|null, activeRequestKey:'',
  data:{...analyticsRange(2),presetIndex:2,presets:analyticsPresets,q:'',categoryId:'',categoryIndex:0,
    categories:[{id:'',name:'全部历史分类'},{id:'unknown',name:'未记录历史分类／无分类'}],
    rankIndex:0,rankLabels,topIndex:0,tops:[10,20,50],trendIndex:0,trendLabels,
    loading:false,loadingMore:false,exporting:false,dirty:false,needsRefresh:false,error:'',moreError:'',
    sourceLabel:'',notice:'',amountScope:'',cards:[] as any[],dailyBars:[] as any[],hourBars:[] as any[],ranking:[] as any[],products:[] as any[],
    totalProducts:0,hasMore:false,page:1,hasReport:false,hasOrders:false,unverifiedCount:0},
  onShow(){this.refresh()},
  onUnload(){this.serial++},
  async onPullDownRefresh(){try{if(!this.data.exporting)await this.refresh()}finally{wx.stopPullDownRefresh()}},
  query():AnalyticsQuery {return {from:this.data.from,to:this.data.to,q:this.data.q.trim(),categoryId:this.data.categoryId,rankBy:rankKeys[this.data.rankIndex],top:this.data.tops[this.data.topIndex]}},
  choosePreset(e:any){if(this.data.exporting)return;const i=Number(e.detail.value);if(!analyticsPresets[i])return;this.setData({presetIndex:i,...i===6?{}:analyticsRange(i)});if(i!==6)this.refresh()},
  chooseDate(e:any){if(this.data.exporting)return;const key=String(e.currentTarget.dataset.key);if(key!=='from'&&key!=='to')return;this.setData({[key]:String(e.detail.value),presetIndex:6});this.refresh()},
  chooseCategory(e:any){if(this.data.exporting)return;const i=Number(e.detail.value),c=this.data.categories[i];if(!c)return;this.setData({categoryIndex:i,categoryId:c.id});this.refresh()},
  chooseRank(e:any){if(this.data.exporting)return;const i=Number(e.detail.value);if(!rankKeys[i])return;this.setData({rankIndex:i});this.refresh()},
  chooseTop(e:any){if(this.data.exporting)return;const i=Number(e.detail.value);if(!this.data.tops[i])return;this.setData({topIndex:i});this.refresh()},
  chooseTrend(e:any){const i=Number(e.detail.value);if(!trendKeys[i])return;this.setData({trendIndex:i});if(this.report)this.renderCharts(this.report)},
  inputQuery(e:any){if(this.data.exporting)return;this.serial++;this.activeRequestKey='';this.snapshot='';this.localReport=null;this.report=null;this.setData({q:String(e.detail.value || '').slice(0,100),dirty:true,loading:false,loadingMore:false,hasReport:false,products:[],error:''})},
  clearQuery(){if(this.data.exporting)return;this.setData({q:''});this.refresh()},
  async refresh():Promise<void> {
    if(this.data.exporting)return
    const context=analyticsContext()
    if(this.context&&context!==this.context)this.setData({categoryId:'',categoryIndex:0,categories:[{id:'',name:'全部历史分类'},{id:'unknown',name:'未记录历史分类／无分类'}]})
    const query=this.query()
    if(!validAnalyticsRange(query.from,query.to)){this.serial++;this.activeRequestKey='';this.setData({loading:false,loadingMore:false,hasReport:false,error:'请选择有效日期，开始日期不能晚于结束日期，最多366天'});return}
    const requestKey=context+JSON.stringify(query)
    if(this.data.loading&&this.activeRequestKey===requestKey)return
    const id=++this.serial;this.context=context;this.activeRequestKey=requestKey;this.snapshot='';this.localReport=null;this.report=null
    this.setData({loading:true,loadingMore:false,dirty:false,needsRefresh:false,hasReport:false,error:'',moreError:'',products:[],hasMore:false,
      sourceLabel:getCloudContext()?'云端数据库订单':'本地演示数据（非真实交易）'})
    try {
      const cloud=!!getCloudContext(), report=cloud?await cloudAnalytics(query):localAnalytics(query)
      if(id!==this.serial||context!==analyticsContext())return
      this.localReport=cloud?null:report;this.report=report;this.snapshot=report.snapshot;this.appliedQuery=query
      const categories=[{id:'',name:'全部历史分类'},{id:'unknown',name:'未记录历史分类／无分类'},...report.categories]
      if(query.categoryId&&!categories.some(c=>c.id===query.categoryId))categories.push({id:query.categoryId,name:'所选历史分类'})
      const s=report.summary
      const cards=[['订单总数（含取消）',s.orderCount],['已确认支付订单数',s.paidCount],['未支付订单数（未取消）',s.unpaidCount],['取消订单数',s.cancelCount],['订单总金额（未取消）',money(s.orderCents)],['已确认支付金额',money(s.paidCents)],['未支付订单金额',money(s.unpaidCents)],['客单价（未取消订单）',money(s.averageCents)],['销量（下单件数，含未支付）',s.quantity]].map(([label,value])=>({label,value}))
      this.setData({categories,categoryIndex:Math.max(0,categories.findIndex(c=>c.id===query.categoryId)),cards,notice:report.notice,amountScope:report.amountScope,
        hasReport:true,hasOrders:s.orderCount>0,unverifiedCount:s.unverifiedCount,ranking:report.ranking.map(productView),
        products:report.products.slice(0,30).map(productView),totalProducts:report.totalProducts,page:1,hasMore:cloud?report.hasMore:report.products.length>30})
      this.renderCharts(report)
    } catch(error){if(id===this.serial&&context===analyticsContext())this.setData({error:errorText(error)})}
    finally{if(id===this.serial){this.setData({loading:false});if(context!==analyticsContext())this.setData({hasReport:false,error:'店铺或模式已变化，请刷新报表'})}}
  },
  renderCharts(report:AnalyticsReport){
    const key=trendKeys[this.data.trendIndex], value=(r:any)=>Number(r[key]), max=Math.max(0,...report.daily.map(value)), hourMax=Math.max(0,...report.hourly.map(r=>r.orderCount))
    this.setData({dailyBars:report.daily.map(r=>({...r,label:r.day,valueLabel:key==='orderCents'||key==='paidCents'?money(value(r)):String(value(r)),width:max?Math.max(0,value(r)/max*100):0})),
      hourBars:report.hourly.map(r=>({...r,label:String(r.hour).padStart(2,'0')+':00–'+String(r.hour).padStart(2,'0')+':59',width:hourMax?r.orderCount/hourMax*100:0}))})
  },
  async loadMore(){
    if(this.data.loading||this.data.loadingMore||this.data.exporting||this.data.needsRefresh||!this.data.hasMore||!this.appliedQuery)return
    if(this.context!==analyticsContext()){await this.refresh();return}
    const id=++this.serial,context=this.context,page=this.data.page+1
    this.setData({loadingMore:true,moreError:''})
    try {
      const rows=this.localReport?this.localReport.products.slice((page-1)*30,page*30):(await cloudAnalytics(this.appliedQuery,page,this.snapshot)).products
      if(id!==this.serial||context!==analyticsContext())return
      const seen=new Set(this.data.products.map(p=>p.key)),add=rows.filter(r=>!seen.has(r.key)),update:Record<string,any>={page,hasMore:page*30<this.data.totalProducts}
      add.forEach((r,i)=>{update['products['+(this.data.products.length+i)+']']=productView(r)});this.setData(update)
    }catch(error){if(id===this.serial)this.setData({moreError:errorText(error),needsRefresh:String(error).includes('analytics_changed_refresh')})}
    finally{if(id===this.serial)this.setData({loadingMore:false})}
  },
  async exportReport(e:any){
    if(this.data.loading||this.data.loadingMore||this.data.exporting||this.data.dirty||this.data.needsRefresh||!this.data.hasReport||!this.appliedQuery)return
    if(this.context!==analyticsContext()){await this.refresh();return}
    const type=String(e.currentTarget.dataset.type);if(!['overview','products','daily'].includes(type))return
    const context=this.context,id=this.serial;this.setData({exporting:true,error:''})
    try {
      const file=this.localReport?localAnalyticsCsv(this.localReport,type,this.appliedQuery):await analyticsExport(this.appliedQuery,type,this.snapshot)
      if(context!==analyticsContext()||id!==this.serial)throw Error('context_changed')
      await shareAnalyticsCsv(file)
    }catch(error){this.setData({error:errorText(error),needsRefresh:String(error).includes('analytics_changed_refresh')})}
    finally{this.setData({exporting:false})}
  }
})
