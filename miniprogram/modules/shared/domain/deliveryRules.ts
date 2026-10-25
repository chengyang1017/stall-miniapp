import type { DeliveryConfig } from './delivery'
export function validateDeliveryConfig(c:DeliveryConfig):string {
  const time=(s:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)
  if(c.areas.length>30||c.slots.length>30||(c.specialDates||[]).length>366)return '最多30个区域、30个时段、366个特殊日期'
  if(new Set(c.areas.map(a=>a.id)).size!==c.areas.length||new Set(c.slots.map(s=>s.id)).size!==c.slots.length)return '区域或时段ID重复'
  if(c.areas.some(a=>!a.name.trim()||a.name.length>120)||new Set(c.areas.map(a=>a.name.trim().toLowerCase())).size!==c.areas.length)return '区域名称不能为空或重复，最多120字'
  for(const a of c.areas)if((a.centerLat!=null||a.centerLng!=null||a.radiusMeters!=null)&&(!Number.isFinite(a.centerLat)||Number(a.centerLat)<-90||Number(a.centerLat)>90||!Number.isFinite(a.centerLng)||Number(a.centerLng)<-180||Number(a.centerLng)>180||!Number.isInteger(a.radiusMeters)||Number(a.radiusMeters)<100||Number(a.radiusMeters)>100000))return '配送中心或半径无效（100至100000米）'
  for(const s of c.slots){
    const days=s.weekdays||[0,1,2,3,4,5,6]
    if(!s.label.trim()||s.label.length>120||!time(s.start)||!time(s.end)||s.start>=s.end)return '时段名称和时间无效；暂不支持跨日时段'
    if(!days.length||new Set(days).size!==days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6))return '每个时段至少选择一个适用星期'
    if(s.areaIds&&(s.enabled&&!s.areaIds.length||new Set(s.areaIds).size!==s.areaIds.length||s.areaIds.some(id=>!c.areas.some(a=>a.id===id))))return '请为启用时段选择有效区域'
  }
  for(let i=0;i<c.slots.length;i++)for(let j=i+1;j<c.slots.length;j++){
    const a=c.slots[i],b=c.slots[j]
    if(a.enabled&&b.enabled&&a.start<b.end&&b.start<a.end&&(a.weekdays||[0,1,2,3,4,5,6]).some(d=>(b.weekdays||[0,1,2,3,4,5,6]).includes(d))&&c.areas.some(r=>r.enabled&&(!a.areaIds||a.areaIds.includes(r.id))&&(!b.areaIds||b.areaIds.includes(r.id))))return '同一区域、同一星期的启用时段不能重叠'
  }
  const dates=c.specialDates||[]
  if(new Set(dates.map(d=>d.date)).size!==dates.length||dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!Number.isFinite(Date.parse(d.date+'T00:00:00Z'))||new Date(d.date+'T00:00:00Z').toISOString().slice(0,10)!==d.date||d.date<'2000-01-01'||d.date>'2100-12-31'||typeof d.paused!=='boolean'))return '特殊日期格式无效或重复'
  return ''
}

