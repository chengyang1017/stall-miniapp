import { loadStore, saveStore, newId, Category } from '../../modules/merchant/demo/store'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { readCloudCategories,writeCloudCategories,cachedCloudCategories } from '../../utils/merchantCategoriesCloud'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'

type Row = Category & { y: number }

Page({
  revision:'',context:'',serial:0,operationSerial:0,disposed:false,moveAt:0,lastMove:null as any,rowIndexes:{} as Record<string,number>,
  data: {
    cloudMode:false,cloudBusy:false,cloudRefreshing:false,cloudError:'',syncState:'confirmed',syncMessage:'',
    categories: [] as Category[], rows: [] as Row[],
    newName: '', editingId: '', editingName: '', draggingId: '',
    rowHeight: 86, areaHeight: 0
  },
  dragOrder: [] as string[],
  dragPositions: {} as Record<string, number>,
  dragSlot: -1,
  dragStartY: 0,
  dragOriginY: 0,
  onLoad() {
    const system = wx.getSystemInfoSync()
    // Consistent height even when a row enters inline-edit mode.
    const h = Math.round(system.windowWidth * 172 / 750)
    this.setData({ rowHeight: h })
  },
  onShow() {this.disposed=false;if(this.context!==supportIdentity())this.setData({cloudBusy:false});if(!this.data.cloudBusy)this.reloadCategories()},
  onHide(){this.serial++;if(this.data.draggingId)this.renderCategories(this.data.categories);this.setData({cloudRefreshing:false,draggingId:''})},
  onUnload(){this.disposed=true;this.serial++;this.operationSerial++},
  renderCategories(categories:Category[]){const h=this.data.rowHeight;this.setData({categories,rows:categories.map((c,i)=>({...c,y:i*h})),areaHeight:categories.length*h})},
  async cloudChange(method:'POST'|'PATCH'|'DELETE',id:string,body:Record<string,any>){
    if(this.data.cloudBusy||this.data.cloudError||!this.revision||this.context!==supportIdentity())return
    const operation=++this.operationSerial,context=this.context,before=this.data.categories.map(c=>({...c}));this.serial++
    let optimistic=before
    if(method==='POST')optimistic=before.concat({id:'pending-'+newId(),name:body.name} as Category)
    else if(method==='DELETE')optimistic=before.filter(c=>c.id!==id)
    else if(id==='order'){const lookup=new Map(before.map(c=>[c.id,c]));optimistic=body.ids.map((key:string)=>lookup.get(key)!)}
    else optimistic=before.map(c=>c.id===id?{...c,name:body.name}:c)
    this.renderCategories(optimistic)
    this.setData({cloudBusy:true,cloudRefreshing:false,cloudError:'',syncState:'pending',syncMessage:'正在同步，尚未保存确认',draggingId:''})
    try{
      const r=await writeCloudCategories(method,id,{...body,expectedRevision:this.revision})
      if(this.disposed||operation!==this.operationSerial||context!==supportIdentity())return
      this.revision=r.revision;this.renderCategories(r.items)
      this.setData({syncState:'confirmed',syncMessage:'已保存',...(method==='POST'&&this.data.newName.trim()===body.name?{newName:''}:{}),...(method==='PATCH'&&id!=='order'&&this.data.editingId===id&&this.data.editingName.trim()===body.name?{editingId:'',editingName:''}:{})})
    }catch(e){if(!this.disposed&&operation===this.operationSerial&&context===supportIdentity()){
      this.renderCategories(/http_40[13]/.test(String(e))?[]:before)
      this.setData({syncState:'failed',syncMessage:'修改未确认，输入已保留',cloudError:String(e).includes('409')?'分类版本冲突、名称重复或仍有商品。请重新读取后核对，再重试；未覆盖云端':'云端修改未确认，请重新读取核对后重试，避免重复新增'})
    }}finally{if(!this.disposed&&operation===this.operationSerial&&context===supportIdentity())this.setData({cloudBusy:false})}
  },
  async reloadCategories() {
    if(this.data.cloudBusy)return
    const cfg=getCloudContext(),context=supportIdentity(),changed=context!==this.context,serial=++this.serial
    if(changed){this.operationSerial++;this.revision='';this.setData({categories:[],rows:[],newName:'',editingId:'',editingName:'',areaHeight:0,syncState:'confirmed',syncMessage:''})}
    this.context=context;this.setData({cloudMode:!!cfg,cloudError:'',draggingId:''})
    if(cfg){
      const cached=cachedCloudCategories();if(changed&&cached){this.revision=cached.revision;this.renderCategories(cached.items)}
      this.setData({cloudRefreshing:true})
      try{const r=await readCloudCategories();if(serial!==this.serial||this.disposed||context!==supportIdentity())return;this.revision=r.revision;this.renderCategories(r.items);this.setData({syncState:'confirmed',syncMessage:''})}
      catch(e){if(serial===this.serial&&!this.disposed&&context===supportIdentity()){if(/http_40[13]/.test(String(e))){this.revision='';this.renderCategories([])}this.setData({cloudError:'云端分类读取失败，请检查网络及权限；已有内容未用本机数据替代'})}}
      finally{if(serial===this.serial&&!this.disposed&&context===supportIdentity())this.setData({cloudRefreshing:false})}return
    }
    const categories = loadStore().categories
    const h = this.data.rowHeight
    this.dragOrder = []
    this.dragPositions = {}
    this.dragSlot = -1
    this.setData({
      categories, rows: categories.map((c, i) => ({ ...c, y: i * h })),
      areaHeight: categories.length * h, draggingId: ''
    })
  },
  onNewName(e: any) { this.setData({ newName: e.detail.value }) },
  addCategory() {
    if(this.data.cloudBusy)return
    const name = String(this.data.newName || '').trim()
    if (!name) { wx.showToast({ title: '请输入分类名称', icon: 'none' }); return }
    if(getCloudContext()){this.cloudChange('POST','',{name});return}
    const store = loadStore()
    if (store.categories.some(c => c.name === name)) { wx.showToast({ title: '分类名称已存在', icon: 'none' }); return }
    store.categories.push({ id: newId(), name })
    saveStore(store)
    this.setData({ newName: '' })
    this.reloadCategories()
  },
  deleteCategory(e: any) {
    if(this.data.cloudBusy)return
    if (this.data.draggingId) return
    const id = String(e.currentTarget.dataset.id || '')
    if(getCloudContext()){const context=this.context;wx.showModal({title:'删除云端分类？',content:'服务端会拒绝删除仍有商品的分类，历史订单不受影响。',success:r=>{if(r.confirm&&context===supportIdentity())this.cloudChange('DELETE',id,{})}});return}
    const store = loadStore()
    const category = store.categories.find(c => c.id === id)
    if (!category) return
    if (store.products.some(p => p.categoryId === id)) {
      { wx.showToast({ title: '分类下有商品，请先移走商品', icon: 'none' }); return }
    }
    wx.showModal({ title: '删除分类', content: '确定删除「' + category.name + '」吗？', success: result => {
      if (!result.confirm) return
      const latest = loadStore()
      if (latest.products.some(p => p.categoryId === id)) { wx.showToast({ title: '分类下有商品', icon: 'none' }); return }
      latest.categories = latest.categories.filter(c => c.id !== id)
      saveStore(latest)
      if (this.data.editingId === id) this.setData({ editingId: '', editingName: '' })
      this.reloadCategories()
    } })
  },
  beginRename(e: any) {
    if(this.data.cloudBusy||this.data.cloudError)return
    if (this.data.draggingId) return
    const id = String(e.currentTarget.dataset.id || '')
    const cat = (getCloudContext()?this.data.categories:loadStore().categories).find(c => c.id === id)
    if (cat) this.setData({ editingId: id, editingName: cat.name })
  },
  onEditingName(e: any) { this.setData({ editingName: e.detail.value }) },
  cancelRename() { this.setData({ editingId: '', editingName: '' }) },
  saveRename() {
    if(this.data.cloudBusy)return
    const id = this.data.editingId
    const name = String(this.data.editingName || '').trim()
    if (!id) return
    if (!name) { wx.showToast({ title: '名称不能为空', icon: 'none' }); return }
    if(getCloudContext()){this.cloudChange('PATCH',id,{name});return}
    const store = loadStore()
    const cat = store.categories.find(c => c.id === id)
    if (!cat) return
    if (store.categories.some(c => c.id !== id && c.name === name)) {
      { wx.showToast({ title: '分类名称已存在', icon: 'none' }); return }
    }
    cat.name = name
    saveStore(store)
    this.setData({ editingId: '', editingName: '' })
    this.reloadCategories()
  },
  // Handle-only touch sorting. No movable-view or input remounting.
  handleStart(e: any) {
    if(this.data.cloudBusy||this.data.cloudError)return
    const id = String(e.currentTarget.dataset.id || '')
    const idx = this.data.categories.findIndex(c => c.id === id)
    const touch = e.touches && e.touches[0]
    if (idx < 0 || !touch || this.data.draggingId) return
    this.serial++;this.setData({cloudRefreshing:false})
    this.dragOrder = this.data.categories.map(c => c.id)
    this.dragSlot = idx
    this.dragStartY = Number(touch.pageY)
    this.dragOriginY = idx * this.data.rowHeight
    this.rowIndexes={};this.data.rows.forEach((row,i)=>{this.rowIndexes[row.id]=i})
    this.moveAt=0;this.lastMove=null
    this.setData({ draggingId: id })
  },
  handleMove(e: any) {
    this.lastMove=e
    const now=Date.now();if(now-this.moveAt<16)return
    this.moveAt=now;this.applyMove(e)
  },
  applyMove(e: any) {
    const id = String(e.currentTarget.dataset.id || '')
    const touch = e.touches && e.touches[0]
    if (id !== this.data.draggingId || !touch) return
    const h = this.data.rowHeight
    const n = this.dragOrder.length
    const nextY = Math.max(0, Math.min((n - 1) * h, this.dragOriginY + Number(touch.pageY) - this.dragStartY))
    const target = Math.max(0, Math.min(n - 1, Math.round(nextY / h)))
    const patch: any = {}
    if (target !== this.dragSlot) {
      const old = this.dragOrder.indexOf(id)
      if (old < 0) return
      this.dragOrder.splice(old, 1)
      this.dragOrder.splice(target, 0, id)
      this.dragSlot = target
      for(let slot=Math.min(old,target);slot<=Math.max(old,target);slot++){const key=this.dragOrder[slot];if(key!==id)patch['rows['+this.rowIndexes[key]+'].y']=slot*h}
    }
    const active = this.rowIndexes[id]
    if (active >= 0) patch['rows[' + active + '].y'] = nextY
    this.setData(patch)
  },
  handleEnd(e: any) {
    const id = String(e.currentTarget.dataset.id || '')
    if (id !== this.data.draggingId) return
    if(this.lastMove)this.applyMove(this.lastMove)
    this.lastMove=null
    if(getCloudContext()){const ids=this.dragOrder.slice();this.setData({draggingId:''});if(ids.some((key,i)=>key!==this.data.categories[i]?.id))this.cloudChange('PATCH','order',{ids});else this.renderCategories(this.data.categories);return}
    const store = loadStore()
    const oldIds = store.categories.map(c => c.id)
    const order = this.dragOrder.slice()
    if (oldIds.length === order.length && oldIds.every(key => order.indexOf(key) >= 0)) {
      const lookup: Record<string, Category> = {}
      store.categories.forEach(c => { lookup[c.id] = c })
      if (oldIds.some((key, i) => order[i] !== key)) {
        store.categories = order.map(key => lookup[key])
        saveStore(store)
      }
    }
    this.reloadCategories()
  }
})
