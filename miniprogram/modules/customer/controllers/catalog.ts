import { categoryIconView } from '../../shared/domain/categoryIcons'
import { stableRowsPatch } from '../../shared/runtime/stableRows'
import { prepareUiTrace,hideUiTrace,traceUi } from '../../shared/runtime/uiTrace'
import { PUBLIC_API_BASE } from '../../../config/cloud'
import { captureStoreEntry,resolveStoreEntry,shopShare,hasPendingStoreEntry } from '../../../utils/storeEntry'
import { currentPresentation,applyPagePresentation } from '../../../utils/storePresentation'
import { cloudCartConfig, changeCloudCart, cloudCartDetails, syncCloudBadge } from '../../../utils/cloudCart' // PHASE33_CLOUD_CART
import { businessState } from '../demo/settings' // STALL_HOURS_V1
import { getRemoteProductPage } from '../../../utils/remoteApi'
import { publicBusiness } from '../../shared/api/business'
import { loadCloudDelivery } from '../../../utils/cloudCheckout'
import { cloudIdentity as supportIdentity } from '../../shared/runtime/context'

import {
  loadStore,
  effectivePrice,
  productIsPublished,
  stockAllows,
  money
} from '../demo/catalog'

import {
  addToCart,
  getCartDetails
} from '../../../utils/cart'

interface ProductView {
  inventoryText?:string
  id: string
  name: string
  imageUrl?: string
  original: string
  current: string
  discountPercent?:number
  discounted: boolean
  available: boolean
}

function catalogOptions<T>(options:T & ThisType<T & {setData(patch:Record<string,any>):void}>):T {return options}
export function createCatalogPage(isCategory = false) { return catalogOptions({
  cloudSerial:0,cloudContext:'',homeConfirmed:'',pageVisible:false,

  data: {
    allCategoryIcon:categoryIconView({iconKey:'grid'}),isCategory,sortMode:"default",onlyAvailable:false,onlyDeals:false,categoryTitle:"全部商品",uiTraceEnabled:false,entryBlocking:true,
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
  goCategories(){wx.switchTab({url:"/pages/category/category"})},
  showDelivery(){wx.showModal({title:"配送说明",content:this.data.deliverySummary||"配送区域、费用与时段将在结算时按收货地址核对。",showCancel:false})},
  unavailable(){wx.showToast({title:"该服务暂未开通",icon:"none"})},
  showDeals(){if(isCategory){this.setData({onlyDeals:true});this.applyCatalogFilters()}else wx.switchTab({url:"/pages/category/category",success:()=>{const pages=getCurrentPages();const p=pages[pages.length-1] as any;if(p&&p.showDeals)p.showDeals()}})},
  sortProducts(){wx.showActionSheet({itemList:["综合排序","已加载商品 · 价格从低到高","已加载商品 · 价格从高到低"],success:r=>{this.setData({sortMode:["default","asc","desc"][r.tapIndex]});this.applyCatalogFilters()}})},
  filterProducts(){wx.showActionSheet({itemList:[this.data.onlyAvailable?"显示全部库存":"仅看有货",this.data.onlyDeals?"显示全部价格":"仅看优惠"],success:r=>{this.setData(r.tapIndex===0?{onlyAvailable:!this.data.onlyAvailable}:{onlyDeals:!this.data.onlyDeals});this.applyCatalogFilters()}})},
  applyCatalogFilters(){if(this.data.cloudMode)this.renderCloudProducts();else this.refresh()},
  arrangeProducts(rows:ProductView[]){return rows.filter(p=>(!this.data.onlyAvailable||p.available)&&(!this.data.onlyDeals||p.discounted)).sort((a,b)=>this.data.sortMode==="asc"?Number(a.current)-Number(b.current):this.data.sortMode==="desc"?Number(b.current)-Number(a.current):0)},
  onShareAppMessage(){return shopShare(this.data.storeName)},
  retryStoreEntry(){this.onShow()},
  async onShow() {
    prepareUiTrace(this,'home',supportIdentity)
    this.pageVisible=true
    const serial=++this.cloudSerial
    const identity=supportIdentity(),sameContext=this.cloudContext===identity,pendingEntry=hasPendingStoreEntry()
    const retained=sameContext&&this.homeConfirmed===identity
    traceUi(this,'home.restore',{sameContext,retained,pendingEntry})
    this.syncHomeContext(identity)
    this.setData({entryLoading:!retained||pendingEntry,entryBlocking:!retained||pendingEntry,entryError:'',cloudConnectionError:false})
    try{traceUi(this,'home.entry.begin');await resolveStoreEntry();traceUi(this,'home.entry.end')}catch(e){
      if(serial===this.cloudSerial&&this.pageVisible){if(retained&&!pendingEntry&&this.cloudContext===supportIdentity())this.setData({entryBlocking:false,entryLoading:false,cloudBusy:false,cloudStatus:'暂时无法同步店铺入口，已保留上次内容，请重试'})
      else this.setData({entryBlocking:true,entryError:'暂时无法连接商店，请检查网络连接后重试。',entryLoading:false,storeName:'店铺入口未确认',hasMore:false,dealsHasMore:false,products:[],discountedProducts:[],remoteRows:[],dealRows:[],categories:[],cloudMode:true,cloudBusy:false,cloudConnectionError:true,deliverySummary:''})}return
    }
    if(!this.pageVisible||serial!==this.cloudSerial)return
    // The customer landing page never infers navigation intent from a stored role preference.
    this.setData({entryLoading:false,...currentPresentation()});
    const cfg = cloudCartConfig()
    const shareReady=!!cfg&&/^https:\/\//.test(PUBLIC_API_BASE)&&PUBLIC_API_BASE.replace(/\/+$/,'')===cfg.apiBase
    this.setData({shareReady})
    if(shareReady)wx.showShareMenu({menus:['shareAppMessage']});else wx.hideShareMenu({menus:['shareAppMessage']})
    const context=supportIdentity()
    this.syncHomeContext(context)
    this.setData({entryBlocking:!!cfg&&this.homeConfirmed!==context})
    if (cfg && cfg.apiBase && cfg.storeSlug) this.loadCloudHome()
    else { this.cloudSerial++;this.setData({entryBlocking:false, cloudMode: false,cloudConnectionError:false,storeName:'小摊商店',deliverySummary:'' }); this.refresh() }
  },

  syncHomeContext(key:string){
    if(this.cloudContext===key)return
    traceUi(this,'home.context.reset')
    this.cloudContext=key;this.homeConfirmed=''
    this.setData({selectedCategory:'all',searchInput:'',searchQuery:'',remoteRows:[],dealRows:[],dealCursor:'',dealsHasMore:false,products:[],discountedProducts:[],categories:[],nextCursor:'',hasMore:false,cartCount:0,cartTotal:'0.00',categoryTitle:'全部商品',sortMode:'default',onlyAvailable:false,onlyDeals:false,deliverySummary:'',entryBlocking:true})
  },
  onHide(){hideUiTrace(this,'onHide');this.pageVisible=false;this.cloudSerial++;this.setData({cloudBusy:false,dealBusy:false})},
  onUnload(){hideUiTrace(this,'onUnload');this.pageVisible=false;this.cloudSerial++},
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
          discounted: current < p.price,discountPercent:p.price>0?Math.round((1-current/p.price)*100):0,
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
      categories: store.categories.map(c=>({...c,...categoryIconView(c)})),
      products:this.arrangeProducts(products),
      discountedProducts,
      cartCount: cart.totalCount,
      cartTotal: cart.totalText
    })
  },

  // Cloud catalog and business settings never fall back to demo data.
  async loadCloudHome() {
    traceUi(this,'home.refresh.begin')
    const cfg = cloudCartConfig()
    if (this.data.entryError || !cfg || !cfg.apiBase || !cfg.storeSlug) return
    const serial=++this.cloudSerial,key=supportIdentity()
    this.syncHomeContext(key)
    const retained=this.homeConfirmed===key
    this.setData({cloudMode:true,cloudBusy:true,cloudConnectionError:false,cloudStatus:retained?'正在后台同步':'正在加载云端商品',dealBusy:false,dealError:''})
    try {
      const requestCfg={apiBase:String(cfg.apiBase).trim(),storeSlug:String(cfg.storeSlug).trim()}
      const [page,business,rules,deals] = await Promise.all([getRemoteProductPage(requestCfg.apiBase,requestCfg.storeSlug,{...this.data.searchQuery?{q:this.data.searchQuery}:{},...this.data.selectedCategory!=='all'?{category:this.data.selectedCategory}:{}}),publicBusiness(requestCfg),loadCloudDelivery(requestCfg).catch(()=>null),getRemoteProductPage(requestCfg.apiBase,requestCfg.storeSlug,{discount:'1'})])
      const current=cloudCartConfig();if(serial!==this.cloudSerial||!current||supportIdentity()!==key){traceUi(this,'home.response.discard');return}
      traceUi(this,'home.catalog.confirm',{rows:page.products.length})
      this.homeConfirmed=key;applyPagePresentation(this,business)
      const areas=rules?rules.areas.filter(a=>a.enabled):[]
      this.setData({entryBlocking:false,storeName:business.storeName||'店铺',dealRows:deals.products,dealCursor:deals.nextCursor||'',dealsHasMore:deals.hasMore,remoteRows: page.products,...stableRowsPatch('categories',this.data.categories,page.categories.map(c=>({...c,...categoryIconView(c)})),'id'),hasMore:page.hasMore,nextCursor:page.nextCursor||'', businessInfo:business,cloudStatus: '', cloudBusy: false, cloudConnectionError:false,
        deliverySummary:rules?('启用配送区域 '+areas.length+' 个：'+areas.slice(0,3).map(a=>a.name).join('、')+(areas.length>3?' 等':'')+'；时段在结算时按区域、星期和日期核对'):'配送规则未配置或暂不可读取，当前不能确认配送，请进入结算重新核对' })
      this.renderCloudProducts();this.refreshCloudCartTotal()
    } catch (error) {
      if(serial!==this.cloudSerial||key!==supportIdentity())return
      if(retained&&!/http_40[13]/.test(String(error))){this.setData({cloudBusy:false,cloudStatus:'同步失败，已保留上次商品与价格，请稍后重试',cloudConnectionError:false});return}
      this.homeConfirmed=''
      this.setData({entryBlocking:true,remoteRows: [],dealRows:[], products: [], categories: [], discountedProducts: [],
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
    } catch (_) { if(context===supportIdentity())this.setData({cloudStatus:'购物车金额同步失败，请进入购物车重新核对'}) }
  },

  renderCloudProducts() {
    const rows = this.data.remoteRows || []
    // Effective prices and category metadata come from the paged public API.
    const view = (r:any) => ({
        id: r.id, name: r.name, imageUrl: r.imageUrl || '',
        categoryId:r.categoryId,original: (r.priceCents / 100).toFixed(2), current: ((r.effectivePriceCents??r.priceCents) / 100).toFixed(2),
        discountPercent:r.priceCents>0?Math.round((1-Number(r.effectivePriceCents??r.priceCents)/r.priceCents)*100):0,discounted: Number(r.effectivePriceCents??r.priceCents)<r.priceCents, available: !r.soldOut && stockAllows(r),
        inventoryText:(r.soldOut?'商家手动售罄 · ':'')+(r.stockMode==='finite'?(stockAllows(r)?`库存 ${r.stockQuantity} 件`:'缺货（库存为零）'):'不限库存')
      })
    const allProducts=rows.map(view)
    const deals=(this.data.dealRows||[]).map(view)
    const selectedCategory=this.data.selectedCategory
    const products=this.arrangeProducts(allProducts)
    this.setData({selectedCategory,...stableRowsPatch('products',this.data.products,products,'id'),...stableRowsPatch('discountedProducts',this.data.discountedProducts,deals.filter(p=>p.discounted),'id'),
      placeholderStyle: currentPresentation().placeholderStyle,
      customPlaceholderUrl: currentPresentation().customPlaceholderUrl })
  },

  chooseCategory(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)

    this.setData({
      placeholderStyle: currentPresentation().placeholderStyle,
      customPlaceholderUrl: currentPresentation().customPlaceholderUrl,
      categoryTitle:id==='all'?'全部商品':this.data.categories.find(c=>c.id===id)?.name||'商品分类',
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
  }
}) }