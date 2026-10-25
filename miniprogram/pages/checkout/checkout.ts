import { cloudCartConfig, loadCloudCheckout, localDate, availableCloudSlots, createCloudOrder } from '../../utils/cloudCheckout' // PHASE34_CLOUD_CHECKOUT
import { businessState } from '../../utils/storeHours' // STALL_HOURS_V1
import { getMinimumOrder, minimumOrderShortfall } from '../../utils/minimumOrder'
import { isPointDeliverable } from '../../utils/delivery'
import { getPurchaseDetails, clearDirectPurchase, hasDirectPurchase } from '../../utils/directPurchase'
import { getSelectedAddress, SavedAddress } from '../../utils/addresses'
import { availableAreas, availableSlots } from '../../utils/delivery'
import { CartDisplayItem, saveCart } from '../../utils/cart'
import { createDemoOrder } from '../../utils/orders'
import { formatPublishTime } from '../../utils/productPublishing'

const DRAFT_KEY = 'stall_checkout_draft_v1'

Page({
  // CHECKOUT_NOTE_SHORTCUTS_V1
  toggleNoteShortcut(e: any) {
    const label = String(e.currentTarget.dataset.label || '')
    if (!label) return
    const current = String(this.data.note || '')
    const parts = current.split(/[\n,\uFF0C\u3001;]/).map(s => s.trim()).filter(Boolean)
    const at = parts.indexOf(label)
    if (at >= 0) parts.splice(at, 1)
    else parts.push(label)
    const next = parts.join('\uFF0C')
    if (next.length > 200) {
      wx.showToast({ title: '\u5907\u6CE8\u4E0D\u80FD\u8D85\u8FC7200\u5B57', icon: 'none' })
      return
    }
    this.setData({ note: next })
    this.saveDraft()
  },
  data: {
    cloudMode: false, cloudBusy: false, cloudError: '', deliveryDate: '', deliveryDateMin: '', deliveryDateMax: '', cloudRules: null as any, cloudAreas: [] as Array<{id:string;name:string}>,
    items: [] as CartDisplayItem[],
    totalText: '0.00',
    totalCount: 0,
    minimumOrderText: '0.00',
    minimumRemainingText: '0.00',
    minimumReached: true,
    selectedAddress: null as SavedAddress | null,
    hasAddress: false,
    slots: [] as Array<{ id: string; label: string; start: string; end: string }>,
    slotIndex: -1,
    selectedSlotId: '',
    selectedSlotText: '',
    note: ''
  ,
    noteShortcuts: [] as Array<{label: string}>,},
  onLoad() {
    const draft = wx.getStorageSync(DRAFT_KEY) as { note?: string } | undefined
    if (draft && typeof draft === 'object') {
      this.setData({ note: String(draft.note || '') })
    }
  },
  onShow() {
    if (cloudCartConfig()) { this.refreshCloudCheckout(); return }
    // MERCHANT_NOTE_TAGS_V1
    const merchantTags = wx.getStorageSync('stall_note_tags_v1')
    this.setData({ noteShortcuts: Array.isArray(merchantTags) ? merchantTags.map((label: string) => ({ label })) : [] })
    const cart = getPurchaseDetails()
    const selected = getSelectedAddress() || null
    const slots = availableSlots()
    const slotIndex = slots.findIndex(s => s.id === this.data.selectedSlotId)
    this.setData({
      items: cart.items,
      totalText: cart.totalText,
      totalCount: cart.totalCount,
      minimumOrderText: getMinimumOrder().toFixed(2),
      minimumRemainingText: minimumOrderShortfall(cart.totalText).toFixed(2),
      minimumReached: minimumOrderShortfall(cart.totalText) === 0,
      selectedAddress: selected,
      hasAddress: !!selected,
      slots,
      slotIndex,
      selectedSlotId: slotIndex >= 0 ? slots[slotIndex].id : '',
      selectedSlotText: slotIndex >= 0 ? `${slots[slotIndex].label} ${slots[slotIndex].start}–${slots[slotIndex].end}` : ''
    })
  },
  async refreshCloudCheckout() {
    const cfg=cloudCartConfig()
    if (!cfg) return
    const selected=getSelectedAddress() || null
    const date=this.data.deliveryDate || localDate()
    this.setData({cloudMode:true,cloudBusy:true,cloudError:'',items:[],totalText:'0.00',totalCount:0,
      selectedAddress:selected,hasAddress:!!selected,deliveryDate:date,deliveryDateMin:localDate(),deliveryDateMax:localDate(7)})
    try {
      const {cart,rules}=await loadCloudCheckout()
      const slots=availableCloudSlots(rules,date)
      const slotIndex=slots.findIndex(s=>s.id===this.data.selectedSlotId)
      this.setData({items:cart.items,totalText:cart.totalText,totalCount:cart.totalCount,cloudRules:rules,
        cloudAreas:rules.areas, slots, slotIndex,selectedSlotId:slotIndex>=0?slots[slotIndex].id:'',
        selectedSlotText:slotIndex>=0?slots[slotIndex].label+' '+slots[slotIndex].start+'–'+slots[slotIndex].end:'',
        minimumOrderText:'0.00',minimumRemainingText:'0.00',minimumReached:true,cloudBusy:false,
        cloudError:rules.accepting?'':'店铺当前暂停接单'})
    } catch(e:any){this.setData({cloudBusy:false,cloudError:'配送或商品信息加载失败：'+String(e&&e.message||e)})}
  },
  chooseDeliveryDate(e:any) {
    const date=String(e.detail.value||'')
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<localDate()||date>localDate(7))return
    const rules=this.data.cloudRules
    const slots=rules?availableCloudSlots(rules,date):[]
    this.setData({deliveryDate:date,slots,slotIndex:-1,selectedSlotId:'',selectedSlotText:''})
  },
  async submitCloudOrder() {
    if(this.data.cloudBusy)return
    const address=getSelectedAddress()
    const rules=this.data.cloudRules
    if(!rules||!rules.accepting){ wx.showToast({title:'店铺暂不接单',icon:'none'}); return }
    if(!address){ wx.showToast({title:'请选择收货地址',icon:'none'}); return }
    const area=rules.areas.find((x:any)=>x.name===address.area&&x.enabled)
    if(!area){ wx.showToast({title:'地址不在云端配送范围',icon:'none'}); return }
    const date=this.data.deliveryDate
    if(date<localDate()||date>localDate(7)){ wx.showToast({title:'请选择配送日期',icon:'none'}); return }
    const slots=availableCloudSlots(rules,date)
    const slot=slots.find(s=>s.id===this.data.selectedSlotId)
    if(!slot){ wx.showToast({title:'请选择有效配送时段',icon:'none'}); return }
    if(!address.receiverName.trim()||!address.phone.trim()||!address.detail.trim()){ wx.showToast({title:'请补全收货地址',icon:'none'}); return }
    if(!this.data.totalCount){ wx.showToast({title:'购物车为空',icon:'none'}); return }
    this.setData({cloudBusy:true})
    try {
      const result=await createCloudOrder({address:{receiverName:address.receiverName,phone:address.phone,areaId:area.id,
        detail:address.detail,latitude:address.latitude,longitude:address.longitude},slot:{id:slot.id,date},note:String(this.data.note||'')})
      wx.showModal({title:'订单已创建（待支付）',content:'订单号：'+result.orderId+'\n服务端金额：¥'+(Number(result.totalCents)/100).toFixed(2)+(result.inventoryExpiresAt?'\n有限库存预留至：'+formatPublishTime(result.inventoryExpiresAt,'Asia/Shanghai')+' 北京时间（UTC+8），未支付会释放。':'')+'\n尚未扣款，请勿当作付款成功。',showCancel:false,
        success:()=>wx.switchTab({url:'/pages/cart/cart'})})
    }catch(e:any){const message=String(e&&e.message||e);wx.showModal({title:'云端下单失败',content:/insufficient_stock/.test(message)?'商品库存不足，请返回购物车减少数量或刷新商品列表。':message.slice(0,200),showCancel:false})}
    finally{this.setData({cloudBusy:false})}
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
    if (cloudCartConfig()) { this.submitCloudOrder(); return }
    // STALL_HOURS_V1: local demo guard. Server must recheck before payment.
    if (!businessState().open) { wx.showToast({title:'当前暂停接单或不在营业时间',icon:'none'}); return }

    const geoAddress = getSelectedAddress()
    if (geoAddress && !isPointDeliverable(geoAddress.area, geoAddress.latitude, geoAddress.longitude)) {
      wx.showToast({title:'地址不在配送范围内',icon:'none'})
      return
    }
    const cart = getPurchaseDetails()
    if (!cart.totalCount) { wx.showToast({ title: '购物车为空', icon: 'none' }); return }
    if(cart.items.some(item=>item.stockInsufficient)){wx.showToast({title:'库存不足，请返回购物车调整数量',icon:'none'});return}
    const missing = minimumOrderShortfall(cart.totalText)
    if (missing > 0) { wx.showToast({ title: `还差¥${missing.toFixed(2)}达到起送金额`, icon: 'none' }); return }
    const selected = getSelectedAddress()
    if (!selected) { wx.showToast({ title: '请先选择收货地址', icon: 'none' }); return }
    if (!selected.receiverName.trim() || !/^1[3-9]\d{9}$/.test(selected.phone.trim()) || !selected.detail.trim()) {
      { wx.showToast({ title: '收货地址信息不完整，请编辑地址', icon: 'none' }); return }
    }
    if (!availableAreas().some(a => a.name === selected.area)) {
      { wx.showToast({ title: '该地址已不在配送范围内', icon: 'none' }); return }
    }
    const slot = availableSlots().find(s => s.id === this.data.selectedSlotId)
    if (!slot) { wx.showToast({ title: '请选择有效配送时段', icon: 'none' }); return }
    this.saveDraft()
    wx.showModal({
      title: '创建待支付演示订单',
      content: `收货人：${selected.receiverName}\n地址：${selected.area} ${selected.detail}\n合计：¥${cart.totalText}\n\n仅保存本地演示订单，不会扣款。`,
      success: result => {
        if (!result.confirm) return
        const fresh = getPurchaseDetails()
        const missing = minimumOrderShortfall(fresh.totalText)
        if (missing > 0) {
          wx.showToast({ title: `还差¥${missing.toFixed(2)}达到起送金额`, icon: 'none' })
          this.onShow()
          return
        }
        const address = getSelectedAddress()
        const validSlot = availableSlots().find(s => s.id === this.data.selectedSlotId)
        if (!fresh.totalCount || !address || !address.receiverName.trim() || !/^1[3-9]\d{9}$/.test(address.phone.trim()) || !address.detail.trim() ||
          !availableAreas().some(a => a.name === address.area) || !validSlot) {
          wx.showToast({ title: '商品或地址已变化，请重新确认', icon: 'none' })
          this.onShow()
          return
        }
        try {
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
        } catch (_) {
          wx.showToast({title:'商品状态已变化，请刷新后重试',icon:'none'})
          this.onShow()
        }
      }
    })
  }
})
