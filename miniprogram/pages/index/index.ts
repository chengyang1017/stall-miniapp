import { openMerchantWorkspace,CAN_OPEN_MERCHANT } from '../../modules/integration/singleAppHost'
import { PUBLIC_API_BASE } from '../../config/cloud'
import { captureStoreEntry,resolveStoreEntry,shopShare } from '../../utils/storeEntry'
import { currentPresentation,refreshPagePresentation } from '../../utils/storePresentation'
import { cloudCartConfig, changeCloudCart, cloudCartDetails, syncCloudBadge } from '../../utils/cloudCart' // PHASE33_CLOUD_CART
import { businessState } from '../../modules/customer/demo/settings' // STALL_HOURS_V1
import { getRemoteProductPage } from '../../utils/remoteApi'
import { publicBusiness } from '../../modules/shared/api/business'
import { loadCloudDelivery } from '../../utils/cloudCheckout'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'
import { authorizedGet } from '../../modules/shared/runtime/auth'

import {
  loadStore,
  effectivePrice,
  productIsPublished,
  stockAllows,
  money
} from '../../modules/customer/demo/catalog'

import {
  addToCart,
  getCartDetails
} from '../../utils/cart'

interface ProductView {
  inventoryText?:string
  id: string
  name: string
  imageUrl?: string
  original: string
  current: string
  discounted: boolean
  available: boolean
}

Page({
  cloudSerial:0,cloudContext:'',pageVisible:false,merchantRouteSerial:0,

  data: {
    canOpenMerchant:CAN_OPEN_MERCHANT,
    storeName:'小摊商店',shareReady:false,entryLoading:false,entryError:'',dealRows:[] as any[],dealCursor:'',dealsHasMore:false,dealBusy:false,dealError:'',
    placeholderStyle: 'premium',
    customPlaceholderUrl: '',
    categories: [] as Array<{
      id: string
      name: string
    }>,

    selectedCategory: 'all',searchInput:'',searchQuery:'',nextCursor:'',hasMore:false,

    products: [] as ProductView[],
    discountedProducts: [] as ProductView[],
    cloudVisible: false, cloudBusy: false, cloudStatus: '', cloudConnectionError:false,
    cloudProducts: [] as Array<{ id: string; name: string; priceText: string; soldOut: boolean; imageUrl: string }>,
    cloudMode: false, remoteRows: [] as Array<any>,
    deliverySummary:'',

    cartCount: 0,
    cartTotal: '0.00'
  },

  onLoad(options:Record<string,string|undefined>){captureStoreEntry(options)},
  onShareAppMessage(){return shopShare(this.data.storeName)},
  retryStoreEntry(){this.onShow()},
  async onShow() {
    this.pageVisible=true
    const serial=++this.cloudSerial
    this.setData({entryLoading:true,entryError:'',cloudConnectionError:false})
    try{await resolveStoreEntry()}catch(e){if(serial===this.cloudSerial)this.setData({entryError:'暂时无法连接商店，请检查网络连接后重试。',entryLoading:false,storeName:'店铺入口未确认',cartCount:0,cartTotal:'0.00',businessInfo:{open:false,label:'尚未确认当前店铺',notice:''},hasMore:false,dealsHasMore:false,products:[],discountedProducts:[],remoteRows:[],dealRows:[],categories:[],cloudMode:true,cloudBusy:false,cloudConnectionError:true,deliverySummary:''});return}
    if(!this.pageVisible||serial!==this.cloudSerial)return
    // Resume merchant workspace only after server authorization, never from a cached role alone.
    const merchantCfg=cloudCartConfig()
    const merchantPreference=wx.getStorageSync('stall_merchant_home_preference_v1')
    const merchantIdentity=supportIdentity()
    if(CAN_OPEN_MERCHANT && merchantCfg && merchantPreference===merchantCfg.apiBase+'|'+merchantCfg.storeSlug){
      const merchantSerial=++this.merchantRouteSerial
      try{
        const result=await authorizedGet(merchantCfg.apiBase,'/v1/merchant/stores/'+merchantCfg.storeSlug+'/categories')
        if(!this.pageVisible||serial!==this.cloudSerial||merchantSerial!==this.merchantRouteSerial)return
        // An in-flight authorization must not override a switch to customer mode,
        // a logout, a session replacement, or a store change.
        const currentCfg=cloudCartConfig()
        const stillMerchant=wx.getStorageSync('stall_merchant_home_preference_v1')===merchantPreference
        if(result&&Array.isArray(result.items)&&stillMerchant&&merchantIdentity===supportIdentity()&&currentCfg&&
           currentCfg.apiBase===merchantCfg.apiBase&&currentCfg.storeSlug===merchantCfg.storeSlug){
          this.setData({entryLoading:false})
          openMerchantWorkspace()
          return
        }
      }catch(e){
        // Clear only the SAME stale preference; do not overwrite a later mode change.
        if(/http_40[13]|not_logged_in/.test(String(e))&&
           wx.getStorageSync('stall_merchant_home_preference_v1')===merchantPreference&&
           merchantIdentity===supportIdentity())wx.removeStorageSync('stall_merchant_home_preference_v1')
      }
    }
    if(!this.pageVisible||serial!==this.cloudSerial)return
    this.setData({entryLoading:false});refreshPagePresentation(this);
    const cfg = cloudCartConfig()
    const shareReady=!!cfg&&/^https:\/\//.test(PUBLIC_API_BASE)&&PUBLIC_API_BASE.replace(/\/+$/,'')===cfg.apiBase
    this.setData({shareReady})
    if(shareReady)wx.showShareMenu({menus:['shareAppMessage']});else wx.hideShareMenu({menus:['shareAppMessage']})
    const context=supportIdentity()
    if(context!==this.cloudContext){this.cloudContext=context;this.setData({selectedCategory:'all',searchInput:'',searchQuery:'',remoteRows:[],dealRows:[],dealCursor:'',dealsHasMore:false,products:[],discountedProducts:[],categories:[],nextCursor:'',hasMore:false})}
    if (cfg && cfg.apiBase && cfg.storeSlug) this.loadCloudHome()
    else { this.cloudSerial++;this.setData({ cloudMode: false,cloudConnectionError:false,storeName:'小摊商店',deliverySummary:'' }); this.refresh() }
  },

  onHide(){this.pageVisible=false;this.cloudSerial++;this.setData({cloudBusy:false,dealBusy:false})},
  onUnload(){this.pageVisible=false;this.cloudSerial++},
  onPullDownRefresh(){Promise.resolve(cloudCartConfig()?this.loadCloudHome():this.refresh()).finally(()=>wx.stopPullDownRefresh())},
  onReachBottom(){this.loadMoreProducts()},
  async loadMoreDeals(){
    const cfg=cloudCartConfig()
    if(!cfg||this.data.dealBusy||this.data.cloudBusy||!this.data.dealsHasMore||!this.data.dealCursor)return
    const serial=this.cloudSerial,context=supportIdentity();this.setData({dealBusy:true,dealError:''})
    try{
      const page=await getRemoteProductPage(cfg.apiBase,cfg.storeSlug,{discount:'1',cursor:this.data.dealCursor})
      if(serial!==this.cloudSerial||context!==supportIdentity())return
      const seen=new Set(this.data.dealRows.map(p=>p.id))
      this.setData({dealRows:this.data.dealRows.concat(page.products.filter(p=>!seen.has(p.id))),dealsHasMore:page.hasMore,dealCursor:page.nextCursor||''});this.renderCloudProducts()
    }catch(_){if(serial===this.cloudSerial)this.setData({dealError:'优惠商品续页失败，请重试'})}finally{if(serial===this.cloudSerial)this.setData({dealBusy:false})}
  },
  inputSearch(e:any){this.setData({searchInput:String(e.detail.value||'')})},
  searchProducts(){this.setData({searchQuery:this.data.searchInput.trim().slice(0,100)});if(cloudCartConfig())this.loadCloudHome();else this.refresh()},
  clearSearch(){this.setData({searchInput:'',searchQuery:''});if(cloudCartConfig())this.loadCloudHome();else this.refresh()},
  async loadMoreProducts(){
    const cfg=cloudCartConfig()
    if(!cfg||this.data.cloudBusy||!this.data.hasMore||!this.data.nextCursor)return
    const serial=this.cloudSerial,context=supportIdentity(),cursor=this.data.nextCursor
    this.setData({cloudBusy:true,cloudStatus:''})
    try{
      const page=await getRemoteProductPage(cfg.apiBase,cfg.storeSlug,{...this.data.searchQuery?{q:this.data.searchQuery}:{},...this.data.selectedCategory!=='all'?{category:this.data.selectedCategory}:{},cursor})
      if(serial!==this.cloudSerial||context!==supportIdentity())return
      const seen=new Set(this.data.remoteRows.map(p=>p.id)),rows=this.data.remoteRows.concat(page.products.filter(p=>!seen.has(p.id)))
      this.setData({remoteRows:rows,hasMore:page.hasMore,nextCursor:page.nextCursor||'',cloudBusy:false})
      this.renderCloudProducts()
    }catch(_){if(serial===this.cloudSerial&&context===supportIdentity())this.setData({cloudBusy:false,cloudStatus:'加载更多失败，已保留现有商品，可再次加载更多'})}
  },

  refresh() {
    if (this.data.cloudMode) { this.renderCloudProducts(); return }
    this.setData({businessInfo:businessState()});
    const store = loadStore()

    const allProducts: ProductView[] =
      store.products.filter(p=>productIsPublished(p)).map(p => {
        const current = effectivePrice(p)

        return {
          id: p.id,
          name: p.name,
          imageUrl: p.imageUrl || '',
          original: money(p.price),
          current: money(current),
          discounted: current < p.price,
          available: productIsPublished(p) && !p.soldOut && stockAllows(p),
          inventoryText:(p.soldOut?'商家手动售罄 · ':'')+(p.stockMode==='finite'?(stockAllows(p)?`库存 ${p.stockQuantity} 件`:'缺货（库存为零）'):'不限库存')
        }
      })

    const selected = this.data.selectedCategory

    const products = allProducts.filter(p => {
      const original = store.products.find(
        item => item.id === p.id
      )

      return (selected === 'all' || (original && original.categoryId === selected)) && (!this.data.searchQuery||p.name.toLowerCase().includes(this.data.searchQuery.toLowerCase()))
    })

    const discountedProducts = allProducts.filter(
      p => p.discounted && p.available
    )

    const cart = getCartDetails()

    this.setData({
      placeholderStyle: currentPresentation().placeholderStyle,
      customPlaceholderUrl: currentPresentation().customPlaceholderUrl,
      categories: store.categories,
      products,
      discountedProducts,
      cartCount: cart.totalCount,
      cartTotal: cart.totalText
    })
  },

  // Cloud catalog and business settings never fall back to demo data.
  async loadCloudHome() {
    const cfg = cloudCartConfig()
    if (this.data.entryError || !cfg || !cfg.apiBase || !cfg.storeSlug) return
    const serial=++this.cloudSerial,key=supportIdentity()
    this.setData({ cloudMode: true, cloudBusy: true, cloudConnectionError:false, cloudStatus: '正在加载云端商品',deliverySummary:'',
      businessInfo: {open:false,label:'正在读取云端营业状态',notice:''}, products: [], discountedProducts: [], categories: [],
      dealRows:[],dealCursor:'',dealsHasMore:false,dealBusy:false,dealError:'',remoteRows:[],nextCursor:'',hasMore:false,cartCount: 0, cartTotal: '0.00' })
    try {
      const requestCfg={apiBase:String(cfg.apiBase).trim(),storeSlug:String(cfg.storeSlug).trim()}
      const [page,business,rules,deals] = await Promise.all([getRemoteProductPage(requestCfg.apiBase,requestCfg.storeSlug,{...this.data.searchQuery?{q:this.data.searchQuery}:{},...this.data.selectedCategory!=='all'?{category:this.data.selectedCategory}:{}}),publicBusiness(requestCfg),loadCloudDelivery(requestCfg).catch(()=>null),getRemoteProductPage(requestCfg.apiBase,requestCfg.storeSlug,{discount:'1'})])
      const current=cloudCartConfig();if(serial!==this.cloudSerial||!current||supportIdentity()!==key)return
      const areas=rules?rules.areas.filter(a=>a.enabled):[]
      this.setData({ storeName:business.storeName||'店铺',dealRows:deals.products,dealCursor:deals.nextCursor||'',dealsHasMore:deals.hasMore,remoteRows: page.products,categories:page.categories,hasMore:page.hasMore,nextCursor:page.nextCursor||'', businessInfo:business,cloudStatus: '', cloudBusy: false, cloudConnectionError:false,
        deliverySummary:rules?('启用配送区域 '+areas.length+' 个：'+areas.slice(0,3).map(a=>a.name).join('、')+(areas.length>3?' 等':'')+'；时段在结算时按区域、星期和日期核对'):'配送规则未配置或暂不可读取，当前不能确认配送，请进入结算重新核对' })
      this.renderCloudProducts()
    } catch (_) {
      if(serial!==this.cloudSerial||key!==supportIdentity())return
      this.setData({ remoteRows: [],dealRows:[], products: [], categories: [], discountedProducts: [],
        businessInfo:{open:false,label:'',notice:''},cloudBusy: false, cloudStatus: '', cloudConnectionError:true,deliverySummary:'',hasMore:false,dealsHasMore:false })
    }
  },

  async refreshCloudCartTotal() {
    const context=supportIdentity()
    const cfg = cloudCartConfig()
    if (!cfg) return
    try {
      const summary = await cloudCartDetails(cfg)
      if(context!==supportIdentity())return
      this.setData({ cartCount: summary.totalCount, cartTotal: summary.totalText })
      syncCloudBadge(cfg.storeSlug)
    } catch (_) { if(context===supportIdentity())this.setData({ cartCount: 0, cartTotal: '0.00' }) }
  },

  renderCloudProducts() {
    const rows = this.data.remoteRows || []
    // Effective prices and category metadata come from the paged public API.
    const view = (r:any) => ({
        id: r.id, name: r.name, imageUrl: r.imageUrl || '',
        categoryId:r.categoryId,original: (r.priceCents / 100).toFixed(2), current: ((r.effectivePriceCents??r.priceCents) / 100).toFixed(2),
        discounted: Number(r.effectivePriceCents??r.priceCents)<r.priceCents, available: !r.soldOut && stockAllows(r),
        inventoryText:(r.soldOut?'商家手动售罄 · ':'')+(r.stockMode==='finite'?(stockAllows(r)?`库存 ${r.stockQuantity} 件`:'缺货（库存为零）'):'不限库存')
      })
    const allProducts=rows.map(view)
    const deals=(this.data.dealRows||[]).map(view)
    const categories=this.data.categories
    const selectedCategory=this.data.selectedCategory
    const products=allProducts
    this.refreshCloudCartTotal()
    this.setData({ categories, selectedCategory, products, discountedProducts:deals.filter(p=>p.discounted),
      placeholderStyle: currentPresentation().placeholderStyle,
      customPlaceholderUrl: currentPresentation().customPlaceholderUrl })
  },

  chooseCategory(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)

    this.setData({
      placeholderStyle: currentPresentation().placeholderStyle,
      customPlaceholderUrl: currentPresentation().customPlaceholderUrl,
      selectedCategory: id
    })

    if(cloudCartConfig())this.loadCloudHome();else this.refresh()
  },

  async addCart(e: WechatMiniprogram.TouchEvent) {
    if (this.data.cloudMode) {
      const cfg = cloudCartConfig()
      const id = String(e.currentTarget.dataset.id || '')
      const row = (this.data.remoteRows || []).concat(this.data.dealRows||[]).find((p: any) => String(p.id) === id)
      if (!cfg || !row || row.active === false || row.soldOut) { wx.showToast({ title: '商品已停售', icon: 'none' }); return }
      if (!await changeCloudCart(cfg.storeSlug, id, 1)) return
      this.refreshCloudCartTotal()
      { wx.showToast({ title: '已加入购物车', icon: 'success' }); return }
    }
    const id = String(e.currentTarget.dataset.id)

    const product = loadStore().products.find(
      p => p.id === id
    )

    if (!product || !productIsPublished(product) || product.soldOut || !stockAllows(product)) {
      wx.showToast({
        title: '商品已停售',
        icon: 'none'
      })
      return
    }

    if(!addToCart(id))return
    this.refresh()

    wx.showToast({
      title: '已加入购物车',
      icon: 'success'
    })
  },

  openProduct(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '')
    if (id) wx.navigateTo({ url: '/pages/product-detail/product-detail?id=' + encodeURIComponent(id) })
  },
  goCart() {
    if(this.data.entryError||this.data.entryLoading)return

    wx.switchTab({
url: '/pages/cart/cart'
    })
  },

  goAdmin() {
    openMerchantWorkspace()
  }
})
