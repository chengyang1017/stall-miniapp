import { cloudCartConfig, changeCloudCart } from '../../utils/cloudCart' // PHASE33_CLOUD_CART
import { loadStore, effectivePrice, money, productIsPublished, stockAllows } from '../../modules/customer/demo/catalog'
import { addToCart } from '../../utils/cart'
import { setDirectPurchase } from '../../utils/directPurchase'
import { getRemoteProducts } from '../../utils/remoteApi' // PHASE32_REMOTE_DETAIL
import { refreshPagePresentation } from '../../utils/storePresentation'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'

Page({
  detailSerial:0,
  data: {
    purchaseBusy:false,
    inventoryText:'',manualSoldOut:false,maxQuantity:99,
    productId: '', name: '', original: '', current: '', discounted: false,
    available: false, quantity: 1, totalText: '0.00',
    categoryName: '', description: '', imageUrl: '', cloudMode: false, cloudLoading: false, cloudError: '', cloudPriceCents: 0
  },
  onLoad(options: { id?: string }) { this.setData({ productId: decodeURIComponent(options.id || '') }) },
  onShow() {refreshPagePresentation(this);this.refresh()},
  onHide(){this.detailSerial++},
  onUnload(){this.detailSerial++},
  async refresh() {
    // PHASE32_REMOTE_DETAIL: do not mix remote catalog with local cart.
    const cfg=cloudCartConfig(),serial=++this.detailSerial,context=supportIdentity()
    if (cfg) {
      this.setData({ cloudMode: true, cloudLoading: true, cloudError: '', available: false })
      try {
        const products = await getRemoteProducts(cfg.apiBase,cfg.storeSlug,[this.data.productId])
        if(serial!==this.detailSerial||context!==supportIdentity())return
        const p = (products as any[]).find(x => String(x.id) === String(this.data.productId))
        if (!p) throw new Error('not_found')
        const price = Number(p.effectivePriceCents??p.priceCents)
        const original = Number(p.priceCents)
        if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(original) || original < 0) throw new Error('invalid_price')
        const n = Number(this.data.quantity)
        const maxQuantity=p.stockMode==='finite'?Math.min(99,Number(p.stockQuantity)):99
        const qty = Number.isSafeInteger(n) && n >= 1 ? Math.min(n,Math.max(1,maxQuantity)) : 1
        this.setData({
          name: String(p.name || ''), current: (price / 100).toFixed(2), original: (original / 100).toFixed(2),
          discounted: price < original, available: p.active !== false && !p.soldOut && stockAllows(p,qty),
          manualSoldOut:!!p.soldOut,maxQuantity,inventoryText:p.stockMode==='finite'?(stockAllows(p)?`库存 ${p.stockQuantity} 件`:'缺货（库存为零）'):'不限库存',
          categoryName: typeof p.categoryName === 'string' ? p.categoryName : '',
          description: typeof p.description === 'string' ? p.description : '',
          imageUrl: typeof p.imageUrl === 'string' ? p.imageUrl : '',
          quantity: qty, cloudPriceCents: price, totalText: (price * qty / 100).toFixed(2),
          cloudLoading: false, cloudError: ''
        })
        wx.setNavigationBarTitle({ title: String(p.name || '商品详情') })
      } catch (_) {
        if(serial!==this.detailSerial||context!==supportIdentity())return
        this.setData({ cloudLoading: false, cloudError: '商品加载失败，请返回商品列表重试', available: false,
          name: '', current: '0.00', original: '0.00', imageUrl: '', description: '' })
      }
      return
    }
    const store = loadStore()
    const product = store.products.find(p => p.id === this.data.productId)
    if (!product || !productIsPublished(product)) { this.setData({available:false,name:'',description:'',imageUrl:''}); wx.showToast({ title: '商品不存在或未上架', icon: 'none' }); return }
    const current = effectivePrice(product)
    const extended = product as typeof product & { description?: string; imageUrl?: string }
    const category = store.categories.find(c => c.id === product.categoryId)
    this.setData({
      name: product.name, current: money(current), original: money(product.price),
      discounted: current < product.price, available: productIsPublished(product) && !product.soldOut && stockAllows(product,this.data.quantity),
      manualSoldOut:!!product.soldOut,maxQuantity:product.stockMode==='finite'?Math.min(99,Number(product.stockQuantity)):99,
      inventoryText:product.stockMode==='finite'?(stockAllows(product)?`库存 ${product.stockQuantity} 件`:'缺货（库存为零）'):'不限库存',
      categoryName: category ? category.name : '', description: extended.description || '',
      imageUrl: extended.imageUrl || '',
      totalText: money(Math.round(current * this.data.quantity * 100) / 100)
    })
    wx.setNavigationBarTitle({ title: product.name })
  },
  decrease() { if (this.data.quantity <= 1) return; this.setData({ quantity: this.data.quantity - 1 }); this.refresh() },
  increase() { if (this.data.quantity >= this.data.maxQuantity) return; this.setData({ quantity: this.data.quantity + 1 }); this.refresh() },
  async addCart() {
    if (this.data.cloudMode) {
      const cfg = cloudCartConfig()
      if (!cfg || this.data.cloudLoading || this.data.cloudError || !this.data.available) { wx.showToast({ title: '商品暂不可购买', icon: 'none' }); return }
      if (!await changeCloudCart(cfg.storeSlug, this.data.productId, this.data.quantity)) return
      { wx.showToast({ title: '已加入购物车', icon: 'success' }); return }
    }
    const product = loadStore().products.find(p => p.id === this.data.productId)
    if (!product || (!productIsPublished(product) || product.soldOut || !stockAllows(product,this.data.quantity))) { wx.showToast({ title: '商品停售或库存不足', icon: 'none' }); return }
    if(!addToCart(product.id,this.data.quantity))return
    wx.showToast({ title: '已加入购物车', icon: 'success' })
  },
  async buyNow() {
    if (this.data.cloudMode) {const cfg=cloudCartConfig();if(!cfg||this.data.purchaseBusy||!this.data.available||this.data.cloudLoading||this.data.cloudError)return;this.setData({purchaseBusy:true});try{if(await changeCloudCart(cfg.storeSlug,this.data.productId,this.data.quantity))wx.navigateTo({url:'/pages/checkout/checkout'})}finally{this.setData({purchaseBusy:false})}return}
    const product = loadStore().products.find(p => p.id === this.data.productId)
    if (!product || (!productIsPublished(product) || product.soldOut || !stockAllows(product,this.data.quantity))) { wx.showToast({ title: '商品停售或库存不足', icon: 'none' }); return }
    setDirectPurchase(product.id, this.data.quantity)
    wx.navigateTo({ url: '/pages/checkout/checkout' })
  }
})
