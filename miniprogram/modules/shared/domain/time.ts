export function chinaTime(iso: string): string {
  const timestamp = Date.parse(iso)
  if (!Number.isFinite(timestamp)) return iso
  const shifted = new Date(timestamp + 8 * 60 * 60 * 1000)
  return shifted.toISOString().replace('T', ' ').slice(0, 16) + ' (UTC+8)'
}
