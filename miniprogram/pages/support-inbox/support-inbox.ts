import { displaySupportMessages, sendSupportMessage } from '../../utils/support'
Page({
  data: { messages: [] as ReturnType<typeof displaySupportMessages>, draft: '', bottomId: '' },
  onShow() { this.refresh() },
  refresh() {
    const messages = displaySupportMessages().map(m => ({ ...m, mine: m.sender === 'merchant' }))
    this.setData({ messages, bottomId: messages.length ? `msg-${messages[messages.length-1].id}` : '' })
  },
  onPullDownRefresh() { this.refresh(); wx.stopPullDownRefresh() },
  onInput(e: WechatMiniprogram.Input) { this.setData({ draft: e.detail.value }) },
  send() {
    if (!sendSupportMessage('merchant', String(this.data.draft))) { wx.showToast({ title: '请输入1至500字', icon: 'none' }); return }
    this.setData({ draft: '' }); this.refresh()
  }
})
