import { loadStore, saveStore, newId, Category } from '../../utils/store'
import { authorizedGet, authorizedMutation, localDevAllowed } from '../../utils/authApi'

const CLOUD_CONFIG_KEY = 'stall_cloud_catalog_config_v1'
function cloudConfig(): {apiBase: string; storeSlug: string} | null {
  const cfg = wx.getStorageSync(CLOUD_CONFIG_KEY) as any
  return cfg && typeof cfg.apiBase === 'string' && typeof cfg.storeSlug === 'string' &&
    /^[a-z0-9][a-z0-9-]{1,62}$/.test(cfg.storeSlug) &&
    (/^https:\/\//.test(cfg.apiBase) || localDevAllowed(cfg.apiBase)) ? cfg : null
}

type Row = Category & { y: number }

Page({
  data: {
    categories: [] as Category[], rows: [] as Row[],
    newName: '', editingId: '', editingName: '', draggingId: '',
    rowHeight: 86, areaHeight: 0, cloudMode: false, cloudError: ''
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
  async reloadCategories() {
    const cfg = cloudConfig()
    this.setData({ cloudMode: !!cfg, cloudError: '' })
    let categories: Category[]
    if (cfg) {
      try {
        const response = await authorizedGet(cfg.apiBase, `/v1/merchant/stores/${cfg.storeSlug}/categories`)
        if (!Array.isArray(response.items)) throw new Error('invalid_categories')
        categories = response.items.map((c: any) => ({ id: String(c.id), name: String(c.name) }))
      } catch (_) {
        this.setData({ categories: [], rows: [], areaHeight: 0, cloudError: '云端分类读取失败，请先在云端商品连接完成登录' })
        return
      }
    } else categories = loadStore().categories
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
  async addCategory() {
    const name = String(this.data.newName || '').trim()
    if (!name) return wx.showToast({ title: '请输入分类名称', icon: 'none' })
    if (this.data.cloudMode) {
      const cfg = cloudConfig()
      if (!cfg) return
      try {
        await authorizedMutation(cfg.apiBase, `/v1/merchant/stores/${cfg.storeSlug}/categories`, 'POST', { name })
        this.setData({ newName: '' }); await this.reloadCategories()
        wx.showToast({ title: '云端已保存' })
      } catch (_) { wx.showToast({ title: '云端保存失败', icon: 'none' }) }
      return
    }
    const store = loadStore()
    if (store.categories.some(c => c.name === name)) return wx.showToast({ title: '分类名称已存在', icon: 'none' })
    store.categories.push({ id: newId(), name })
    saveStore(store)
    this.setData({ newName: '' })
    this.reloadCategories()
  },
  deleteCategory(e: any) {
    if (this.data.draggingId) return
    const id = String(e.currentTarget.dataset.id || '')
    if (this.data.cloudMode) {
      const cfg = cloudConfig(); if (!cfg) return
      wx.showModal({ title: '删除云端分类？', content: '分类内存在商品时服务器会拒绝删除。', success: async r => {
        if (!r.confirm) return
        try {
          await authorizedMutation(cfg.apiBase, `/v1/merchant/stores/${cfg.storeSlug}/categories/${id}`, 'DELETE')
          await this.reloadCategories(); wx.showToast({ title: '云端已删除' })
        } catch (_) { wx.showToast({ title: '删除失败，请检查分类商品及权限', icon: 'none' }) }
      } })
      return
    }
    const store = loadStore()
    const category = store.categories.find(c => c.id === id)
    if (!category) return
    if (store.products.some(p => p.categoryId === id)) {
      return wx.showToast({ title: '分类下有商品，请先移走商品', icon: 'none' })
    }
    wx.showModal({ title: '删除分类', content: '确定删除「' + category.name + '」吗？', success: result => {
      if (!result.confirm) return
      const latest = loadStore()
      if (latest.products.some(p => p.categoryId === id)) return wx.showToast({ title: '分类下有商品', icon: 'none' })
      latest.categories = latest.categories.filter(c => c.id !== id)
      saveStore(latest)
      if (this.data.editingId === id) this.setData({ editingId: '', editingName: '' })
      this.reloadCategories()
    } })
  },
  beginRename(e: any) {
    if (this.data.draggingId) return
    const id = String(e.currentTarget.dataset.id || '')
    const cat = this.data.cloudMode ? this.data.categories.find(c => c.id === id) : loadStore().categories.find(c => c.id === id)
    if (cat) this.setData({ editingId: id, editingName: cat.name })
  },
  onEditingName(e: any) { this.setData({ editingName: e.detail.value }) },
  cancelRename() { this.setData({ editingId: '', editingName: '' }) },
  async saveRename() {
    const id = this.data.editingId
    const name = String(this.data.editingName || '').trim()
    if (!id) return
    if (!name) return wx.showToast({ title: '名称不能为空', icon: 'none' })
    if (this.data.cloudMode) {
      const cfg = cloudConfig(); if (!cfg) return
      try {
        await authorizedMutation(cfg.apiBase, `/v1/merchant/stores/${cfg.storeSlug}/categories/${id}`, 'PATCH', { name })
        this.setData({ editingId: '', editingName: '' }); await this.reloadCategories()
        wx.showToast({ title: '云端已保存' })
      } catch (_) { wx.showToast({ title: '云端保存失败', icon: 'none' }) }
      return
    }
    const store = loadStore()
    const cat = store.categories.find(c => c.id === id)
    if (!cat) return
    if (store.categories.some(c => c.id !== id && c.name === name)) {
      return wx.showToast({ title: '分类名称已存在', icon: 'none' })
    }
    cat.name = name
    saveStore(store)
    this.setData({ editingId: '', editingName: '' })
    this.reloadCategories()
  },
  // Handle-only touch sorting. No movable-view or input remounting.
  handleStart(e: any) {
    if (this.data.cloudMode) return
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
