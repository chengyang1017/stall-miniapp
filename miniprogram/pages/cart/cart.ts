import { excludedCartIds,setExcludedCartIds,selectedCartDetails } from '../../modules/customer/domain/cartSelection'
import { cloudCacheSuffix } from '../../utils/cloudCart'
import { stableRowsPatch } from '../../modules/shared/runtime/stableRows'
import { prepareUiTrace,hideUiTrace,traceUi } from '../../modules/shared/runtime/uiTrace'
import { currentPresentation,refreshPagePresentation,invalidatePagePresentation } from '../../utils/storePresentation'
import { cloudCartConfig, readCloudCart, cloudCartDetails, confirmCloudCartQuantities, writeCloudCart, syncCloudBadge } from '../../utils/cloudCart' // PHASE33_CLOUD_CART
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
  cloudSerial:0,catalogSerial:0,mutationEpoch:0,quantityVersion:0,cartMutating:false,disposed:false,desiredQuantities:{} as Record<string,number>,cloudRules:null as CloudDeliveryRules|null,
  cloudContext: '',
  data: {
    selectionMap:{} as Record<string,boolean>,selectedCount:0,selectedTotalText:"0.00",selectedConfirmedTotalText:"",selectedMinimumReached:false,allSelected:true,orderNote:"",uiTraceEnabled:false,quantityPending:false,quantityError:'',amountState:'confirmed',
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
    confirmedTotalText: '', // Display only; never used to approve checkout while current quote is pending.
    totalCount: 0,
    minimumOrderText: '0.00',
    minimumRemainingText: '0.00',
    minimumReached: true
  },

  onShow() {this.restoreCartNote(); prepareUiTrace(this,'cart',cloudCartViewKey);this.disposed=false;refreshPagePresentation(this);
    this.setData({ placeholderStyle: currentPresentation().placeholderStyle, customPlaceholderUrl: currentPresentation().customPlaceholderUrl })

    this.refresh()
  },

  onHide() { hideUiTrace(this,'onHide');invalidatePagePresentation(this);this.cloudSerial++ },
  onUnload() { hideUiTrace(this,'onUnload');invalidatePagePresentation(this);this.cloudSerial++;this.disposed=true;this.mutationEpoch++ },

  async refreshCloud() {
    traceUi(this,'cart.refresh.begin')
    const cfg = cloudCartConfig()
    if (!cfg) return
    const serial = ++this.cloudSerial, key = cloudCartViewKey()
    const changed=this.cloudContext!==key,version=this.quantityVersion,catalog=++this.catalogSerial
    if(changed){traceUi(this,'cart.context.reset');this.mutationEpoch++;this.cartMutating=false;this.desiredQuantities={};this.cloudRules=null;this.setData({items:[],selectionMap:{},selectedCount:0,selectedTotalText:'0.00',selectedConfirmedTotalText:'',selectedMinimumReached:false,totalText:'--',confirmedTotalText:'',totalCount:0,quantityPending:false,quantityError:'',amountState:'checking',deliveryInfo:'',minimumOrderText:'',minimumRemainingText:''})}
    this.cloudContext = key
    const current = () => !this.disposed&&serial === this.cloudSerial && key === cloudCartViewKey()
    this.setData({cloudMode:true,cloudError:'',cloudLoading:true,deliveryLoading:true,deliveryError:'',cloudDeliveryReady:false,minimumReached:false})
    let delivery: CloudDeliveryRules | null = null
    const updateMinimum = () => {
      if (current() && !this.data.quantityPending && this.data.amountState==='confirmed' && delivery) {
        this.setData(minimumDisplay(delivery.business.minimumOrderCents, this.data.totalText));this.refreshSelection()
      }
    }
    // Each branch owns its errors: delivery configuration must not hide priced items.
    await Promise.all([
      (async () => {
        try {
          const result = await cloudCartDetails(cfg)
          if (!current()||catalog!==this.catalogSerial||version!==this.quantityVersion||this.cartMutating){traceUi(this,'cart.catalog.discard');return}
          traceUi(this,'cart.catalog.confirm',{rows:result.items.length})
          this.updateCartFields({ ...stableRowsPatch('items',this.data.items,result.items,'productId'), totalText: result.totalText,confirmedTotalText:result.totalText,
            totalCount: result.totalCount, cloudLoading: false,amountState:'confirmed',quantityError:'' })
          updateMinimum()
          syncCloudBadge(cfg.storeSlug)
        } catch (error) {
          if(current()&&catalog===this.catalogSerial&&version===this.quantityVersion&&!this.cartMutating&&/http_40[13]/.test(String(error)))this.setData({items:[],selectionMap:{},selectedCount:0,selectedTotalText:'0.00',selectedMinimumReached:false,totalCount:0,totalText:'--',confirmedTotalText:''})
          if (current()&&catalog===this.catalogSerial&&version===this.quantityVersion&&!this.cartMutating) this.setData({ cloudLoading: false, minimumReached: false,
            amountState:'stale',cloudError: '云端商品读取失败，请稍后重试；已有内容可能过期，购物车已保留' })
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
          delivery = rules;this.cloudRules=rules
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
    traceUi(this,'cart.refresh')
    if (cloudCartConfig()) { this.refreshCloud(); return }
    this.cloudContext = '';this.mutationEpoch++;this.cartMutating=false;this.desiredQuantities={};this.cloudRules=null
    this.setData({quantityPending:false,quantityError:'',amountState:'confirmed', cloudMode: false, cloudError: '', deliveryInfo: '', cloudLoading: false,
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
      ...stableRowsPatch('items',this.data.items,displayItems,'productId'),
      totalText: cart.totalText,
      confirmedTotalText: cart.totalText,
      totalCount: cart.totalCount,
      minimumOrderText: getMinimumOrder().toFixed(2),
      minimumRemainingText: minimumOrderShortfall(cart.totalText).toFixed(2),
      minimumReached: minimumOrderShortfall(cart.totalText) === 0
    });this.refreshSelection()
  },

  async increase(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    const cfg = cloudCartConfig()
    if (cfg) { await this.queueCloudQuantity(id,1); return }
    changeQuantity(id, 1)
    this.refresh()
  },

  updateCartFields(patch:Record<string,any>){
    const changed:Record<string,any>={}
    for(const key of Object.keys(patch))if(key.includes('[')||this.data[key as keyof typeof this.data]!==patch[key])changed[key]=patch[key]
    if(Object.keys(changed).length)this.setData(changed);this.refreshSelection()
  },

  async decrease(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    const cfg = cloudCartConfig()
    if (cfg) { await this.queueCloudQuantity(id,-1); return }
    changeQuantity(id, -1)
    this.refresh()
  },

  async queueCloudQuantity(id:string,delta:number){
    traceUi(this,'cart.quantity.intent',{delta})
    const cfg=cloudCartConfig(),key=cloudCartViewKey()
    if(!cfg||this.cloudContext!==key){this.refresh();return}
    const index=this.data.items.findIndex(item=>item.productId===id),item=this.data.items[index] as any
    if(index<0)return
    const next=Math.max(0,Math.min(99,item.quantity+delta))
    if(next===item.quantity)return
    if(delta>0&&item.stockLimit!==null&&item.stockLimit!==undefined&&next>item.stockLimit){this.setData({quantityError:'库存不足，请减少数量'});return}
    this.desiredQuantities[id]=next;this.quantityVersion++
    const count=this.data.items.reduce((n,row,i)=>n+(i===index?next:row.quantity),0)
    this.updateCartFields({['items['+index+'].quantity']:next,['items['+index+'].subtotalText']:'--',totalCount:count,totalText:'--',confirmedTotalText:this.data.confirmedTotalText||(this.data.amountState==='confirmed'?this.data.totalText:''),amountState:'checking',quantityPending:true,quantityError:'',minimumReached:false})
    if(this.cartMutating)return
    this.cartMutating=true;const epoch=this.mutationEpoch
    const current=()=>!this.disposed&&epoch===this.mutationEpoch&&key===cloudCartViewKey()
    let error=''
    try{
      while(current()){
        const confirmation=await confirmCloudCartQuantities(cfg,()=>current()?{quantities:{...this.desiredQuantities},version:this.quantityVersion}:null)
        if(!current()){traceUi(this,'cart.quantity.discard');return}
        if(confirmation.version!==this.quantityVersion)continue
        const result=confirmation.result
        if(confirmation.rejected.length)error='数量未通过库存校验，已恢复实际购物车数量'
        traceUi(this,'cart.quantity.confirmed',{rejected:confirmation.rejected.length})
        this.desiredQuantities={};this.catalogSerial++
        this.updateCartFields({...stableRowsPatch('items',this.data.items,result.items,'productId'),totalCount:result.totalCount,totalText:result.totalText,confirmedTotalText:result.totalText,amountState:'confirmed',cloudError:'',cloudLoading:false,quantityPending:false,quantityError:error,...this.cloudRules?minimumDisplay(this.cloudRules.business.minimumOrderCents,result.totalText):{minimumReached:false}})
        return
      }
    }catch(error){if(current()){
      this.catalogSerial++
      const denied=/http_40[13]/.test(String(error))
      const actual=readCloudCart(cfg.storeSlug),items=this.data.items.map(item=>({...item,quantity:actual.find(row=>row.productId===item.productId)?.quantity||0,subtotalText:'--'}))
      this.updateCartFields({...stableRowsPatch('items',this.data.items,denied?[]:items,'productId'),totalCount:denied?0:items.reduce((n,row)=>n+row.quantity,0),quantityPending:false,totalText:'--',confirmedTotalText:denied?'':this.data.confirmedTotalText,amountState:'stale',cloudLoading:false,minimumReached:false,cloudError:'商品价格或数量未能确认，请刷新重试；购物车内容已保留'})
    }}finally{if(current())this.cartMutating=false}
  },

  refreshSelection(){
    const excluded=new Set(excludedCartIds()),selectionMap:Record<string,boolean>={};let cents=0,count=0
    for(const item of this.data.items){selectionMap[item.productId]=!excluded.has(item.productId);if(selectionMap[item.productId]){cents+=Math.round(item.price*100)*item.quantity;count+=item.quantity}}
    const patch:Record<string,any>={selectedCount:count,selectedTotalText:(cents/100).toFixed(2),selectedMinimumReached:cents>=Math.round(Number(this.data.minimumOrderText||0)*100),allSelected:this.data.items.length>0&&this.data.items.every(x=>selectionMap[x.productId])}
    if(this.data.amountState==='confirmed'&&!this.data.quantityPending)patch.selectedConfirmedTotalText=(cents/100).toFixed(2)
    else if(!this.data.items.length)patch.selectedConfirmedTotalText=''
    if(JSON.stringify(selectionMap)!==JSON.stringify(this.data.selectionMap))patch.selectionMap=selectionMap
    const changed:Record<string,any>={};for(const key of Object.keys(patch))if(this.data[key as keyof typeof this.data]!==patch[key])changed[key]=patch[key]
    if(Object.keys(changed).length)this.setData(changed)
  },
  toggleSelection(e:any){if(this.data.quantityPending)return;const id=String(e.currentTarget.dataset.id),excluded=excludedCartIds();setExcludedCartIds(excluded.includes(id)?excluded.filter(x=>x!==id):excluded.concat(id));this.refreshSelection()},
  toggleAll(){if(this.data.quantityPending)return;setExcludedCartIds(this.data.allSelected?this.data.items.map(x=>x.productId):[]);this.refreshSelection()},
  async removeItem(e:any){if(this.data.quantityPending)return;const id=String(e.currentTarget.dataset.id),item=this.data.items.find(x=>x.productId===id);if(!item)return;const context=cloudCartViewKey();wx.showModal({title:'移除商品',content:'确定从购物车移除这件商品？',success:r=>{if(!r.confirm||context!==cloudCartViewKey())return;const cfg=cloudCartConfig();if(cfg)this.queueCloudQuantity(id,-item.quantity);else{changeQuantity(id,-item.quantity);this.refresh()}}})},
  noteKey(){const cfg=cloudCartConfig();return 'stall_checkout_draft_v1:'+(cfg?cloudCacheSuffix(cfg.storeSlug):'demo')},
  restoreCartNote(){const draft=wx.getStorageSync(this.noteKey());this.setData({orderNote:typeof draft?.note==='string'?draft.note:''});this.refreshSelection()},
  updateCartNote(e:any){this.setData({orderNote:String(e.detail.value).slice(0,200)});wx.setStorageSync(this.noteKey(),{note:this.data.orderNote})},
  couponInfo(){wx.showToast({title:'优惠券服务暂未开通',icon:'none'})},
  // CART_CLEAR_V1
  clearCartConfirmed() {
    if (!this.data.totalCount||this.data.quantityPending||this.data.cloudLoading) return
    const context=cloudCartViewKey()
    wx.showModal({
      title: '\u6e05\u7a7a\u8d2d\u7269\u8f66',
      content: '\u786e\u5b9a\u79fb\u9664\u8d2d\u7269\u8f66\u4e2d\u7684\u5168\u90e8\u5546\u54c1\u5417\uff1f',
      confirmColor: '#d84b47',
      success: (result) => {
        if (!result.confirm) return
        if(context!==cloudCartViewKey()){this.refresh();return}
        const cfg = cloudCartConfig()
        if (cfg) writeCloudCart(cfg.storeSlug, [])
        else wx.removeStorageSync('stall_cart_v1')
        this.refresh()
        try { wx.removeTabBarBadge({ index: 2 }) } catch (_) { /* tab bar not ready */ }
        wx.showToast({ title: '\u5df2\u6e05\u7a7a', icon: 'success' })
      }
    })
  },
  checkout() {
    this.refreshSelection();if(!this.data.selectedCount||!this.data.selectedMinimumReached){wx.showToast({title:"请选择商品并满足起送金额",icon:"none"});return}

    if (cloudCartConfig()) {
      if(this.data.quantityPending||this.data.amountState!=='confirmed'||this.data.items.some((item:any)=>item.stockInsufficient&&this.data.selectionMap[item.productId]!==false)){wx.showToast({title:'请等待数量和金额确认或减少缺货商品',icon:'none'});return}
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
    const current = selectedCartDetails(getCartDetails())
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
