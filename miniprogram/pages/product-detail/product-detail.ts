import { cloudCartConfig, changeCloudCart, readCloudCart } from '../../utils/cloudCart'
import { loadStore, effectivePrice, money, productIsPublished, stockAllows } from '../../modules/customer/demo/catalog'
import { addToCart, loadCart } from '../../utils/cart'
import { setDirectPurchase } from '../../utils/directPurchase'
import { excludedCartIds, setExcludedCartIds } from '../../modules/customer/domain/cartSelection'
import { getRemoteProducts, getRemoteProductPage } from '../../utils/remoteApi'
import { currentPresentation, refreshPagePresentation, invalidatePagePresentation } from '../../utils/storePresentation'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'

import { favoriteProduct, toggleFavorite, recordProductView, libraryScope } from '../../modules/customer/domain/productLibrary'

interface Recommendation { id:string; name:string; imageUrl:string; current:string }
function stockLimit(p:{stockMode?:string;stockQuantity?:number}):number {
  return p.stockMode==='finite' ? (Number.isSafeInteger(p.stockQuantity)?Math.max(0,Math.min(99,Number(p.stockQuantity))):0) : 99
}
Page({
  detailSerial:0, detailContext:'', pageVisible:true, actionPending:false,
  data: {
    isFavorite:false, libraryStatus:'',
    purchaseBusy:false, inventoryText:'', manualSoldOut:false, maxQuantity:99,
    productId:'', name:'', original:'', current:'', discounted:false, discountPercent:0,
    available:false, quantity:1, totalText:'0.00', categoryName:'', description:'', imageUrl:'',
    imageUrls:[] as string[], imageIndex:0, navigationTop:28, cartCount:0,
    recommendations:[] as Recommendation[], detailsExpanded:true,
    placeholderStyle:'premium', customPlaceholderUrl:'',
    cloudMode:false, cloudLoading:false, cloudError:'', cloudPriceCents:0
  },
  onLoad(options:{id?:string}) {
    let id='';try{id=decodeURIComponent(options.id||'')}catch(_){/* Malformed entry stays unavailable. */}
    let top=28;try{top=wx.getMenuButtonBoundingClientRect().top}catch(_){/* Older runtimes use a safe fallback. */}
    this.setData({productId:id,navigationTop:top})
  },
  onShow(){this.pageVisible=true;this.setData({isFavorite:false,libraryStatus:''});this.setData({purchaseBusy:this.actionPending});refreshPagePresentation(this);this.refreshCartCount();this.refresh()},
  onHide(){this.pageVisible=false;this.detailSerial++;invalidatePagePresentation(this)},
  onUnload(){this.pageVisible=false;this.detailSerial++;invalidatePagePresentation(this)},
  async refresh(){
    const cfg=cloudCartConfig(),serial=++this.detailSerial,context=supportIdentity()
    if(this.detailContext!==context){this.detailContext=context;this.setData({name:'',current:'',original:'',imageUrl:'',imageUrls:[],imageIndex:0,description:'',recommendations:[],quantity:1,totalText:'0.00',available:false})}
    if(cfg){
      this.setData({cloudMode:true,cloudLoading:true,cloudError:'',available:false})
      try{
        const products=await getRemoteProducts(cfg.apiBase,cfg.storeSlug,[this.data.productId])
        if(serial!==this.detailSerial||context!==supportIdentity()||!this.pageVisible)return
        const p=products.find(x=>x.id===this.data.productId)
        if(!p)throw Error('not_found')
        const price=Number(p.effectivePriceCents??p.priceCents),original=Number(p.priceCents)
        if(!Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(original)||original<0)throw Error('invalid_price')
        const maxQuantity=stockLimit(p),qty=Math.max(1,Math.min(this.data.quantity,Math.max(1,maxQuantity)))
        const imageUrl=typeof p.imageUrl==='string'?p.imageUrl:''
        this.setData({name:String(p.name||''),current:(price/100).toFixed(2),original:(original/100).toFixed(2),
          discounted:price<original,discountPercent:original>0?Math.round((1-price/original)*100):0,
          available:(p as any).active!==false&&!p.soldOut&&stockAllows(p,qty),manualSoldOut:!!p.soldOut,maxQuantity,
          inventoryText:p.stockMode==='finite'?(stockAllows(p)?`库存 ${p.stockQuantity} 件`:'暂时缺货'):'不限库存',
          categoryName:p.categoryName||'',description:p.description||'',imageUrl,imageUrls:imageUrl?[imageUrl]:[],imageIndex:0,
          quantity:qty,cloudPriceCents:price,totalText:(price*qty/100).toFixed(2),cloudLoading:false,cloudError:''})
        this.rememberProduct()
        wx.setNavigationBarTitle({title:p.name||'商品详情'})
        this.loadRecommendations(serial,context,p.categoryId||'')
      }catch(error){
        if(serial!==this.detailSerial||context!==supportIdentity()||!this.pageVisible)return
        const denied=/http_40[13]|not_found/.test(String(error))
        this.setData({cloudLoading:false,cloudError:'商品暂无法确认，请重试',available:false,
          ...denied?{name:'',current:'',original:'',imageUrl:'',imageUrls:[],description:'',recommendations:[]}:{}})
      }
      return
    }
    const store=loadStore(),product=store.products.find(p=>p.id===this.data.productId)
    if(!product||!productIsPublished(product)){this.setData({cloudMode:false,available:false,name:'',description:'',imageUrl:'',imageUrls:[],recommendations:[],cloudError:'商品不存在或未上架'});return}
    const current=effectivePrice(product),maxQuantity=stockLimit(product),qty=Math.max(1,Math.min(this.data.quantity,Math.max(1,maxQuantity)))
    const imageUrl=product.imageUrl||'',category=store.categories.find(c=>c.id===product.categoryId)
    this.setData({cloudMode:false,cloudLoading:false,cloudError:'',name:product.name,current:money(current),original:money(product.price),
      discounted:current<product.price,discountPercent:product.price>0?Math.round((1-current/product.price)*100):0,
      available:!product.soldOut&&stockAllows(product,qty),manualSoldOut:!!product.soldOut,maxQuantity,quantity:qty,
      inventoryText:product.stockMode==='finite'?(stockAllows(product)?`库存 ${product.stockQuantity} 件`:'暂时缺货'):'不限库存',
      categoryName:category?.name||'',description:(product as any).description||'',imageUrl,imageUrls:imageUrl?[imageUrl]:[],imageIndex:0,
      totalText:money(Math.round(current*qty*100)/100),...currentPresentation(),
      recommendations:store.products.filter(p=>p.id!==product.id&&productIsPublished(p)&&!p.soldOut&&stockAllows(p)).sort((a,b)=>Number(b.categoryId===product.categoryId)-Number(a.categoryId===product.categoryId)).slice(0,4).map(p=>({id:p.id,name:p.name,imageUrl:p.imageUrl||'',current:money(effectivePrice(p))}))})
    this.rememberProduct()
    wx.setNavigationBarTitle({title:product.name})
  },
  async loadRecommendations(serial:number,context:string,categoryId:string){
    const cfg=cloudCartConfig();if(!cfg)return
    try{
      const page=await getRemoteProductPage(cfg.apiBase,cfg.storeSlug,categoryId?{category:categoryId}:{})
      if(serial!==this.detailSerial||context!==supportIdentity()||!this.pageVisible)return
      const recommendations=page.products.filter(p=>p.id!==this.data.productId&&(p as any).active!==false&&!p.soldOut&&stockAllows(p))
        .filter(p=>Number.isSafeInteger(p.effectivePriceCents??p.priceCents)&&Number(p.effectivePriceCents??p.priceCents)>=0).slice(0,4)
        .map(p=>({id:p.id,name:p.name,imageUrl:p.imageUrl||'',current:(Number(p.effectivePriceCents??p.priceCents)/100).toFixed(2)}))
      this.setData({recommendations})
    }catch(_){/* Recommendations are optional and never substitute demo data. */}
  },
  updateQuantity(delta:number){
    if(this.data.purchaseBusy||this.data.cloudLoading||!this.data.available)return
    const quantity=Math.max(1,Math.min(this.data.maxQuantity,this.data.quantity+delta))
    if(quantity===this.data.quantity)return
    const cents=this.data.cloudMode?this.data.cloudPriceCents:Math.round(Number(this.data.current)*100)
    this.setData({quantity,totalText:(cents*quantity/100).toFixed(2)})
  },
  decrease(){this.updateQuantity(-1)},increase(){this.updateQuantity(1)},
  refreshCartCount(){const cfg=cloudCartConfig(),rows=cfg?readCloudCart(cfg.storeSlug):loadCart();this.setData({cartCount:rows.reduce((n,row)=>n+row.quantity,0)})},
  async purchase(buyNow:boolean){
    if(this.actionPending||!this.data.available||this.data.cloudLoading||this.data.cloudError||this.detailContext!==supportIdentity())return
    this.actionPending=true;this.setData({purchaseBusy:true})
    const cfg=cloudCartConfig(),context=supportIdentity(),id=this.data.productId,quantity=this.data.quantity
    try{
      if(cfg){
        if(!await changeCloudCart(cfg.storeSlug,id,quantity))return
        if(context!==supportIdentity()||!this.pageVisible)return
        if(buyNow)setExcludedCartIds(excludedCartIds().filter(x=>x!==id))
      }else{
        const product=loadStore().products.find(p=>p.id===id)
        if(!product||!productIsPublished(product)||product.soldOut||!stockAllows(product,quantity)){wx.showToast({title:'商品停售或库存不足',icon:'none'});return}
        if(buyNow)setDirectPurchase(id,quantity);else if(!addToCart(id,quantity))return
      }
      if(context!==supportIdentity()||!this.pageVisible)return
      this.refreshCartCount()
      if(buyNow)wx.navigateTo({url:'/pages/checkout/checkout'});else wx.showToast({title:'已加入购物车',icon:'success'})
    }finally{this.actionPending=false;if(this.pageVisible)this.setData({purchaseBusy:false})}
  },
  addCart(){return this.purchase(false)},buyNow(){return this.purchase(true)},
  async addRecommendation(e:any){
    if(this.actionPending||this.data.cloudLoading||this.detailContext!==supportIdentity())return
    const id=String(e.currentTarget.dataset.id||'');if(!this.data.recommendations.some(p=>p.id===id))return
    const cfg=cloudCartConfig(),context=supportIdentity();this.actionPending=true;this.setData({purchaseBusy:true})
    try{const added=cfg?await changeCloudCart(cfg.storeSlug,id,1):addToCart(id,1);if(added&&context===supportIdentity()&&this.pageVisible){this.refreshCartCount();wx.showToast({title:'已加入购物车',icon:'success'})}}
    finally{this.actionPending=false;if(this.pageVisible)this.setData({purchaseBusy:false})}
  },
  changeImage(e:any){this.setData({imageIndex:Number(e.detail.current)||0})},
  previewImages(){if(this.data.imageUrls.length)wx.previewImage({urls:this.data.imageUrls,current:this.data.imageUrls[this.data.imageIndex]})},
  toggleDetails(){this.setData({detailsExpanded:!this.data.detailsExpanded})},
  libraryProduct(){return {id:this.data.productId,name:this.data.name,imageUrl:this.data.imageUrl,priceCents:this.data.cloudMode?this.data.cloudPriceCents:Math.round(Number(this.data.current)*100)}},
  rememberProduct(){
    if(!this.pageVisible||this.detailContext!==supportIdentity()||this.data.cloudLoading||this.data.cloudError||!this.data.name)return
    try{const scope=libraryScope();this.setData({isFavorite:favoriteProduct(this.data.productId,scope)});recordProductView(this.libraryProduct(),scope);this.setData({libraryStatus:''})}
    catch(_){this.setData({libraryStatus:'收藏或浏览记录暂未保存，请检查设备存储。'})}
  },
  favorite(){
    if(!this.pageVisible||this.detailContext!==supportIdentity()||this.data.cloudLoading||this.data.cloudError||!this.data.name){wx.showToast({title:'请先确认商品信息',icon:'none'});return}
    try{const isFavorite=toggleFavorite(this.libraryProduct());this.setData({isFavorite,libraryStatus:''});wx.showToast({title:isFavorite?'已收藏':'已取消收藏',icon:'none'})}
    catch(error){wx.showToast({title:String(error).includes('favorite_limit')?'收藏已达200件，请先移除部分商品':'收藏保存失败，请检查设备存储',icon:'none'})}
  },
  goCart(){wx.switchTab({url:'/pages/cart/cart'})},goCategories(){wx.switchTab({url:'/pages/category/category'})},
  goBack(){if(getCurrentPages().length>1)wx.navigateBack();else wx.switchTab({url:'/pages/index/index'})},
  openRecommendation(e:any){const id=String(e.currentTarget.dataset.id||'');if(this.data.recommendations.some(p=>p.id===id))wx.navigateTo({url:'/pages/product-detail/product-detail?id='+encodeURIComponent(id)})}
})
