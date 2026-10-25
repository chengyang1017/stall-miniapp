// Use database time for every server-side visibility/purchase decision.
export function publishedSql(alias = 'p') {
  return `(${alias}.active = true OR (${alias}.publish_at IS NOT NULL AND ${alias}.publish_at <= statement_timestamp()))`
}

export function validTimeZone(zone) {
  if (typeof zone !== 'string' || zone.length > 100) return false
  try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(); return true } catch { return false }
}

function wallParts(timestamp, zone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp))
  const get = type => Number(parts.find(p => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
}

// Reject invalid calendar dates, DST gaps and ambiguous DST folds.
export function localPublishTime(raw, zone) {
  if (!validTimeZone(zone) || typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)) throw Error('invalid_publish_time')
  const [year, month, day, hour, minute] = raw.match(/\d+/g).map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  if (new Date(wall).toISOString().slice(0,16).replace('T',' ') !== raw || year < 2000 || year > 2100) throw Error('invalid_publish_time')
  const offsets = new Set([-36, -12, 0, 12, 36].map(h => { const t = wall + h * 3600000; return wallParts(t, zone) - t }))
  const candidates = [...offsets].map(offset => wall - offset).filter(t => wallParts(t, zone) === wall)
  if (candidates.length !== 1) throw Error('ambiguous_or_missing_local_time')
  return new Date(candidates[0]).toISOString()
}
