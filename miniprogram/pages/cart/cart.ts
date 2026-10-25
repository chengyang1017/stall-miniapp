import { currentPresentation,refreshPagePresentation } from '../../utils/storePresentation'
import { cloudCartConfig, cloudCartDetails, changeCloudCart, writeCloudCart, syncCloudBadge } from '../../utils/cloudCart' // PHASE33_CLOUD_CART
import { loadStore } from '../../utils/store'
import { getMinimumOrder, minimumOrderShortfall } from '../../utils/minimumOrder'
import { clearDirectPurchase } from '../../utils/directPurchase'
import { minimumDisplay } from '../../utils/businessCloud'
import { loadCloudDelivery, cloudDeliveryReason, availableCloudSlots, localDate } from '../../utils/cloudCheckout'
import { getSelectedAddress } from '../../utils/addresses'
import { deliveryStoreKey, resolveDeliveryArea, deliveryAddressReason } from '../../utils/cloudDelivery'
import { supportIdentity } from '../../utils/supportCloud'

import {
  getCartDetails,
  changeQuantity,
  CartDisplayItem
} from '../../utils/cart'

Page({
  cloudSerial:0,
  data: {
    cloudMode: false,
    cloudError: '',
    deliveryInfo:'',
    // UNIFIED_PLACEHOLDER_THUMB_V1
    placeholderStyle: 'premium',
    customPlaceholderUrl: '',
    items: [] as CartDisplayItem[],
    totalText: '0.00',
    totalCount: 0,
    minimumOrderText: '0.00',
    minimumRemainingText: '0.00',
    minimumReached: true
  },

  onShow() { refreshPagePresentation(this);
    this.setData({ placeholderStyle: currentPresentation().placeholderStyle, customPlaceholderUrl: currentPresentation().customPlaceholderUrl })

    this.refresh()
  },

  async refreshCloud() {
    const cfg = cloudCartConfig()
    if (!cfg) return
    const serial=++this.cloudSerial,key=supportIdentity()
    // Avoid displaying stale local items while remote catalog loads.
    this.setData({ items: [], totalText: '0.00', totalCount: 0, cloudMode: true, cloudError: '',deliveryInfo:'',minimumReached:false,minimumOrderText:'读取中' })
    try {
      const [result,rules] = await Promise.all([cloudCartDetails(cfg),loadCloudDelivery(cfg)])
      const current=cloudCartConfig();if(serial!==this.cloudSerial||!current||supportIdentity()!==key)return
      const address=getSelectedAddress(),storeKey=deliveryStoreKey(cfg),area=address?resolveDeliveryArea(address,rules.areas,storeKey):undefined
      const issue=address?deliveryAddressReason(address,rules.areas,storeKey):'请在结算时选择配送地址'
      const todaySlots=area?availableCloudSlots(rules,localDate(0,rules),area.id):[]
      this.setData({ items: result.items, totalText: result.totalText, totalCount: result.totalCount,...minimumDisplay(rules.business.minimumOrderCents,result.totalText),cloudError:cloudDeliveryReason(rules),
        deliveryInfo:issue||('配送区域：'+area!.name+'；'+(todaySlots.length?'今日可用：'+todaySlots.map(s=>s.label+' '+s.start+'–'+s.end).join('、'):'今日无有效时段，可在结算页选择其他日期')) })
      syncCloudBadge(cfg.storeSlug)
    } catch (_) { if(serial===this.cloudSerial&&key===supportIdentity())this.setData({ items: [], totalText: '0.00', totalCount: 0, minimumReached:false,deliveryInfo:'',cloudError: '云端商品或配送规则读取失败，请稍后再试；未配置配送时暂不支持下单' }) }
  },

  refresh() {
    if (cloudCartConfig()) { this.refreshCloud(); return }
    this.setData({ cloudMode: false, cloudError: '',deliveryInfo:'' })
    this.cloudSerial++
    const cart = getCartDetails()
    // CART_THUMB_AND_FOOTER_V1
    const productImages = loadStore().products
    const displayItems = cart.items.map((item) => {
      const product = productImages.find((p) => p.id === item.productId)
      return { ...item, imageUrl: (product && (product as any).imageUrl) || '' }
    })

    this.setData({
      items: displayItems,
      totalText: cart.totalText,
      totalCount: cart.totalCount,
      minimumOrderText: getMinimumOrder().toFixed(2),
      minimumRemainingText: minimumOrderShortfall(cart.totalText).toFixed(2),
      minimumReached: minimumOrderShortfall(cart.totalText) === 0
    })
  },

  async increase(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    const cfg = cloudCartConfig()
    if (cfg) { await changeCloudCart(cfg.storeSlug, id, 1); this.refresh(); return }
    changeQuantity(id, 1)
    this.refresh()
  },

  async decrease(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    const cfg = cloudCartConfig()
    if (cfg) { await changeCloudCart(cfg.storeSlug, id, -1); this.refresh(); return }
    changeQuantity(id, -1)
    this.refresh()
  },

  // CART_CLEAR_V1
  clearCartConfirmed() {
    if (!this.data.totalCount) return
    wx.showModal({
      title: '\u6e05\u7a7a\u8d2d\u7269\u8f66',
      content: '\u786e\u5b9a\u79fb\u9664\u8d2d\u7269\u8f66\u4e2d\u7684\u5168\u90e8\u5546\u54c1\u5417\uff1f',
      confirmColor: '#d84b47',
      success: (result) => {
        if (!result.confirm) return
        const cfg = cloudCartConfig()
        if (cfg) writeCloudCart(cfg.storeSlug, [])
        else wx.removeStorageSync('stall_cart_v1')
        this.refresh()
        try { wx.removeTabBarBadge({ index: 1 }) } catch (_) { /* tab bar not ready */ }
        wx.showToast({ title: '\u5df2\u6e05\u7a7a', icon: 'success' })
      }
    })
  },
  checkout() {
    if (cloudCartConfig()) {
      if(!this.data.minimumReached){wx.showToast({title:'未达到起送金额，请刷新核对',icon:'none'});return}
      if(this.data.cloudError || this.data.totalCount === 0){ wx.showToast({title:'请先加载购物车',icon:'none'}); return }
      { wx.navigateTo({url:'/pages/checkout/checkout'}); return }
    }
    clearDirectPurchase()
    clearDirectPurchase()
    const current = getCartDetails()
    const missing = minimumOrderShortfall(current.totalText)
    if (current.totalCount && missing > 0) {
      wx.showToast({ title: `还差¥${missing.toFixed(2)}达到起送金额`, icon: 'none' })
      return
    }
    if (this.data.totalCount === 0) {
      wx.showToast({
        title: '购物车为空',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: '/pages/checkout/checkout'
    })
  }
})
