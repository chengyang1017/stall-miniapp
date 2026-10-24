const KEY = 'stall_note_tags_v1'
function readTags(): string[] {
  const raw = wx.getStorageSync(KEY)
  return Array.isArray(raw) ? raw.filter((x: any) => typeof x === 'string').slice(0, 30) : []
}
Page({
  data: { tags: [] as string[], draft: '', editingIndex: -1, editingValue: '' },
  onShow() { this.setData({ tags: readTags() }) },
  typeDraft(e: any) { this.setData({ draft: String(e.detail.value || '') }) },
  typeEdit(e: any) { this.setData({ editingValue: String(e.detail.value || '') }) },
  persist(tags: string[]) { wx.setStorageSync(KEY, tags); this.setData({ tags }) },
  add() {
    const value = this.data.draft.trim()
    if (!value) return wx.showToast({ title: '请输入标签', icon: 'none' })
    if (value.length > 20) return wx.showToast({ title: '最多20个字', icon: 'none' })
    const tags = readTags()
    if (tags.includes(value)) return wx.showToast({ title: '标签已存在', icon: 'none' })
    if (tags.length >= 30) return wx.showToast({ title: '最多30个标签', icon: 'none' })
    this.persist([...tags, value]); this.setData({ draft: '' })
  },
  edit(e: any) {
    const i = Number(e.currentTarget.dataset.index)
    const tags = readTags()
    if (!Number.isInteger(i) || i < 0 || i >= tags.length) return
    this.setData({ editingIndex: i, editingValue: tags[i] })
  },
  cancelEdit() { this.setData({ editingIndex: -1, editingValue: '' }) },
  saveEdit() {
    const i = this.data.editingIndex
    const tags = readTags()
    if (i < 0 || i >= tags.length) return
    const value = this.data.editingValue.trim()
    if (!value || value.length > 20) return wx.showToast({ title: '标签须为1至20字', icon: 'none' })
    if (tags.some((x, j) => j !== i && x === value)) return wx.showToast({ title: '标签已存在', icon: 'none' })
    tags[i] = value
    this.persist(tags); this.cancelEdit()
  },
  remove(e: any) {
    const i = Number(e.currentTarget.dataset.index)
    const tags = readTags()
    if (!Number.isInteger(i) || i < 0 || i >= tags.length) return
    wx.showModal({ title: '删除标签？', content: tags[i], success: r => {
      if (!r.confirm) return
      const current = readTags()
      if (i >= current.length) return
      current.splice(i, 1)
      this.persist(current); this.cancelEdit()
    } })
  },
  move(e: any) {
    const i = Number(e.currentTarget.dataset.index)
    const step = Number(e.currentTarget.dataset.step)
    const tags = readTags()
    const j = i + step
    if (!Number.isInteger(i) || !Number.isInteger(step) || i < 0 || j < 0 || j >= tags.length || this.data.editingIndex >= 0) return
    const temp = tags[i]; tags[i] = tags[j]; tags[j] = temp
    this.persist(tags)
  }
})
