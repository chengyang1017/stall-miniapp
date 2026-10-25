import { loadDelivery, saveDelivery, DeliveryArea, DeliverySlot } from '../../utils/delivery'
import { newId } from '../../utils/store'
const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
Page({
 data: {areas: [] as DeliveryArea[], slots: [] as DeliverySlot[], areaName:'', slotLabel:'', slotStart:'', slotEnd:''},
 onShow() {console.log('[delivery] 页面已打开');this.refresh()},
 refresh() {const config=loadDelivery(); this.setData({areas:config.areas,slots:config.slots})},
 areaInput(e:any) {this.setData({areaName:e.detail.value})},
 labelInput(e:any) {this.setData({slotLabel:e.detail.value})},
 startInput(e:any) {this.setData({slotStart:e.detail.value})},
 endInput(e:any) {this.setData({slotEnd:e.detail.value})},
 setAreaMapCenter(e:any) {
  const id = String(e.currentTarget.dataset.id)
  wx.chooseLocation({
   success: loc => {
    const lat = Number(loc.latitude), lng = Number(loc.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const data = loadDelivery()
    const item = data.areas.find(x => x.id === id)
    if (!item) return
    item.centerLat = lat
    item.centerLng = lng
    if (!item.radiusMeters) item.radiusMeters = 1500
    saveDelivery(data)
    this.refresh()
   },
   fail: err => {
    if (!String(err.errMsg || '').toLowerCase().includes('cancel')) wx.showToast({title:'地图暂时无法打开',icon:'none'})
   }
  })
 },
 changeAreaRadius(e:any) {
  const id = String(e.currentTarget.dataset.id)
  const n = Number(e.detail.value)
  if (!Number.isInteger(n) || n < 100 || n > 50000) {
   wx.showToast({title:'配送半径须在100至50000米之间', icon:'none'})
   this.refresh()
   return
  }
  const data = loadDelivery()
  const item = data.areas.find(x => x.id === id)
  if (!item) return
  item.radiusMeters = n
  saveDelivery(data)
  this.refresh()
 }, addArea() {
  console.log('[delivery] addArea 点击', this.data.areaName)
  const name=this.data.areaName.trim(); if(!name) { wx.showToast({title:'请输入地区',icon:'none'}); return }
  const data=loadDelivery(); if(data.areas.some(a=>a.name===name)) { wx.showToast({title:'地区已存在',icon:'none'}); return }
  data.areas.push({id:newId(),name,enabled:true}); saveDelivery(data); this.setData({areaName:''}); this.refresh()
  wx.showToast({title:'地区添加成功',icon:'success'})
 },
 toggleArea(e:any) {const id=String(e.currentTarget.dataset.id);const data=loadDelivery(); const item=data.areas.find(x=>x.id===id);if(item)item.enabled=e.detail.value;saveDelivery(data);this.refresh()},
 deleteArea(e:any) {const id=String(e.currentTarget.dataset.id);wx.showModal({title:'删除配送地区？',success:r=>{if(!r.confirm)return;const data=loadDelivery();data.areas=data.areas.filter(x=>x.id!==id);saveDelivery(data);this.refresh()}})},
 addSlot() {
  console.log('[delivery] addSlot 点击', this.data.slotLabel, this.data.slotStart, this.data.slotEnd)
  const label=this.data.slotLabel.trim(),start=this.data.slotStart.trim(),end=this.data.slotEnd.trim()
  if(!label||!validTime(start)||!validTime(end)||start>=end) { wx.showToast({title:'请输入有效时段 HH:mm',icon:'none'}); return }
  const data=loadDelivery();data.slots.push({id:newId(),label,start,end,enabled:true});saveDelivery(data)
  this.setData({slotLabel:'',slotStart:'',slotEnd:''});this.refresh()
  wx.showToast({title:'时段添加成功',icon:'success'})
 },
 toggleSlot(e:any) {const id=String(e.currentTarget.dataset.id);const data=loadDelivery();const item=data.slots.find(x=>x.id===id);if(item)item.enabled=e.detail.value;saveDelivery(data);this.refresh()},
 deleteSlot(e:any) {const id=String(e.currentTarget.dataset.id);wx.showModal({title:'删除配送时段？',success:r=>{if(!r.confirm)return;const data=loadDelivery();data.slots=data.slots.filter(x=>x.id!==id);saveDelivery(data);this.refresh()}})}
})
