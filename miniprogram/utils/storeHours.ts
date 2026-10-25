export interface DayHours { enabled: boolean; start: string; end: string }
export interface HoursConfig { accepting: boolean; notice: string; days: DayHours[] }
const KEY = 'stall_store_hours_v1'
const DEFAULTS: HoursConfig = {
  accepting: true,
  notice: '',
  days: [0,1,2,3,4,5,6].map(() => ({enabled:true,start:'09:00',end:'21:00'}))
}
export function loadHours(): HoursConfig {
  const data = wx.getStorageSync(KEY)
  if (data && typeof data === 'object' && Array.isArray(data.days) && data.days.length === 7) return data as HoursConfig
  return JSON.parse(JSON.stringify(DEFAULTS)) as HoursConfig
}
export function saveHours(value: HoursConfig): void { wx.setStorageSync(KEY,value) }
export function businessState(now: Date = new Date()): {open:boolean;label:string;notice:string} {
  const setting = loadHours()
  if (!setting.accepting) return {open:false,label:'暂停接单',notice:setting.notice}
  const beijing = new Date(now.getTime()+8*3600000)
  const day = setting.days[beijing.getUTCDay()]
  const clock = beijing.toISOString().slice(11,16)
  const opened = !!day && day.enabled && clock >= day.start && clock < day.end
  return {open:opened,label:opened?'营业中':'休息中',notice:setting.notice}
}
