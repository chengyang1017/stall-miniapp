import { cloudCartConfig, loadCloudCheckout, localDate, availableCloudSlots, cloudDeliveryReason, createCloudOrder } from '../../utils/cloudCheckout' // PHASE34_CLOUD_CHECKOUT
import { businessState } from '../../modules/customer/demo/settings' // STALL_HOURS_V1
import { getMinimumOrder, minimumOrderShortfall } from '../../modules/customer/demo/settings'
import { isPointDeliverable } from '../../modules/customer/demo/settings'
import { getPurchaseDetails, clearDirectPurchase, hasDirectPurchase } from '../../utils/directPurchase'
import { getSelectedAddress, SavedAddress } from '../../utils/addresses'
import { availableAreas, availableSlots, loadDelivery } from '../../modules/customer/demo/settings'
import { CartDisplayItem, saveCart, loadCart } from '../../utils/cart'
import { createDemoOrder, openCreatedDemoOrder } from '../../modules/customer/demo/orders'
import { formatPublishTime } from '../../utils/productPublishing'
import { minimumDisplay } from '../../modules/shared/api/business'
import { deliveryStoreKey, resolveDeliveryArea, deliveryAddressReason } from '../../modules/customer/api/delivery'
import { refreshCloudAddresses } from '../../modules/customer/api/addresses'
import { cloudCacheSuffix } from '../../utils/cloudCart'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'
import { getSessionToken } from '../../modules/shared/runtime/context'

const DRAFT_KEY = 'stall_checkout_draft_v1'

Page({
  checkoutContext:'',
  draftStorageKey(){const cfg=cloudCartConfig();return cfg?(getSessionToken()?DRAFT_KEY+':'+cloudCacheSuffix(cfg.storeSlug):''):DRAFT_KEY+':demo'},
  restoreDraft(){this.checkoutContext=supportIdentity();const key=this.draftStorageKey(),draft=key?wx.getStorageSync(key):null;this.setData({note:draft&&typeof draft.note==='string'?draft.note:'',selectedAddress:null,hasAddress:false,selectedSlotId:'',noteShortcuts:[]})},
  cloudSerial:0,
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
    demoConfirmBusy:false,
    orderSubmitting:false,
    cloudMode: false, cloudBusy: false, cloudError: '',deliveryError:'',selectionNotice:'',cloudAreaName:'', deliveryDate: '', deliveryDateMin: '', deliveryDateMax: '', cloudRules: null as any, cloudAreas: [] as Array<{id:string;name:string}>,
    items: [] as CartDisplayItem[],
    totalText: '0.00',
    totalCount: 0,
    minimumOrderText: '0.00',
    minimumRemainingText: '0.00',
    minimumReached: true,
    selectedAddress: null as SavedAddress | null,
    hasAddress: false,
    slots: [] as Array<{ id: string; label: string; start: string; end: string;displayLabel?:string }>,
    slotIndex: -1,
    selectedSlotId: '',
    selectedSlotText: '',
    note: ''
  ,
    noteShortcuts: [] as Array<{label: string}>,},
  onLoad() {
    this.restoreDraft()
  },
  onShow() {
    this.setData({demoConfirmBusy:false})
    if(this.checkoutContext!==supportIdentity())this.restoreDraft()
    if (cloudCartConfig()) { this.refreshCloudCheckout(); return }
    this.cloudSerial++
    this.setData({cloudMode:false,cloudError:'',cloudBusy:false})
    // MERCHANT_NOTE_TAGS_V1
    const merchantTags = wx.getStorageSync('stall_note_tags_v1')
    this.setData({ noteShortcuts: Array.isArray(merchantTags) ? merchantTags.map((label: string) => ({ label })) : [] })
    const cart = getPurchaseDetails()
    const selected = getSelectedAddress() || null
    const slots = availableSlots(availableAreas().find(a=>a.name===selected?.area)?.id).map(s=>({...s,displayLabel:s.label+' '+s.start+'–'+s.end}))
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
    const serial=++this.cloudSerial,key=supportIdentity()
    const date=this.data.deliveryDate || localDate()
    this.setData({cloudMode:true,cloudBusy:true,cloudError:'',deliveryError:'',selectionNotice:'',cloudAreaName:'',items:[],totalText:'0.00',totalCount:0,cloudRules:null,minimumReached:false,minimumOrderText:'读取中',
      selectedAddress:null,hasAddress:false,noteShortcuts:[],deliveryDate:date,deliveryDateMin:localDate(),deliveryDateMax:localDate(7)})
    try {
      const [{cart,rules,business}]=await Promise.all([loadCloudCheckout(),refreshCloudAddresses()])
      const current=cloudCartConfig();if(serial!==this.cloudSerial||!current||supportIdentity()!==key)return
      const min=localDate(0,rules),max=localDate(7,rules),validDate=date<min||date>max?min:date
      this.setData({items:cart.items,totalText:cart.totalText,totalCount:cart.totalCount,cloudRules:rules,noteShortcuts:(business.noteTags||[]).map(label=>({label})),
        cloudAreas:rules.areas.filter(a=>a.enabled),deliveryDate:validDate,deliveryDateMin:min,deliveryDateMax:max,
        ...minimumDisplay(business.minimumOrderCents,cart.totalText),cloudBusy:false,cloudError:''})
      this.recheckCloudSelection(validDate,this.data.selectedSlotId)
    } catch(e:any){if(serial===this.cloudSerial)this.setData({cloudBusy:false,cloudError:'配送、营业或商品信息加载失败：'+String(e&&e.message||e)})}
  },
  recheckCloudSelection(date:string,preferred='') {
    const cfg=cloudCartConfig(),rules=this.data.cloudRules,address=getSelectedAddress()||null
    if(!cfg||!rules)return
    const key=deliveryStoreKey(cfg),area=address?resolveDeliveryArea(address,rules.areas,key):undefined
    const addressIssue=address?deliveryAddressReason(address,rules.areas,key):'请选择收货地址'
    const policyIssue=cloudDeliveryReason(rules,date,area?.id)
    const issue=policyIssue&&policyIssue!=='请先选择可配送的收货区域'?policyIssue:addressIssue||policyIssue
    // If today's delivery window has passed, automatically select the next deliverable day.
    let nextDate=date
    if(area?.id&&!availableCloudSlots(rules,nextDate,area.id).length){
      for(let offset=1;offset<=7;offset++){
        const candidate=localDate(offset,rules)
        if(candidate<=date||!availableCloudSlots(rules,candidate,area.id).length)continue
        nextDate=candidate;break
      }
    }
    const slots=addressIssue?[]:availableCloudSlots(rules,nextDate,area?.id).map(s=>({...s,displayLabel:s.label+' '+s.start+'–'+s.end})),matched=slots.findIndex(s=>s.id===preferred),index=matched>=0?matched:slots.length?0:-1
    this.setData({selectedAddress:address?{...address,area:area?.name||address.area}:null,hasAddress:!!address,cloudAreaName:area?.name||'',deliveryError:nextDate!==date&&!addressIssue?'':addressIssue&&policyIssue&&addressIssue!==policyIssue?addressIssue+'；'+policyIssue:issue,
      deliveryDate:nextDate,slots,slotIndex:index,selectionNotice:nextDate!==date?'已安排下次可配送时间，可在下方调整。':preferred&&index<0?'原配送时段已暂停、删除或不适用，请重新选择。':'',selectedSlotId:index>=0?slots[index].id:'',selectedSlotText:index>=0?slots[index].label+' '+slots[index].start+'–'+slots[index].end:''})
  },
  chooseDeliveryDate(e:any) {
    const date=String(e.detail.value||''),rules=this.data.cloudRules
    if(!rules||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<localDate(0,rules)||date>localDate(7,rules))return
    this.recheckCloudSelection(date)
  },
  async submitCloudOrder() {
    if(this.data.orderSubmitting)return
    if(this.checkoutContext!==supportIdentity()){this.restoreDraft();await this.refreshCloudCheckout();return}
    if(this.data.cloudBusy||this.data.cloudError||this.data.deliveryError)return
    if(!this.data.minimumReached){wx.showToast({title:'未达到起送金额，请刷新核对',icon:'none'});return}
    const address=getSelectedAddress()
    const rules=this.data.cloudRules
    if(!rules||!rules.accepting){ wx.showToast({title:'店铺暂不接单',icon:'none'}); return }
    if(!address){ wx.showToast({title:'请选择收货地址',icon:'none'}); return }
    const cfg=cloudCartConfig()!
    const area=resolveDeliveryArea(address,rules.areas,deliveryStoreKey(cfg))
    if(!area||deliveryAddressReason(address,rules.areas,deliveryStoreKey(cfg))){wx.showToast({title:'地址区域不可配送，请重新选择',icon:'none'});return}
    const date=this.data.deliveryDate
    if(date<localDate(0,rules)||date>localDate(7,rules)){ wx.showToast({title:'请选择配送日期',icon:'none'}); return }
    const policyIssue=cloudDeliveryReason(rules,date,area.id)
    if(policyIssue){wx.showModal({title:'当前不可配送',content:policyIssue,showCancel:false});return}
    const slots=availableCloudSlots(rules,date,area.id)
    const slot=slots.find(s=>s.id===this.data.selectedSlotId)
    if(!slot){ wx.showToast({title:'请选择有效配送时段',icon:'none'}); return }
    if(!address.receiverName.trim()||!address.phone.trim()||!address.detail.trim()){ wx.showToast({title:'请补全收货地址',icon:'none'}); return }
    if(!this.data.totalCount){ wx.showToast({title:'购物车为空',icon:'none'}); return }
    const submittedContext=supportIdentity();this.setData({cloudBusy:true,orderSubmitting:true})
    try {
      const result=await createCloudOrder({address:{receiverName:address.receiverName,phone:address.phone,areaId:area.id,
        detail:address.detail,latitude:address.latitude,longitude:address.longitude},slot:{id:slot.id,date},note:String(this.data.note||'')})
      if(submittedContext!==supportIdentity())return
      wx.showModal({title:'订单已创建（待支付）',content:'订单号：'+result.orderId+'\n服务端金额：¥'+(Number(result.totalCents)/100).toFixed(2)+(result.inventoryExpiresAt?'\n有限库存预留至：'+formatPublishTime(result.inventoryExpiresAt,'Asia/Shanghai')+' 北京时间（UTC+8），未支付会释放。':'')+'\n尚未扣款，请勿当作付款成功。',showCancel:false,
        success:()=>wx.switchTab({url:'/pages/cart/cart'})})
    }catch(e:any){
      if(submittedContext!==supportIdentity())return
      const message=String(e&&e.message||e)
      const reasons:Record<string,string>={delivery_paused:'商家临时暂停全部配送。',orders_paused:'店铺已暂停接单。',delivery_date_paused:'所选日期暂停配送，请重新选择日期。',delivery_slot_unavailable:'配送时段已变更或不适用当前区域，请重新选择。',outside_delivery_area:'区域已停用、删除或地址超出地图范围，请更换地址。',store_closed:'当前不在店铺营业时间。',delivery_date_unavailable:'该日期不可配送，请重新选择。',delivery_not_configured:'店铺尚未配置有效配送规则。',minimum_order_not_reached:'未达到服务器当前起送金额，请核对购物车。'}
      const key=Object.keys(reasons).find(k=>message.includes(k))
      wx.showModal({title:'云端下单失败',content:key?reasons[key]:/insufficient_stock/.test(message)?'商品库存不足，请返回购物车减少数量或刷新商品列表。':message.slice(0,200),showCancel:false})
      if(key)await this.refreshCloudCheckout()
    }
    finally{this.setData({cloudBusy:false,orderSubmitting:false})}
  },
  onHide(){this.saveDraft();this.cloudSerial++;this.setData({demoConfirmBusy:false});if(cloudCartConfig())this.setData({selectedAddress:null,hasAddress:false,cloudRules:null,cloudBusy:false})},
  onUnload() { this.cloudSerial++;this.setData({demoConfirmBusy:false});this.saveDraft() },
  openAddresses() { wx.navigateTo({ url: '/pages/addresses/addresses' }) },
  tapDeliverySlot(e:any){const index=Number(e.currentTarget.dataset.index);const slot=this.data.slots[index];if(!slot)return;if(this.data.cloudMode){this.recheckCloudSelection(this.data.deliveryDate,slot.id);return}this.setData({slotIndex:index,selectedSlotId:slot.id,selectedSlotText:`${slot.label} ${slot.start}–${slot.end}`})},
  chooseSlot(e: any) {
    const index = Number(e.detail.value)
    if(this.data.cloudMode){this.recheckCloudSelection(this.data.deliveryDate,this.data.slots[index]?.id||'');return}
    const slot = this.data.slots[index]
    if (!slot) return
    this.setData({
      slotIndex: index,
      selectedSlotId: slot.id,
      selectedSlotText: `${slot.label} ${slot.start}–${slot.end}`
    })
  },
  updateNote(e: WechatMiniprogram.Input) { this.setData({ note: e.detail.value }) },
  saveDraft() {if(this.checkoutContext!==supportIdentity())return;const key=this.draftStorageKey();if(key)wx.setStorageSync(key, { note: this.data.note }) },
  localCheckoutDraft() {
    if(cloudCartConfig())return null
    const delivery=loadDelivery(),today=localDate()
    if(delivery.deliveryPaused||(delivery.specialDates||[]).some(d=>d.date===today&&d.paused)){wx.showToast({title:delivery.deliveryPaused?'当前暂停全部配送':'今天暂停配送',icon:'none'});return null}
    // STALL_HOURS_V1: local demo guard. Server must recheck before payment.
    if (!businessState().open) { wx.showToast({title:'当前暂停接单或不在营业时间',icon:'none'}); return null }

    const geoAddress = getSelectedAddress()
    if (geoAddress && !isPointDeliverable(geoAddress.area, geoAddress.latitude, geoAddress.longitude)) {
      wx.showToast({title:'地址不在配送范围内',icon:'none'})
      return null
    }
    const cart = getPurchaseDetails()
    if (!cart.totalCount) { wx.showToast({ title: '购物车为空', icon: 'none' }); return null }
    if(cart.items.some(item=>item.stockInsufficient)){wx.showToast({title:'库存不足，请返回购物车调整数量',icon:'none'});return null}
    const missing = minimumOrderShortfall(cart.totalText)
    if (missing > 0) { wx.showToast({ title: `还差¥${missing.toFixed(2)}达到起送金额`, icon: 'none' }); return null }
    const selected = getSelectedAddress()
    if (!selected) { wx.showToast({ title: '请先选择收货地址', icon: 'none' }); return null }
    if (!selected.receiverName.trim() || !/^1[3-9]\d{9}$/.test(selected.phone.trim()) || !selected.detail.trim()) {
      { wx.showToast({ title: '收货地址信息不完整，请编辑地址', icon: 'none' }); return null }
    }
    if (!availableAreas().some(a => a.name === selected.area)) {
      { wx.showToast({ title: '该地址已不在配送范围内', icon: 'none' }); return null }
    }
    const slot = availableSlots(availableAreas().find(a=>a.name===getSelectedAddress()?.area)?.id).find(s => s.id === this.data.selectedSlotId)
    if (!slot) { wx.showToast({ title: '请选择有效配送时段', icon: 'none' }); return null }
    return {cart,selected,slot}
  },
  confirmOrder() {
    if (cloudCartConfig()) { this.submitCloudOrder(); return }
    if(this.data.demoConfirmBusy)return
    const draft=this.localCheckoutDraft()
    if(!draft)return
    const {cart,selected,slot}=draft,serial=this.cloudSerial,context=supportIdentity()
    const snapshot=JSON.stringify([cart.items.map(i=>[i.productId,i.quantity,i.price]),cart.totalText,selected,slot])
    this.saveDraft()
    this.setData({demoConfirmBusy:true})
    wx.showModal({
      title: '创建待支付演示订单',
      content: `收货人：${selected.receiverName}\n地址：${selected.area} ${selected.detail}\n合计：¥${cart.totalText}\n\n仅保存本地演示订单，不会扣款。`,
      success: result => {
        try {
          if(!result.confirm||serial!==this.cloudSerial||context!==supportIdentity()||cloudCartConfig())return
          const current=this.localCheckoutDraft()
          if(!current){this.onShow();return}
          const {cart:fresh,selected:address,slot:validSlot}=current
          if(snapshot!==JSON.stringify([fresh.items.map(i=>[i.productId,i.quantity,i.price]),fresh.totalText,address,validSlot])){
            wx.showToast({title:'商品价格、数量或配送信息已变化，请重新确认',icon:'none'});this.onShow();return
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
        if (hasDirectPurchase()) clearDirectPurchase(); else {const purchased=new Set(fresh.items.map(x=>x.productId));saveCart(loadCart().filter(x=>!purchased.has(x.productId)))}
          openCreatedDemoOrder(order.id)
        } catch (_) {
          wx.showToast({title:'商品状态已变化，请刷新后重试',icon:'none'})
          this.onShow()
        } finally {
          if(serial===this.cloudSerial)this.setData({demoConfirmBusy:false})
        }
      },
      fail:()=>{if(serial===this.cloudSerial)this.setData({demoConfirmBusy:false})}
    })
  }
})
