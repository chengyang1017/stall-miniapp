import { currentPresentation,refreshPagePresentation } from '../../utils/storePresentation'
import { cloudCartConfig, cloudCartDetails, changeCloudCart, writeCloudCart, syncCloudBadge } from '../../utils/cloudCart' // PHASE33_CLOUD_CART
import { loadStore } from '../../modules/customer/demo/catalog'
import { getMinimumOrder, minimumOrderShortfall } from '../../modules/customer/demo/settings'
import { clearDirectPurchase } from '../../utils/directPurchase'
import { minimumDisplay } from '../../modules/shared/api/business'
import { loadCloudDelivery, cloudDeliveryReason, availableCloudSlots, localDate, CloudDeliveryRules } from '../../utils/cloudCheckout'
import { getSelectedAddress } from '../../utils/addresses'
import { deliveryStoreKey, resolveDeliveryArea, deliveryAddressReason } from '../../modules/customer/api/delivery'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'

import {
  getCartDetails,
  changeQuantity,
  CartDisplayItem
} from '../../utils/cart'

function cloudCartViewKey(): string {
  const cfg = cloudCartConfig()
  return cfg ? JSON.stringify([cfg.apiBase, cfg.storeSlug, supportIdentity()]) : ''
}

Page({
  cloudSerial:0,
  cloudContext: '',
  data: {
    cloudMode: false,
    cloudError: '',
    cloudLoading: false,
    deliveryLoading: false,
    deliveryError: '',
    cloudDeliveryReady: false,
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

  onHide() { this.cloudSerial++; this.cloudContext = '' },
  onUnload() { this.cloudSerial++; this.cloudContext = '' },

  async refreshCloud() {
    const cfg = cloudCartConfig()
    if (!cfg) return
    const serial = ++this.cloudSerial, key = cloudCartViewKey()
    this.cloudContext = key
    const current = () => serial === this.cloudSerial && key === cloudCartViewKey()
    // Clear only the view, never the persisted cart. Unknown prices are not zero prices.
    this.setData({ items: [], totalText: '--', totalCount: 0, cloudMode: true,
      cloudError: '', cloudLoading: true, deliveryLoading: true, deliveryError: '',
      cloudDeliveryReady: false, deliveryInfo: '', minimumReached: false,
      minimumOrderText: '', minimumRemainingText: '' })
    let totalText: string | null = null
    let delivery: CloudDeliveryRules | null = null
    const updateMinimum = () => {
      if (current() && totalText !== null && delivery) {
        this.setData(minimumDisplay(delivery.business.minimumOrderCents, totalText))
      }
    }
    // Each branch owns its errors: delivery configuration must not hide priced items.
    await Promise.all([
      (async () => {
        try {
          const result = await cloudCartDetails(cfg)
          if (!current()) return
          totalText = result.totalText
          this.setData({ items: result.items, totalText: result.totalText,
            totalCount: result.totalCount, cloudLoading: false })
          updateMinimum()
          syncCloudBadge(cfg.storeSlug)
        } catch (_) {
          if (current()) this.setData({ cloudLoading: false, minimumReached: false,
            cloudError: '云端商品读取失败，请稍后重试；购物车已保留' })
        }
      })(),
      (async () => {
        try {
          const rules = await loadCloudDelivery(cfg)
          if (!current()) return
          if (!Number.isSafeInteger(rules.business.minimumOrderCents) || rules.business.minimumOrderCents < 0) {
            throw new Error('invalid_delivery_minimum')
          }
          const address = getSelectedAddress(), storeKey = deliveryStoreKey(cfg)
          const area = address ? resolveDeliveryArea(address, rules.areas, storeKey) : undefined
          const issue = address ? deliveryAddressReason(address, rules.areas, storeKey) : '请在结算时选择配送地址'
          const todaySlots = area ? availableCloudSlots(rules, localDate(0, rules), area.id) : []
          const reason = cloudDeliveryReason(rules)
          delivery = rules
          this.setData({ deliveryLoading: false, deliveryError: reason, cloudDeliveryReady: !reason,
            deliveryInfo: issue || ('配送区域：' + area!.name + '；' + (todaySlots.length ? '今日可用：' + todaySlots.map(s => s.label + ' ' + s.start + '–' + s.end).join('、') : '今日无有效时段，可在结算页选择其他日期')) })
          updateMinimum()
        } catch (error) {
          if (current()) this.setData({ deliveryLoading: false, cloudDeliveryReady: false,
            deliveryError: error instanceof Error && error.message === '当前尚未配置云端配送规则，暂不支持下单'
              ? error.message : '云端配送规则读取失败，请稍后重试，暂不支持下单' })
        }
      })()
    ])
  },

  refresh() {
    if (cloudCartConfig()) { this.refreshCloud(); return }
    this.cloudContext = ''
    this.setData({ cloudMode: false, cloudError: '', deliveryInfo: '', cloudLoading: false,
      deliveryLoading: false, deliveryError: '', cloudDeliveryReady: false })
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
      if (this.cloudContext !== cloudCartViewKey()) {
        this.refresh(); wx.showToast({title:'账号或店铺已变化，请重新确认购物车',icon:'none'}); return
      }
      if (this.data.cloudError || this.data.deliveryError) {
        wx.showToast({title:this.data.cloudError || this.data.deliveryError,icon:'none'}); return
      }
      if(!this.data.minimumReached){wx.showToast({title:'未达到起送金额，请刷新核对',icon:'none'});return}
      if(this.data.cloudError || this.data.totalCount === 0){ wx.showToast({title:'请先加载购物车',icon:'none'}); return }
      if (this.data.cloudLoading || this.data.deliveryLoading || !this.data.cloudDeliveryReady) {
        wx.showToast({title:'请等待商品和配送规则加载完成',icon:'none'}); return
      }
      { wx.navigateTo({url:'/pages/checkout/checkout'}); return }
    }
    if (this.data.cloudMode) {
      this.refresh(); wx.showToast({title:'店铺模式已变化，请重新确认购物车',icon:'none'}); return
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
