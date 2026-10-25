// No phone timer is used. Cloud writes always convert and validate again on the server.
function wallNumber(time: number, zone: string): number {
  // Mainland China uses Beijing time (UTC+8) throughout the supported 2000-2100 range.
  if (zone === 'Asia/Shanghai') return time + 8 * 3600000
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false}).formatToParts(new Date(time))
  const n = (type: string) => Number((parts.find(p => p.type === type) || {value:''}).value)
  return Date.UTC(n('year'), n('month')-1, n('day'), n('hour') % 24, n('minute'), n('second'))
}
export function formatPublishTime(utc: string, zone: string): string {
  try { return new Date(wallNumber(Date.parse(utc), zone)).toISOString().slice(0,16).replace('T',' ') }
  catch (_) { return '' }
}
export function parsePublishTime(date: string, time: string, zone: string, requireFuture = true): string {
  const raw = date + ' ' + time
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)) throw new Error('请选择完整日期和时间')
  const n = raw.match(/\d+/g)!.map(Number)
  const wall = Date.UTC(n[0], n[1]-1, n[2], n[3], n[4])
  if (n[0]<2000 || n[0]>2100 || new Date(wall).toISOString().slice(0,16).replace('T',' ') !== raw) throw new Error('上架日期或时间无效')
  let candidates: number[]
  try {
    const offsets = Array.from(new Set([-36,-12,0,12,36].map(h => { const t = wall + h*3600000; return wallNumber(t,zone)-t })))
    candidates = offsets.map(offset => wall-offset).filter(t => wallNumber(t,zone) === wall)
  } catch (_) { throw new Error('当前运行环境不支持店铺时区，请升级微信') }
  if (candidates.length !== 1) throw new Error('该时间不存在或有夏令时歧义，请另选时间')
  if (requireFuture && candidates[0] <= Date.now()) throw new Error('上架时间必须在未来')
  return new Date(candidates[0]).toISOString()
}
