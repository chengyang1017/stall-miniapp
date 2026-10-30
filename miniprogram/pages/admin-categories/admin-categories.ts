import { CATEGORY_ICONS,categoryIconView,validCategoryIconKey } from '../../modules/shared/domain/categoryIcons'
import { loadStore, saveStore, newId, Category } from '../../modules/merchant/demo/store'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { readCloudCategories,writeCloudCategories,cachedCloudCategories } from '../../utils/merchantCategoriesCloud'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'

type Row = Category & { y: number; iconPath:string; iconActivePath:string; iconLabel:string; resolvedIconKey:string }

Page({
  revision:'',context:'',serial:0,operationSerial:0,disposed:false,saving:false,confirmedBeforeIds:[] as string[],saveQueue:[] as Array<{method:'POST'|'PATCH'|'DELETE';id:string;body:Record<string,any>;temporaryId:string}>,confirmed:[] as Category[],moveAt:0,lastMove:null as any,rowIndexes:{} as Record<string,number>,
  data: {
    cloudMode:false,cloudBusy:false,cloudRefreshing:false,cloudError:'',syncState:'confirmed',syncMessage:'',
    categories: [] as Category[], rows: [] as Row[],
    iconOptions:CATEGORY_ICONS,categoryIconsSupported:false,pickerTarget:'',newIconKey:'',editingIconKey:'',newIconPath:'',newIconLabel:'',editingIconPath:'',editingIconLabel:'',
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
    this.setData({ rowHeight: h });this.refreshIconPreviews()
  },
  onShow() {this.disposed=false;if(this.context!==supportIdentity())this.setData({cloudBusy:false});if(!this.data.cloudBusy)this.reloadCategories()},
  onHide(){this.serial++;if(this.data.draggingId)this.renderCategories(this.data.categories);this.setData({cloudRefreshing:false,draggingId:'',pickerTarget:''})},
  onUnload(){this.disposed=true;this.serial++;this.operationSerial++},
  renderCategories(categories:Category[]){const h=this.data.rowHeight;this.setData({categories,rows:categories.map((c,i)=>({...c,...categoryIconView(c),y:i*h})),areaHeight:categories.length*h})},
  applyCloudChange(items:Category[],change:{method:'POST'|'PATCH'|'DELETE';id:string;body:Record<string,any>;temporaryId:string}):Category[]{
    const {method,id,body,temporaryId}=change
    if(method==='POST')return items.concat({id:temporaryId,name:body.name,...body.iconKey!==undefined?{iconKey:body.iconKey}:{}} as Category)
    if(method==='DELETE')return items.filter(c=>c.id!==id)
    if(id==='order'){const lookup=new Map(items.map(c=>[c.id,c]));return (body.ids as string[]).map(key=>lookup.get(key)).filter(Boolean) as Category[]}
    return items.map(c=>c.id===id?{...c,name:body.name,...body.iconKey!==undefined?{iconKey:body.iconKey}:{}}:c)
  },
  cloudChange(method:'POST'|'PATCH'|'DELETE',id:string,body:Record<string,any>){
    if(this.data.cloudError||!this.revision||this.context!==supportIdentity()){wx.showToast({title:'云端同步异常，正在恢复',icon:'none'});if(!this.data.cloudRefreshing)void this.reloadCategories();return}
    if(id.startsWith('pending-')&&method!=='PATCH'){wx.showToast({title:'该分类还在保存',icon:'none'});return}
    if(Object.prototype.hasOwnProperty.call(body,'iconKey')&&!this.data.categoryIconsSupported){wx.showToast({title:'当前服务未启用图标保存',icon:'none'});return}
    const change={method,id,body:{...body},temporaryId:'pending-'+newId()}
    this.saveQueue.push(change)
    this.serial++
    this.renderCategories(this.applyCloudChange(this.data.categories,change))
    this.setData({cloudBusy:true,cloudRefreshing:false,cloudError:'',syncState:'pending',syncMessage:'正在后台保存，可继续操作',draggingId:''})
    if(method==='POST'&&this.data.newName.trim()===body.name)this.setData({newName:'',newIconKey:''})
    if(method==='PATCH'&&id!=='order'&&this.data.editingId===id)this.setData({editingId:'',editingName:'',editingIconKey:''})
    this.refreshIconPreviews()
    void this.flushCloudChanges()
  },
  async flushCloudChanges(){
    if(this.saving)return
    this.saving=true
    const operation=++this.operationSerial,context=this.context
    try{
      while(this.saveQueue.length){
        const change=this.saveQueue[0]
        this.confirmedBeforeIds=this.confirmed.map(c=>c.id)
        const result=await writeCloudCategories(change.method,change.id,{...change.body,expectedRevision:this.revision})
        if(this.disposed||operation!==this.operationSerial||context!==supportIdentity())return
        this.revision=result.revision
        this.confirmed=result.items
        this.saveQueue.shift()
        if(change.method==='POST'){
          const created=(result.items as Category[]).find((c:Category)=>!this.confirmedBeforeIds.includes(c.id))
          if(created){for(const queued of this.saveQueue){if(queued.id===change.temporaryId)queued.id=created.id;if(Array.isArray(queued.body.ids))queued.body.ids=queued.body.ids.map((v:string)=>v===change.temporaryId?created.id:v)}}
        }

        if(!this.data.draggingId)this.renderCategories(this.saveQueue.reduce((items,next)=>this.applyCloudChange(items,next),result.items))
        else this.setData({categories:this.saveQueue.reduce((items,next)=>this.applyCloudChange(items,next),result.items)})
        this.setData({categoryIconsSupported:result.categoryIconsSupported===true})
      }
      if(!this.disposed&&context===supportIdentity())this.setData({syncState:'confirmed',syncMessage:'已保存'})
    }catch(e){
      if(!this.disposed&&operation===this.operationSerial&&context===supportIdentity()){
        this.saveQueue=[]
        this.renderCategories(this.confirmed)
        this.setData({syncState:'failed',syncMessage:'保存未确认，正在自动重新读取',cloudError:'云端同步异常，正在自动恢复'})
      }
    }finally{
      this.saving=false
      if(!this.disposed&&operation===this.operationSerial&&context===supportIdentity()){
        const recover=this.data.syncState==='failed'
        this.setData({cloudBusy:false})
        if(recover)void this.reloadCategories()
      }
    }
  },
  async reloadCategories() {
    if(this.data.cloudBusy)return
    const cfg=getCloudContext(),context=supportIdentity(),changed=context!==this.context,serial=++this.serial
    if(changed){this.operationSerial++;this.saveQueue=[];this.saving=false;this.confirmed=[];this.revision='';this.setData({categories:[],rows:[],newName:'',editingId:'',editingName:'',areaHeight:0,pickerTarget:'',newIconKey:'',editingIconKey:'',categoryIconsSupported:false,syncState:'confirmed',syncMessage:''});this.refreshIconPreviews()}
    this.context=context;this.setData({cloudMode:!!cfg,cloudError:'',draggingId:''})
    if(cfg){
      const cached=cachedCloudCategories();if(changed&&cached){this.revision=cached.revision;this.confirmed=cached.items;this.renderCategories(cached.items);this.setData({categoryIconsSupported:cached.categoryIconsSupported===true})}
      this.setData({cloudRefreshing:true})
      try{const r=await readCloudCategories();if(serial!==this.serial||this.disposed||context!==supportIdentity())return;this.revision=r.revision;this.confirmed=r.items;this.renderCategories(r.items);this.setData({categoryIconsSupported:r.categoryIconsSupported===true,syncState:'confirmed',syncMessage:''})}
      catch(e){if(serial===this.serial&&!this.disposed&&context===supportIdentity()){if(/http_40[13]/.test(String(e))){this.revision='';this.renderCategories([])}this.setData({cloudError:'云端分类读取失败，请检查网络及权限；已有内容未用本机数据替代'})}}
      finally{if(serial===this.serial&&!this.disposed&&context===supportIdentity())this.setData({cloudRefreshing:false})}return
    }
    const categories = loadStore().categories
    const h = this.data.rowHeight
    this.dragOrder = []
    this.dragPositions = {}
    this.dragSlot = -1
    this.setData({
      categories, rows: categories.map((c, i) => ({ ...c,...categoryIconView(c), y: i * h })),
      areaHeight: categories.length * h, draggingId: ''
    })
  },
  onNewName(e: any) { this.setData({ newName: e.detail.value });this.refreshIconPreviews() },
  addCategory() {
        const name = String(this.data.newName || '').trim()
    if (!name) { wx.showToast({ title: '请输入分类名称', icon: 'none' }); return }
    if(getCloudContext()){if(this.data.newIconKey&&!this.data.categoryIconsSupported){wx.showToast({title:'图标尚未保存，请等待服务升级',icon:'none'});return}this.cloudChange('POST','',{name,...this.data.categoryIconsSupported?{iconKey:this.data.newIconKey||null}:{}});return}
    const store = loadStore()
    if (store.categories.some(c => c.name === name)) { wx.showToast({ title: '分类名称已存在', icon: 'none' }); return }
    store.categories.push({ id: newId(), name,iconKey:validCategoryIconKey(this.data.newIconKey)?this.data.newIconKey:null })
    saveStore(store)
    this.setData({ newName: '',newIconKey:'' });this.refreshIconPreviews()
    this.reloadCategories()
  },
  deleteCategory(e: any) {
        if (this.data.draggingId) return
    const id = String(e.currentTarget.dataset.id || '')
    if(getCloudContext()){if(id.startsWith('pending-'))return;const context=this.context;wx.showModal({title:'删除云端分类？',content:'服务端会拒绝删除仍有商品的分类，历史订单不受影响。',success:r=>{if(r.confirm&&context===supportIdentity())this.cloudChange('DELETE',id,{})}});return}
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
    if(this.data.cloudError)return
    if (this.data.draggingId) return
    const id = String(e.currentTarget.dataset.id || '')
    const cat = (getCloudContext()?this.data.categories:loadStore().categories).find(c => c.id === id)
    if (cat) {this.setData({ editingId: id, editingName: cat.name,editingIconKey:validCategoryIconKey(cat.iconKey)?cat.iconKey:'' });this.refreshIconPreviews()}
  },
  onEditingName(e: any) { this.setData({ editingName: e.detail.value });this.refreshIconPreviews() },
  cancelRename() { this.setData({ editingId: '', editingName: '',editingIconKey:'',pickerTarget:'' }) },
  saveRename() {
        const id = this.data.editingId
    const name = String(this.data.editingName || '').trim()
    if (!id) return
    if (!name) { wx.showToast({ title: '名称不能为空', icon: 'none' }); return }
    if(getCloudContext()){if(this.data.editingIconKey&&!this.data.categoryIconsSupported){wx.showToast({title:'图标尚未保存，请等待服务升级',icon:'none'});return}this.cloudChange('PATCH',id,{name,...this.data.categoryIconsSupported?{iconKey:this.data.editingIconKey||null}:{}});return}
    const store = loadStore()
    const cat = store.categories.find(c => c.id === id)
    if (!cat) return
    if (store.categories.some(c => c.id !== id && c.name === name)) {
      { wx.showToast({ title: '分类名称已存在', icon: 'none' }); return }
    }
    cat.name = name
    cat.iconKey=validCategoryIconKey(this.data.editingIconKey)?this.data.editingIconKey:null
    saveStore(store)
    this.setData({ editingId: '', editingName: '' })
    this.reloadCategories()
  },
  refreshIconPreviews(){const added=categoryIconView({name:this.data.newName,iconKey:this.data.newIconKey}),edited=categoryIconView({id:this.data.editingId,name:this.data.editingName,iconKey:this.data.editingIconKey});this.setData({newIconPath:added.iconPath,newIconLabel:added.iconLabel,editingIconPath:edited.iconPath,editingIconLabel:edited.iconLabel})},
  openNewIconPicker(){this.setData({pickerTarget:'new'})},
  openEditIconPicker(e:any){if(this.data.cloudError||this.data.draggingId)return;const id=String(e.currentTarget.dataset.id||'');if(this.data.editingId!==id)this.beginRename(e);if(this.data.editingId===id)this.setData({pickerTarget:'edit'})},
  closeIconPicker(){this.setData({pickerTarget:''})},
  stopPickerTap(){},
  selectIcon(e:any){if(!this.data.pickerTarget)return;const key=String(e.currentTarget.dataset.key||'');if(key&&!validCategoryIconKey(key))return;this.setData(this.data.pickerTarget==='new'?{newIconKey:key}:{editingIconKey:key});this.refreshIconPreviews()},
  // Handle-only touch sorting. No movable-view or input remounting.
  handleStart(e: any) {
    if(this.data.cloudError){if(!this.data.cloudRefreshing)void this.reloadCategories();return}
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
