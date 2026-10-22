import { loadDelivery, saveDelivery, DeliveryArea, DeliverySlot } from '../../utils/delivery'
import { newId } from '../../utils/store'
const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
Page({
 data: {areas: [] as DeliveryArea[], slots: [] as DeliverySlot[], areaName:'', slotLabel:'', slotStart:'', slotEnd:''},
 onShow() {this.refresh()},
 refresh() {const config=loadDelivery(); this.setData({areas:config.areas,slots:config.slots})},
 areaInput(e:any) {this.setData({areaName:e.detail.value})},
 labelInput(e:any) {this.setData({slotLabel:e.detail.value})},
 startInput(e:any) {this.setData({slotStart:e.detail.value})},
 endInput(e:any) {this.setData({slotEnd:e.detail.value})},
 addArea() {
  const name=this.data.areaName.trim(); if(!name) return wx.showToast({title:'请输入地区',icon:'none'})
  const data=loadDelivery(); if(data.areas.some(a=>a.name===name)) return wx.showToast({title:'地区已存在',icon:'none'})
  data.areas.push({id:newId(),name,enabled:true}); saveDelivery(data); this.setData({areaName:''}); this.refresh()
 },
 toggleArea(e:any) {const id=String(e.currentTarget.dataset.id);const data=loadDelivery(); const item=data.areas.find(x=>x.id===id);if(item)item.enabled=e.detail.value;saveDelivery(data);this.refresh()},
 deleteArea(e:any) {const id=String(e.currentTarget.dataset.id);wx.showModal({title:'删除配送地区？',success:r=>{if(!r.confirm)return;const data=loadDelivery();data.areas=data.areas.filter(x=>x.id!==id);saveDelivery(data);this.refresh()}})},
 addSlot() {
  const label=this.data.slotLabel.trim(),start=this.data.slotStart.trim(),end=this.data.slotEnd.trim()
  if(!label||!validTime(start)||!validTime(end)||start>=end) return wx.showToast({title:'请输入有效时段 HH:mm',icon:'none'})
  const data=loadDelivery();data.slots.push({id:newId(),label,start,end,enabled:true});saveDelivery(data)
  this.setData({slotLabel:'',slotStart:'',slotEnd:''});this.refresh()
 },
 toggleSlot(e:any) {const id=String(e.currentTarget.dataset.id);const data=loadDelivery();const item=data.slots.find(x=>x.id===id);if(item)item.enabled=e.detail.value;saveDelivery(data);this.refresh()},
 deleteSlot(e:any) {const id=String(e.currentTarget.dataset.id);wx.showModal({title:'删除配送时段？',success:r=>{if(!r.confirm)return;const data=loadDelivery();data.slots=data.slots.filter(x=>x.id!==id);saveDelivery(data);this.refresh()}})}
})
