import { businessState } from '../../utils/storeHours' // STALL_HOURS_V1
import { isPointDeliverable } from '../../utils/delivery'
import { getPurchaseDetails, clearDirectPurchase, hasDirectPurchase } from '../../utils/directPurchase'
import { getSelectedAddress, SavedAddress } from '../../utils/addresses'
import { availableAreas, availableSlots } from '../../utils/delivery'
import { getCartDetails, CartDisplayItem, saveCart } from '../../utils/cart'
import { createDemoOrder } from '../../utils/orders'

const DRAFT_KEY = 'stall_checkout_draft_v1'

Page({
  data: {
    items: [] as CartDisplayItem[],
    totalText: '0.00',
    totalCount: 0,
    selectedAddress: null as SavedAddress | null,
    hasAddress: false,
    slots: [] as Array<{ id: string; label: string; start: string; end: string }>,
    slotIndex: -1,
    selectedSlotId: '',
    selectedSlotText: '',
    note: ''
  },
  onLoad() {
    const draft = wx.getStorageSync(DRAFT_KEY) as { note?: string } | undefined
    if (draft && typeof draft === 'object') {
      this.setData({ note: String(draft.note || '') })
    }
  },
  onShow() {
    const cart = getPurchaseDetails()
    const selected = getSelectedAddress() || null
    const slots = availableSlots()
    const slotIndex = slots.findIndex(s => s.id === this.data.selectedSlotId)
    this.setData({
      items: cart.items,
      totalText: cart.totalText,
      totalCount: cart.totalCount,
      selectedAddress: selected,
      hasAddress: !!selected,
      slots,
      slotIndex,
      selectedSlotId: slotIndex >= 0 ? slots[slotIndex].id : '',
      selectedSlotText: slotIndex >= 0 ? `${slots[slotIndex].label} ${slots[slotIndex].start}–${slots[slotIndex].end}` : ''
    })
  },
  onUnload() { this.saveDraft() },
  openAddresses() { wx.navigateTo({ url: '/pages/addresses/addresses' }) },
  chooseSlot(e: any) {
    const index = Number(e.detail.value)
    const slot = this.data.slots[index]
    if (!slot) return
    this.setData({
      slotIndex: index,
      selectedSlotId: slot.id,
      selectedSlotText: `${slot.label} ${slot.start}–${slot.end}`
    })
  },
  updateNote(e: WechatMiniprogram.Input) { this.setData({ note: e.detail.value }) },
  saveDraft() { wx.setStorageSync(DRAFT_KEY, { note: this.data.note }) },
  confirmOrder() {
    // STALL_HOURS_V1: local demo guard. Server must recheck before payment.
    if (!businessState().open) { wx.showToast({title:'当前暂停接单或不在营业时间',icon:'none'}); return }

    const geoAddress = getSelectedAddress()
    if (geoAddress && !isPointDeliverable(geoAddress.area, geoAddress.latitude, geoAddress.longitude)) {
      wx.showToast({title:'地址不在配送范围内',icon:'none'})
      return
    }
    const cart = getPurchaseDetails()
    if (!cart.totalCount) return wx.showToast({ title: '购物车为空', icon: 'none' })
    const selected = getSelectedAddress()
    if (!selected) return wx.showToast({ title: '请先选择收货地址', icon: 'none' })
    if (!selected.receiverName.trim() || !/^1[3-9]\d{9}$/.test(selected.phone.trim()) || !selected.detail.trim()) {
      return wx.showToast({ title: '收货地址信息不完整，请编辑地址', icon: 'none' })
    }
    if (!availableAreas().some(a => a.name === selected.area)) {
      return wx.showToast({ title: '该地址已不在配送范围内', icon: 'none' })
    }
    const slot = availableSlots().find(s => s.id === this.data.selectedSlotId)
    if (!slot) return wx.showToast({ title: '请选择有效配送时段', icon: 'none' })
    this.saveDraft()
    wx.showModal({
      title: '创建待支付演示订单',
      content: `收货人：${selected.receiverName}\n地址：${selected.area} ${selected.detail}\n合计：¥${cart.totalText}\n\n仅保存本地演示订单，不会扣款。`,
      success: result => {
        if (!result.confirm) return
        const fresh = getPurchaseDetails()
        const address = getSelectedAddress()
        const validSlot = availableSlots().find(s => s.id === this.data.selectedSlotId)
        if (!fresh.totalCount || !address || !address.receiverName.trim() || !/^1[3-9]\d{9}$/.test(address.phone.trim()) || !address.detail.trim() ||
          !availableAreas().some(a => a.name === address.area) || !validSlot) {
          wx.showToast({ title: '商品或地址已变化，请重新确认', icon: 'none' })
          this.onShow()
          return
        }
        const order = createDemoOrder({
          items: fresh.items,
          totalText: fresh.totalText,
          receiverName: address.receiverName.trim(),
          phone: address.phone.trim(),
          area: address.area,
          detail: address.detail.trim(),
          note: this.data.note.trim(),
          slotId: validSlot.id,
          slotText: `${validSlot.label} ${validSlot.start}–${validSlot.end}`
        })
        if (hasDirectPurchase()) clearDirectPurchase(); else saveCart([])
        wx.redirectTo({ url: `/pages/orders/orders?created=${encodeURIComponent(order.id)}` })
      }
    })
  }
})
