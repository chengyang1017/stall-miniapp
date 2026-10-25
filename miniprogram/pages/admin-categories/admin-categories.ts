import { loadStore, saveStore, newId, Category } from '../../utils/store'

type Row = Category & { y: number }

Page({
  data: {
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
  onShow() { this.reloadCategories() },
  reloadCategories() {
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
    const name = String(this.data.newName || '').trim()
    if (!name) { wx.showToast({ title: '请输入分类名称', icon: 'none' }); return }
    const store = loadStore()
    if (store.categories.some(c => c.name === name)) { wx.showToast({ title: '分类名称已存在', icon: 'none' }); return }
    store.categories.push({ id: newId(), name })
    saveStore(store)
    this.setData({ newName: '' })
    this.reloadCategories()
  },
  deleteCategory(e: any) {
    if (this.data.draggingId) return
    const id = String(e.currentTarget.dataset.id || '')
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
    if (this.data.draggingId) return
    const id = String(e.currentTarget.dataset.id || '')
    const cat = loadStore().categories.find(c => c.id === id)
    if (cat) this.setData({ editingId: id, editingName: cat.name })
  },
  onEditingName(e: any) { this.setData({ editingName: e.detail.value }) },
  cancelRename() { this.setData({ editingId: '', editingName: '' }) },
  saveRename() {
    const id = this.data.editingId
    const name = String(this.data.editingName || '').trim()
    if (!id) return
    if (!name) { wx.showToast({ title: '名称不能为空', icon: 'none' }); return }
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
