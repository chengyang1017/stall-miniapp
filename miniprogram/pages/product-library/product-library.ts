import { savedProducts,removeSavedProduct,clearSavedProducts,libraryScope,currentLibraryScope } from '../../modules/customer/domain/productLibrary'
import type { LibraryKind,SavedProduct,LibraryScope } from '../../modules/customer/domain/productLibrary'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { getRemoteProducts } from '../../modules/shared/api/catalog'
import { loadStore,effectivePrice,productIsPublished,stockAllows } from '../../modules/customer/demo/catalog'

interface LibraryRow extends SavedProduct { priceText:string;status:string;canOpen:boolean;confirmed:boolean }
function present(saved:SavedProduct,product:any,cloud:boolean):LibraryRow {
  if(!product||(!cloud&&!productIsPublished(product))||product.active===false)return {...saved,priceText:(saved.priceCents/100).toFixed(2),status:'商品已下架或删除',canOpen:false,confirmed:false}
  const cents=cloud?Number(product.effectivePriceCents??product.priceCents):Math.round(effectivePrice(product)*100)
  if(!Number.isSafeInteger(cents)||cents<0)throw Error('invalid_library_price')
  return {...saved,name:String(product.name||saved.name),imageUrl:typeof product.imageUrl==='string'?product.imageUrl:'',priceCents:cents,priceText:(cents/100).toFixed(2),
    status:product.soldOut||!stockAllows(product)?'暂时缺货':'在售',canOpen:true,confirmed:true}
}
Page({
  serial:0,visible:false,scope:null as LibraryScope|null,
  data:{kind:'favorites' as LibraryKind,rows:[] as LibraryRow[],loading:false,error:'',clearing:false},
  onLoad(options:Record<string,string|undefined>){this.setData({kind:options.kind==='history'?'history':'favorites'})},
  onShow(){this.visible=true;this.loadRecords()},
  onHide(){this.visible=false;this.serial++;this.scope=null;this.setData({rows:[],loading:false,error:'',clearing:false})},
  onUnload(){this.onHide()},
  onPullDownRefresh(){this.loadRecords().finally(()=>wx.stopPullDownRefresh())},
  isCurrent(serial:number,scope:LibraryScope):boolean {
    if(!this.visible||serial!==this.serial)return false
    try{if(currentLibraryScope(scope))return true}catch(_){/* Unreadable storage must not retain another context's rows. */}
    this.serial++;this.scope=null;this.setData({rows:[],loading:false,clearing:false,error:'账号、店铺或存储状态已变化，请重新读取记录。'})
    return false
  },
  chooseKind(e:any){const kind=e.currentTarget.dataset.kind;if(kind!=='favorites'&&kind!=='history'||kind===this.data.kind)return;this.setData({kind,clearing:false});this.loadRecords()},
  async loadRecords(){
    const serial=++this.serial,kind=this.data.kind
    let scope:LibraryScope
    try{scope=libraryScope()}catch(_){this.scope=null;this.setData({rows:[],loading:false,clearing:false,error:'设备存储暂无法读取，请稍后重试。'});return}
    this.scope=scope
    wx.setNavigationBarTitle({title:kind==='favorites'?'我的收藏':'浏览记录'})
    this.setData({rows:[],loading:true,error:'',clearing:false})
    try{
      const saved=savedProducts(kind,scope)
      this.setData({rows:saved.map(row=>({...row,priceText:(row.priceCents/100).toFixed(2),status:'正在确认商品',canOpen:false,confirmed:false}))})
      const cfg=getCloudContext()
      if(cfg&&saved.length){
        const batches=[]
        for(let i=0;i<saved.length;i+=40)batches.push(getRemoteProducts(cfg.apiBase,cfg.storeSlug,saved.slice(i,i+40).map(row=>row.id)))
        const products=(await Promise.all(batches)).reduce((all,page)=>all.concat(page),[] as any[])
        if(!this.isCurrent(serial,scope))return
        const byId=new Map(products.map(product=>[product.id,product]))
        this.setData({rows:saved.map(row=>present(row,byId.get(row.id),true))})
      }else{
        const store=saved.length?loadStore():null
        if(!this.isCurrent(serial,scope))return
        this.setData({rows:saved.map(row=>present(row,store?.products.find(product=>product.id===row.id),false))})
      }
    }catch(_){
      if(this.isCurrent(serial,scope))this.setData({error:'记录或商品信息读取失败，请重试；当前显示的为上次保存信息。',rows:this.data.rows.map(row=>({...row,status:'商品状态待重新确认',canOpen:false,confirmed:false}))})
    }finally{if(this.isCurrent(serial,scope))this.setData({loading:false})}
  },
  openProduct(e:any){
    if(!this.scope||!this.isCurrent(this.serial,this.scope))return
    const id=String(e.currentTarget.dataset.id||'')
    if(this.data.rows.some(row=>row.id===id&&row.canOpen))wx.navigateTo({url:'/pages/product-detail/product-detail?id='+encodeURIComponent(id)})
  },
  removeProduct(e:any){
    if(!this.scope||!this.isCurrent(this.serial,this.scope)||this.data.loading)return
    const id=String(e.currentTarget.dataset.id||'');if(!this.data.rows.some(row=>row.id===id))return
    try{removeSavedProduct(this.data.kind,id,this.scope);this.serial++;this.setData({rows:this.data.rows.filter(row=>row.id!==id),clearing:false})}
    catch(_){wx.showToast({title:'移除失败，请检查设备存储后重试',icon:'none'})}
  },
  clearRecords(){
    const scope=this.scope,serial=this.serial,kind=this.data.kind
    if(!scope||this.data.clearing||this.data.loading||!this.data.rows.length||!this.isCurrent(serial,scope))return
    this.setData({clearing:true})
    wx.showModal({title:kind==='favorites'?'清空当前收藏？':'清空浏览记录？',content:'仅清空当前账号、当前店铺在本机保存的这类记录。',confirmText:'清空',success:result=>{
      if(!this.isCurrent(serial,scope))return
      try{if(result.confirm){clearSavedProducts(kind,scope);this.serial++;this.setData({rows:[]})}}
      catch(_){wx.showToast({title:'清空失败，请检查设备存储后重试',icon:'none'})}
      finally{this.setData({clearing:false})}
    },fail:()=>{if(this.isCurrent(serial,scope))this.setData({clearing:false})}})
  }
})
