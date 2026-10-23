import { getSelectedAddress } from '../../utils/addresses'
import { availableAreas, availableSlots } from '../../utils/delivery'
import { getCartDetails, CartDisplayItem } from '../../utils/cart'

const DRAFT_KEY = 'stall_checkout_draft_v1'

interface CheckoutDraft {
  receiverName: string
  phone: string
  area: string
  address: string
  note: string
}

Page({
  data: {
    items: [] as CartDisplayItem[],
    totalText: '0.00',
    totalCount: 0,
    receiverName: '',
    phone: '',
    area: '',
    address: '',
    note: '',
    areas: [] as Array<{id:string;name:string}>,
    slots: [] as Array<{id:string;label:string;start:string;end:string}>,
    areaIndex: -1,
    slotIndex: -1,
    selectedSlotId: '',
    selectedSlotText: ''
  },

  onLoad() {
    const saved = wx.getStorageSync(DRAFT_KEY) as Partial<CheckoutDraft> | ''
    if (saved && typeof saved === 'object') {
      this.setData({
        receiverName: String(saved.receiverName || ''),
        phone: String(saved.phone || ''),
        area: String(saved.area || ''),
        address: String(saved.address || ''),
        note: String(saved.note || '')
      })
    }
  },

  onShow() {
    const cart = getCartDetails()
    const savedAddress = getSelectedAddress()
    const addressData = savedAddress ? {receiverName:savedAddress.receiverName,phone:savedAddress.phone,area:savedAddress.area,address:savedAddress.detail} : {}
    const currentArea = savedAddress ? savedAddress.area : this.data.area
    const areas = availableAreas()
    const slots = availableSlots()
    const areaIndex = areas.findIndex(a=>a.name===currentArea)
    const slotIndex = slots.findIndex(s=>s.id===this.data.selectedSlotId)
    this.setData({...addressData,areas,slots,areaIndex,slotIndex,selectedSlotId:slotIndex>=0?slots[slotIndex].id:'',selectedSlotText:slotIndex>=0?`${slots[slotIndex].label} ${slots[slotIndex].start}–${slots[slotIndex].end}`:'',
      items: cart.items,
      totalText: cart.totalText,
      totalCount: cart.totalCount
    })
  },

  onUnload() {
    this.saveDraft()
  },

  openAddresses() {
    wx.navigateTo({url:'/pages/addresses/addresses'})
  },

  updateName(e: WechatMiniprogram.Input) {
    this.setData({ receiverName: e.detail.value })
  },
  updatePhone(e: WechatMiniprogram.Input) {
    this.setData({ phone: e.detail.value })
  },
  chooseArea(e: any) {
    const index=Number(e.detail.value), selected=this.data.areas[index]
    if(selected)this.setData({area:selected.name,areaIndex:index})
  },
  chooseSlot(e: any) {
    const index=Number(e.detail.value), selected=this.data.slots[index]
    if(selected)this.setData({selectedSlotId:selected.id,slotIndex:index,selectedSlotText:`${selected.label} ${selected.start}–${selected.end}`})
  },
  updateAddress(e: WechatMiniprogram.Input) {
    this.setData({ address: e.detail.value })
  },
  updateNote(e: WechatMiniprogram.Input) {
    this.setData({ note: e.detail.value })
  },

  saveDraft() {
    const { receiverName, phone, area, address, note } = this.data
    wx.setStorageSync(DRAFT_KEY, { receiverName, phone, area, address, note })
  },

  confirmOrder() {
    const { receiverName, phone, area, address } = this.data
    const cart = getCartDetails()
    if (!cart.totalCount) {
      wx.showToast({ title: '购物车为空', icon: 'none' })
      return
    }
    if (!receiverName.trim() || !phone.trim() || !area.trim() || !address.trim()) {
      wx.showToast({ title: '请填写完整收货信息', icon: 'none' })
      return
    }
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      wx.showToast({ title: '请填写正确的大陆手机号', icon: 'none' })
      return
    }
    const configAreas=availableAreas(),configSlots=availableSlots()
    if(!configAreas.some(a=>a.name===area)) return wx.showToast({title:'该地区不可配送',icon:'none'})
    if(!configSlots.some(s=>s.id===this.data.selectedSlotId)) return wx.showToast({title:'请选择有效配送时段',icon:'none'})
    this.saveDraft()
    wx.showModal({
      title: '信息已确认（演示）',
      content: `收货人：${receiverName.trim()}\n商品：${cart.totalCount} 件\n商品金额：¥${cart.totalText}\n\n配送时段：${this.data.selectedSlotText}\n尚未创建正式订单。`,
      showCancel: false
    })
  }
})
