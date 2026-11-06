import { cloudCartConfig } from '../../utils/cloudCart'
import { getRemoteProductPage } from '../../utils/remoteApi'
import { loadStore,effectivePrice,productIsPublished,stockAllows,money } from '../../modules/customer/demo/catalog'
import { cloudIdentity } from '../../modules/shared/runtime/context'
import { currentPresentation } from '../../utils/storePresentation'

interface SearchProduct { id:string;name:string;imageUrl:string;current:string;original:string;discounted:boolean;available:boolean;inventoryText:string }
function presentRemote(p:any):SearchProduct{
 const cents=Number(p.effectivePriceCents??p.priceCents),original=Number(p.priceCents)
 return {id:String(p.id),name:String(p.name||''),imageUrl:String(p.imageUrl||''),current:(cents/100).toFixed(2),original:(original/100).toFixed(2),
  discounted:cents<original,available:(p as any).active!==false&&!p.soldOut&&stockAllows(p),
  inventoryText:p.soldOut?'已售罄':p.stockMode==='finite'?'库存 '+Number(p.stockQuantity||0)+' 件':'不限库存'}
}
Page({
 serial:0,visible:false,searchContext:'',
 data:{input:'',query:'',searched:false,loading:false,loadingMore:false,error:'',rows:[] as SearchProduct[],hasMore:false,nextCursor:'',
  placeholderStyle:'premium',customPlaceholderUrl:''},
 onLoad(options:{q?:string}){let query='';try{query=decodeURIComponent(options.q||'').trim().slice(0,100)}catch(_){}
  if(query)this.setData({input:query})},
 onShow(){this.visible=true;const key=cloudIdentity();if(this.searchContext&&this.searchContext!==key){this.serial++;this.setData({rows:[],query:'',searched:false,hasMore:false,nextCursor:'',error:'',loading:false,loadingMore:false})}
  this.searchContext=key;this.setData({...currentPresentation()})},
 onHide(){this.visible=false;this.serial++;this.setData({loading:false,loadingMore:false})},
 onUnload(){this.visible=false;this.serial++},
 onPullDownRefresh(){const task=this.data.searched?this.performSearch(this.data.query):Promise.resolve();task.finally(()=>wx.stopPullDownRefresh())},
 inputSearch(e:any){this.setData({input:String(e.detail.value||'').slice(0,100)})},
 clearSearch(){this.serial++;this.setData({input:'',query:'',rows:[],searched:false,loading:false,loadingMore:false,error:'',hasMore:false,nextCursor:''})},
 searchProducts(){const query=this.data.input.trim().slice(0,100);if(!query){this.clearSearch();return}this.performSearch(query)},
 async performSearch(query:string){
  const serial=++this.serial,context=cloudIdentity(),cfg=cloudCartConfig()
  this.setData({query,searched:true,rows:[],loading:true,loadingMore:false,error:'',hasMore:false,nextCursor:''})
  try{
   let rows:SearchProduct[],hasMore=false,nextCursor=''
   if(cfg){const page=await getRemoteProductPage(cfg.apiBase,cfg.storeSlug,{q:query});rows=page.products.filter(p=>(p as any).active!==false).map(presentRemote);hasMore=page.hasMore;nextCursor=page.nextCursor||''}
   else{const store=loadStore();rows=store.products.filter(p=>productIsPublished(p)&&p.name.toLowerCase().includes(query.toLowerCase()))
     .map(p=>({id:p.id,name:p.name,imageUrl:p.imageUrl||'',current:money(effectivePrice(p)),original:money(p.price),
       discounted:effectivePrice(p)<p.price,available:!p.soldOut&&stockAllows(p),
       inventoryText:p.soldOut?'已售罄':p.stockMode==='finite'?'库存 '+Number(p.stockQuantity||0)+' 件':'不限库存'}))}
   if(!this.visible||serial!==this.serial||context!==cloudIdentity())return
   this.setData({rows,hasMore,nextCursor,loading:false})
  }catch(_){if(this.visible&&serial===this.serial&&context===cloudIdentity())this.setData({loading:false,error:'搜索失败，请检查网络后重试'})}
 },
 async loadMore(){
  const cfg=cloudCartConfig();if(!cfg||this.data.loading||this.data.loadingMore||!this.data.hasMore||!this.data.nextCursor)return
  const serial=this.serial,context=cloudIdentity(),query=this.data.query,cursor=this.data.nextCursor
  this.setData({loadingMore:true,error:''})
  try{const page=await getRemoteProductPage(cfg.apiBase,cfg.storeSlug,{q:query,cursor})
   if(!this.visible||serial!==this.serial||context!==cloudIdentity())return
   const seen=new Set(this.data.rows.map(p=>p.id))
   this.setData({rows:this.data.rows.concat(page.products.filter(p=>(p as any).active!==false&&!seen.has(p.id)).map(presentRemote)),
    hasMore:page.hasMore,nextCursor:page.nextCursor||'',loadingMore:false})
  }catch(_){if(this.visible&&serial===this.serial)this.setData({loadingMore:false,error:'加载更多失败，请重试'})}
 },
 onReachBottom(){this.loadMore()},
 openProduct(e:any){const id=String(e.currentTarget.dataset.id||'');if(this.data.rows.some(p=>p.id===id))wx.navigateTo({url:'/pages/product-detail/product-detail?id='+encodeURIComponent(id)})},
 goBack(){if(getCurrentPages().length>1)wx.navigateBack();else wx.switchTab({url:'/pages/index/index'})}
})
