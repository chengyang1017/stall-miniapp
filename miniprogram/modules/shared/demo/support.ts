// Local demonstration: all messages exist only on this device's WeChat storage.
const KEY = 'stall_support_messages_v1'
export interface SupportMessage {
  id: string
  sender: 'customer' | 'merchant'
  content: string
  createdAt: number
}
export function loadSupportMessages(): SupportMessage[] {
  const raw = wx.getStorageSync(KEY)
  if (!Array.isArray(raw)) return []
  return raw.filter((m: any) => m && (m.sender === 'customer' || m.sender === 'merchant') && typeof m.content === 'string' && typeof m.createdAt === 'number')
}
export function sendSupportMessage(sender: 'customer' | 'merchant', content: string): boolean {
  const message = content.trim()
  if (!message || message.length > 500) return false
  const all = loadSupportMessages()
  all.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, sender, content: message, createdAt: Date.now() })
  wx.setStorageSync(KEY, all)
  return true
}
export function displaySupportMessages(): Array<SupportMessage & { time: string; mine: boolean }> {
  return loadSupportMessages().map(m => {
    const d = new Date(m.createdAt)
    const time = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    return { ...m, time, mine: false }
  })
}
