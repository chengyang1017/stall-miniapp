import { loadStore, saveStore, newId, Category } from '../../modules/merchant/demo/store'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { readCloudCategories,writeCloudCategories } from '../../utils/merchantCategoriesCloud'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'

type Row = Category & { y: number }

Page({
  revision:'',context:'',serial:0,
  data: {
    cloudMode:false,cloudBusy:false,cloudError:'',
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
  onShow() {this.reloadCategories()},
  onHide(){this.serial++;if(getCloudContext())this.setData({categories:[],rows:[],cloudBusy:false,draggingId:''})},
  onUnload(){this.serial++},
  async cloudChange(method:'POST'|'PATCH'|'DELETE',id:string,body:Record<string,any>){
    if(this.data.cloudBusy||this.data.cloudError||this.context!==supportIdentity())return
    const context=this.context;this.setData({cloudBusy:true,cloudError:''})
    try{await writeCloudCategories(method,id,{...body,expectedRevision:this.revision});if(context===supportIdentity()){this.setData({editingId:'',editingName:'',newName:''});this.setData({cloudBusy:false});await this.reloadCategories()}}
    catch(e){if(context===supportIdentity())this.setData({rows:this.data.categories.map((c,i)=>({...c,y:i*this.data.rowHeight})),draggingId:'',cloudError:String(e).includes('409')?'分类已变化、名称重复或仍有商品，请刷新核对，未覆盖云端':'云端分类修改未确认，请刷新核对；不会写入本机分类'})}
    finally{this.setData({cloudBusy:false})}
  },
  async reloadCategories() {
    const cfg=getCloudContext(),serial=++this.serial,context=supportIdentity();this.context=context;this.setData({cloudMode:!!cfg,cloudError:'',draggingId:''})
    if(cfg){this.setData({cloudBusy:true,categories:[],rows:[]});try{const r=await readCloudCategories();if(serial!==this.serial||context!==supportIdentity())return;this.revision=r.revision;const categories=r.items,h=this.data.rowHeight;this.setData({categories,rows:categories.map((c:Category,i:number)=>({...c,y:i*h})),areaHeight:categories.length*h})}catch(_){if(serial===this.serial)this.setData({cloudError:'云端分类读取失败，请先登录或检查权限；未回退本机数据'})}finally{if(serial===this.serial)this.setData({cloudBusy:false})}return}
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
    this.dragOrder = this.data.categories.map(c => c.id)
    this.dragSlot = idx
    this.dragStartY = Number(touch.pageY)
    this.dragOriginY = idx * this.data.rowHeight
    this.setData({ draggingId: id })
  },
  handleMove(e: any) {
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
      this.data.rows.forEach((row, idx) => {
        if (row.id !== id) patch['rows[' + idx + '].y'] = this.dragOrder.indexOf(row.id) * h
      })
    }
    const active = this.data.rows.findIndex(row => row.id === id)
    if (active >= 0) patch['rows[' + active + '].y'] = nextY
    this.setData(patch)
  },
  handleEnd(e: any) {
    const id = String(e.currentTarget.dataset.id || '')
    if (id !== this.data.draggingId) return
    if(getCloudContext()){const ids=this.dragOrder.slice();this.setData({draggingId:''});this.cloudChange('PATCH','order',{ids});return}
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
