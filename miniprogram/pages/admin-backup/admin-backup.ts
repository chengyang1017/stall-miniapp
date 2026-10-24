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
  data: {
    summary: '', preview: '', selected: null as Backup | null,
    busy: false
  },
  onShow() { this.refresh() },
  refresh() {
    const c = count(snapshot())
    this.setData({ summary: `商品 ${c.products} · 分类 ${c.categories} · 订单 ${c.orders}` })
  },
  exportBackup() {
    if (this.data.busy) return
    const backup = snapshot()
    const content = JSON.stringify(backup, null, 2)
    if (content.length > MAX_BYTES) return wx.showModal({ title: '备份过大', content: '数据量超过限制，请使用正式后端备份。', showCancel: false })
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
    if (this.data.busy) return
    wx.chooseMessageFile({ count: 1, type: 'file', extension: ['json'], success: r => {
      const file = r.tempFiles && r.tempFiles[0]
      if (!file || file.size > MAX_BYTES) return wx.showToast({ title: '文件超出大小限制', icon: 'none' })
      const fs = wx.getFileSystemManager()
      fs.readFile({ filePath: file.path, encoding: 'utf8', success: result => {
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
    const backup = this.data.selected
    if (!backup || !validate(backup) || this.data.busy) return
    wx.showModal({ title: '确认覆盖本机数据？',
      content: '这会覆盖备份中包含的商品、设置及订单记录。无法撤销。请先导出当前数据；不会恢复图片实体文件。',
      confirmColor: '#d9534f', success: r => {
        if (!r.confirm) return
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
