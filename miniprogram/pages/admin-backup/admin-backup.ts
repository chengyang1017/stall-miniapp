import { getMerchantContext } from '../../utils/merchantContext'
import { authorizedGet } from '../../utils/authApi'
import { shareCsvFile } from '../../utils/shareCsvFile'
import { archiveGet,archivePost,archiveContext,archiveKey,archiveTime,archiveErrorText,shareArchiveFile,imageCheckSummary } from '../../utils/merchantArchivesCloud'
const KEYS = [
  'stall_demo_v1', 'stall_demo_orders_v1', 'stall_store_hours_v1',
  'stall_delivery_v1', 'stall_note_tags_v1',
  'stall_placeholder_style_v1', 'stall_placeholder_custom_v1',
  'stall_minimum_order_v1'
]
const FORMAT = 'stall-miniapp-backup'
const MAX_BYTES = 5 * 1024 * 1024

type Backup = { format: string; version: number; createdAt: string; data: Record<string, any> }
function validate(v: any): v is Backup {
  if (!v || v.format !== FORMAT || v.version !== 1 || !v.data || typeof v.data !== 'object' || Array.isArray(v.data)) return false
  if (Object.keys(v.data).some(k => !KEYS.includes(k))) return false
  const store = v.data.stall_demo_v1
  if (store !== undefined && (!store || !Array.isArray(store.categories) || !Array.isArray(store.products))) return false
  if (v.data.stall_demo_orders_v1 !== undefined && !Array.isArray(v.data.stall_demo_orders_v1)) return false
  const hours = v.data.stall_store_hours_v1
  if (hours !== undefined && (!hours || !Array.isArray(hours.days) || hours.days.length !== 7)) return false
  const delivery = v.data.stall_delivery_v1
  if (delivery !== undefined && (!delivery || !Array.isArray(delivery.areas) || !Array.isArray(delivery.slots))) return false
  const tags = v.data.stall_note_tags_v1
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((x: any) => typeof x !== 'string'))) return false
  return true
}
function snapshot(): Backup {
  const data: Record<string, any> = {}
  for (const key of KEYS) {
    const value = wx.getStorageSync(key)
    if (value !== undefined && value !== null && value !== '') data[key] = value
  }
  return { format: FORMAT, version: 1, createdAt: new Date().toISOString(), data }
}
function count(backup: Backup) {
  const store = backup.data.stall_demo_v1 || {}
  return { products: Array.isArray(store.products) ? store.products.length : 0,
    categories: Array.isArray(store.categories) ? store.categories.length : 0,
    orders: Array.isArray(backup.data.stall_demo_orders_v1) ? backup.data.stall_demo_orders_v1.length : 0 }
}
Page({
  context:'',serial:0,visible:false,cursor:'',pendingExport:null as null|{key:string;request:Record<string,string>},
  data: {
    cloudMode:false,history:[] as any[],historyLoading:false,hasMore:false,error:'',cloudPreview:'',from:new Date(Date.now()+8*3600000-29*86400000).toISOString().slice(0,10),to:new Date(Date.now()+8*3600000).toISOString().slice(0,10),
    summary: '', preview: '', selected: null as Backup | null,
    busy: false
  },
  onShow() {this.visible=true;const context=archiveContext();if(context!==this.context){this.serial++;this.context=context;this.pendingExport=null;this.cursor='';this.setData({history:[],selected:null,preview:'',cloudPreview:'',error:'',hasMore:false,historyLoading:false})}this.setData({cloudMode:!!getMerchantContext()});if(getMerchantContext())this.loadHistory();else this.refresh()},
  onHide(){this.visible=false;this.serial++;this.setData({history:[],selected:null,preview:'',cloudPreview:'',error:'',hasMore:false,historyLoading:false})},
  onUnload(){this.visible=false;this.serial++;this.pendingExport=null},
  current(context:string){return this.visible&&context===this.context&&context===archiveContext()},
  async loadHistory(more=false){
    if(!getMerchantContext()||this.data.historyLoading)return
    const context=archiveContext();if(context!==this.context){this.onShow();return}
    const serial=++this.serial;this.setData({historyLoading:true,error:''})
    try{const r=await archiveGet('',more?{before:this.cursor,limit:20}:{limit:20});if(!this.current(context)||serial!==this.serial)return
      const seen=new Map<string,any>();(more?this.data.history:[]).concat(r.items).forEach((x:any)=>seen.set(x.id,{...x,time:archiveTime(x.createdAt),expiry:archiveTime(x.expiresAt),size:(x.bytes/1024).toFixed(1)+' KB',statusText:x.status==='ready'?(x.downloadable?'可下载':'已过期'):x.status==='generating'?'生成中':'生成失败'}));this.cursor=r.nextCursor||'';this.setData({history:Array.from(seen.values()),hasMore:r.hasMore})
    }catch(e){if(this.current(context)&&serial===this.serial){if(/401|403/.test(String(e)))this.setData({history:[],hasMore:false});this.setData({error:archiveErrorText(e)})}}
    finally{if(serial===this.serial)this.setData({historyLoading:false})}
  },
  reloadHistory(){this.loadHistory()},
  moreHistory(){if(this.data.hasMore)this.loadHistory(true)},
  async onPullDownRefresh(){if(getMerchantContext())await this.loadHistory();else this.refresh();wx.stopPullDownRefresh()},
  dateFrom(e:any){if(!this.data.busy){this.pendingExport=null;this.setData({from:String(e.detail.value)})}},
  dateTo(e:any){if(!this.data.busy){this.pendingExport=null;this.setData({to:String(e.detail.value)})}},
  async generate(e:any){
    if(this.data.busy||!getMerchantContext())return
    const kind=String(e.currentTarget.dataset.kind||''),request:Record<string,string>={kind}
    if(['orders-json','archive-json'].includes(kind)){request.from=this.data.from;request.to=this.data.to}
    const context=archiveContext();if(!this.current(context)){this.onShow();return}
    if(!this.pendingExport||JSON.stringify(this.pendingExport.request)!==JSON.stringify(request))this.pendingExport={key:archiveKey(),request}
    const pending=this.pendingExport;this.setData({busy:true,error:''})
    try{const r=await archivePost('',{...request,clientKey:pending.key});if(!this.current(context))return
      if(r.archive.status==='failed'){this.pendingExport=null;throw Error('generation_failed')}
      if(r.archive.status==='ready')this.pendingExport=null
      wx.showToast({title:r.archive.status==='ready'?'归档已生成':'仍在生成，请刷新历史',icon:'none'});await this.loadHistory()
    }catch(e){if(this.current(context)){await this.loadHistory();this.setData({error:archiveErrorText(e)+'；超时未确认时可用同一按钮重试，并先核对历史记录。'})}}
    finally{this.setData({busy:false})}
  },
  async download(e:any){
    if(this.data.busy||!getMerchantContext())return
    const id=String(e.currentTarget.dataset.id||''),context=archiveContext();if(!this.current(context))return
    this.setData({busy:true,error:''})
    try{const r=await archiveGet('/'+id+'/download');if(this.current(context))await shareArchiveFile(r.content,r.filename)}catch(e){if(this.current(context))this.setData({error:archiveErrorText(e)})}finally{this.setData({busy:false})}
  },
  async exportBilling(){
    const c=getMerchantContext(),context=archiveContext();if(!c||this.data.busy||!this.current(context))return
    this.setData({busy:true,error:''})
    try{const r=await authorizedGet(c.apiBase,`/v1/merchant/stores/${c.storeSlug}/billing/export`,{from:this.data.from,to:this.data.to,format:'json'});if(this.current(context))await shareCsvFile(r.csv,r.filename)}catch(e){if(this.current(context))this.setData({error:archiveErrorText(e)})}finally{this.setData({busy:false})}
  },
  preflight(){
    if(this.data.busy||!getMerchantContext())return
    const context=archiveContext();if(!this.current(context))return
    this.setData({busy:true,error:'',cloudPreview:''})
    wx.chooseMessageFile({count:1,type:'file',extension:['json'],success:r=>{
      const f=r.tempFiles[0];if(!f||f.size>4*1024*1024||!this.current(context)){this.setData({busy:false,error:'请选择不超过4MB的本店云端归档JSON'});return}
      wx.getFileSystemManager().readFile({filePath:f.path,encoding:'utf8',success:async result=>{
        try{if(!this.current(context))return;const r=await archivePost('/preflight',{content:String(result.data).replace(/^\uFEFF/,'')});if(this.current(context))this.setData({cloudPreview:`仅校验预览，不执行恢复\n创建时间：${archiveTime(r.createdAt)}\n类型：${r.kind}\n记录数：${JSON.stringify(r.counts)}\n图片引用：${r.imageReferences.length}，当前仍被引用：${r.currentlyReferencedImages}\n${imageCheckSummary(r)}\n${r.warnings.join('\n')}\n${r.notice}`})}catch(e){if(this.current(context))this.setData({error:archiveErrorText(e)})}finally{this.setData({busy:false})}
      },fail:()=>{this.setData({busy:false,error:'读取文件失败'})}})
    },fail:()=>this.setData({busy:false})})
  },
  refresh() {
    if(getMerchantContext())return
    const c = count(snapshot())
    this.setData({ summary: `商品 ${c.products} · 分类 ${c.categories} · 订单 ${c.orders}` })
  },
  exportBackup() {
    if(getMerchantContext())return
    if (this.data.busy) return
    const backup = snapshot()
    const content = JSON.stringify(backup, null, 2)
    if (content.length > MAX_BYTES) { wx.showModal({ title: '备份过大', content: '数据量超过限制，请使用正式后端备份。', showCancel: false }); return }
    const fs = wx.getFileSystemManager()
    const path = `${wx.env.USER_DATA_PATH}/stall-backup-${Date.now()}.json`
    this.setData({ busy: true })
    fs.writeFile({ filePath: path, data: content, encoding: 'utf8',
      success: () => {
        this.setData({ busy: false })
        wx.showModal({ title: '备份已生成', content: '备份包含顾客姓名、电话和地址，请只保存到可信位置。图片文件不包含在 JSON 备份中。',
          confirmText: '分享文件', success: r => {
            if (!r.confirm) return
            wx.shareFileMessage({ filePath: path, fileName: `stall-backup-${Date.now()}.json`,
              fail: () => wx.showToast({ title: '请在支持文件分享的微信真机端操作', icon: 'none' }) })
          } })
      },
      fail: () => { this.setData({ busy: false }); wx.showToast({ title: '备份生成失败', icon: 'none' }) }
    })
  },
  importBackup() {
    if(getMerchantContext())return
    if (this.data.busy) return
    wx.chooseMessageFile({ count: 1, type: 'file', extension: ['json'], success: r => {
      if(getMerchantContext())return
      const file = r.tempFiles && r.tempFiles[0]
      if (!file || file.size > MAX_BYTES) { wx.showToast({ title: '文件超出大小限制', icon: 'none' }); return }
      const fs = wx.getFileSystemManager()
      fs.readFile({ filePath: file.path, encoding: 'utf8', success: result => {
        if(getMerchantContext())return
        try {
          const parsed = JSON.parse(String(result.data))
          if (!validate(parsed)) throw new Error('invalid backup')
          const c = count(parsed)
          this.setData({ selected: parsed,
            preview: `创建时间：${parsed.createdAt || '未知'}\n商品 ${c.products} · 分类 ${c.categories} · 订单 ${c.orders}\n将覆盖备份中包含的对应数据。` })
        } catch (_) { this.setData({ selected: null, preview: '' }); wx.showToast({ title: '不是受支持的备份文件', icon: 'none' }) }
      }, fail: () => wx.showToast({ title: '读取文件失败', icon: 'none' }) })
    } })
  },
  restore() {
    if(getMerchantContext())return
    const backup = this.data.selected
    if (!backup || !validate(backup) || this.data.busy) return
    wx.showModal({ title: '确认覆盖本机数据？',
      content: '这会覆盖备份中包含的商品、设置及订单记录。无法撤销。请先导出当前数据；不会恢复图片实体文件。',
      confirmColor: '#d9534f', success: r => {
        if (!r.confirm || getMerchantContext()) return
        this.setData({ busy: true })
        // Capture current values first, so partial write failures can be rolled back.
        const old: Record<string, any> = {}
        const keys = KEYS.filter(k => Object.prototype.hasOwnProperty.call(backup.data, k))
        try {
          for (const k of keys) old[k] = wx.getStorageSync(k)
          for (const k of keys) wx.setStorageSync(k, backup.data[k])
          this.setData({ selected: null, preview: '', busy: false })
          this.refresh()
          wx.showToast({ title: '数据恢复成功', icon: 'success' })
        } catch (_) {
          for (const k of keys) { try { wx.setStorageSync(k, old[k]) } catch (_) {} }
          this.setData({ busy: false })
          wx.showModal({ title: '恢复未完成', content: '写入失败，已尝试还原原数据。请检查后再操作。', showCancel: false })
        }
      } })
  }
})
