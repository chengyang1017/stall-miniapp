import { loadStore, saveStore, newId, Category, Product, ProductDraft, productIsPublished, productIsPending } from '../../utils/store'
import { merchantCloudConfig, merchantCloudProductPage, merchantCloudCategoryContext, discardMerchantCloudDraft, patchMerchantCloudProduct, MerchantProductBatchPatch } from '../../utils/cloudMerchantProducts'
import { formatPublishTime } from '../../utils/productPublishing'
import { MerchantCatalogItem, defaultProductQuery, queryChoices, localMerchantQuery } from '../../utils/merchantProductQuery'

function catalogContextKey(): string {
  const cfg = merchantCloudConfig()
  return cfg ? cfg.apiBase + '/' + cfg.storeSlug : 'local-demo'
}

Page({
  catalogProducts: [] as Product[],
  catalogItems: [] as MerchantCatalogItem[],
  localItems: [] as MerchantCatalogItem[],
  query: defaultProductQuery(),
  requestSerial: 0,
  nextCursor: '',
  localOffset: 0,
  onUnload() { this.requestSerial++ },
  async onPullDownRefresh() {
    try { if (!this.data.batchBusy) await this.refresh() }
    finally { wx.stopPullDownRefresh() }
  },
  onReachBottom() { if (!this.data.batchBusy) this.loadMore() },
  invalidateQuery() {
    this.requestSerial++
    this.setBatchSelection([])
    this.setData({batchMode:false,queryDirty:true,cloudLoading:false,loadingMore:false,batchResult:'',moreError:''})
  },
  inputSearch(e:any) {
    if(this.data.batchBusy)return
    this.invalidateQuery()
    this.setData({searchText:String(e.detail.value || '').slice(0,100)})
  },
  clearSearch() {
    if(this.data.batchBusy)return
    this.invalidateQuery()
    this.setData({searchText:''})
    this.refresh()
  },
  searchProducts() { if(!this.data.batchBusy)this.refresh() },
  resetQuery() {
    if(this.data.batchBusy)return
    this.invalidateQuery()
    this.query=defaultProductQuery()
    this.setData({searchText:'',categoryFilterIndex:0,queryControls:queryChoices.map(c=>({...c,index:0}))})
    this.refresh()
  },
  chooseQueryFilter(e:any) {
    if(this.data.batchBusy)return
    const key=String(e.currentTarget.dataset.key), index=Number(e.detail.value)
    const choice=queryChoices.find(c=>c.key===key)
    if(!choice || !Number.isInteger(index) || !choice.values[index])return
    this.invalidateQuery()
    ;(this.query as any)[key]=choice.values[index]
    this.setData({queryControls:this.data.queryControls.map(c=>c.key===key?{...c,index}:c)})
    this.refresh()
  },
  chooseQueryCategory(e:any) {
    if(this.data.batchBusy)return
    const index=Number(e.detail.value),category=this.data.categoryFilters[index]
    if(!category)return
    this.invalidateQuery()
    this.query.categoryId=category.id
    this.setData({categoryFilterIndex:index})
    this.refresh()
  },
  renderCatalog() {
    const products:Product[]=[], drafts:ProductDraft[]=[]
    const entries=this.catalogItems.map(entry=>{
      if(entry.kind==='draft') {
        drafts.push(entry.draft)
        return {id:entry.draft.id,payload:{productName:entry.draft.payload.productName},kind:'draft',entryKey:'draft:'+entry.draft.id}
      }
      const p=entry.product
      products.push(p)
      return {id:p.id,name:p.name,price:p.price,imageUrl:p.imageUrl || '',soldOut:!!p.soldOut,publishAt:p.publishAt || '',
        kind:'product',entryKey:'product:'+p.id,pendingPublication:productIsPending(p),
        statusLabel:productIsPending(p)?'待定时上架':productIsPublished(p)?'已上架':'已下架',
        publishTimeText:p.publishAt?formatPublishTime(p.publishAt,this.data.storeTimeZone):'',
        inventoryLabel:p.stockMode!=='finite'?'不限库存':Number(p.stockQuantity)===0?'缺货（库存为零）':
          '库存 '+p.stockQuantity+(Number(p.stockQuantity)<=Number(p.lowStockThreshold || 0)?' · 低库存预警':'')}
    })
    this.catalogProducts=products
    // Keep descriptions/raw drafts out of the view bridge; append only the new page.
    const update:Record<string,any>={products:products.map(p=>({id:p.id})),drafts:drafts.map(d=>({id:d.id,version:d.version}))}
    if(!this.data.entries.length)update.entries=entries
    else entries.slice(this.data.entries.length).forEach((entry,index)=>{update['entries['+(this.data.entries.length+index)+']']=entry})
    this.setData(update)
    this.setBatchSelection(this.data.batchSelectedIds.filter(id=>products.some(p=>p.id===id)))
  },
  openDraft(e: any) {
    if (this.data.batchMode || this.data.batchBusy || this.data.cloudLoading || this.data.queryDirty) return
    if (!this.data.drafts.some(d=>d.id===String(e.currentTarget.dataset.id))) return
    wx.navigateTo({url:'/pages/admin-product-form/admin-product-form?draftId=' + encodeURIComponent(String(e.currentTarget.dataset.id))})
  },
  async discardDraft(e: any) {
    if (this.data.batchMode || this.data.batchBusy || this.data.cloudLoading || this.data.queryDirty) return
    const draft = this.data.drafts.find(d => d.id === String(e.currentTarget.dataset.id))
    if (!draft) return
    const context = catalogContextKey()
    this.setData({batchBusy:true})
    try {
      const confirmed = await new Promise<boolean>(resolve => wx.showModal({title:'放弃草稿？',content:'放弃后不可恢复，关联图片不会删除。',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
      if (!confirmed) return
      if (catalogContextKey() !== context || context !== this.data.catalogContext) throw new Error('context_changed')
      const cfg = merchantCloudConfig()
      if (cfg) await discardMerchantCloudDraft(cfg,draft.id,draft.version)
      else {
        const store = loadStore()
        const current = (store.drafts || []).find(d=>d.id===draft.id)
        if (!current || current.version !== draft.version) throw new Error('draft_changed')
        store.drafts = (store.drafts || []).filter(d=>d.id!==draft.id)
        saveStore(store)
      }
      await this.refresh()
      wx.showToast({title:'草稿已放弃',icon:'success'})
    } catch (_) { wx.showToast({title:'放弃失败，请刷新后重试',icon:'none'}) }
    finally { this.setData({batchBusy:false}) }
  },
  openNewProduct() { if (!this.data.batchMode && !this.data.batchBusy) wx.navigateTo({ url: '/pages/admin-product-form/admin-product-form' }) },
  openCopyProduct(e: any) {
    if (this.data.batchMode || this.data.batchBusy || this.data.cloudLoading || this.data.cloudError || this.data.queryDirty) return
    const id = String(e.currentTarget.dataset.id || '')
    if (!this.data.products.some(product => product.id === id)) return
    wx.navigateTo({ url: '/pages/admin-product-form/admin-product-form?copyFrom=' + encodeURIComponent(id) })
  },
  openEditProduct(e: any) {
    if (this.data.batchBusy || this.data.cloudLoading || this.data.queryDirty) return
    if (this.data.batchMode) { this.toggleBatchProduct(e); return }
    const id = String(e.currentTarget.dataset.id || '');
    if (id) wx.navigateTo({ url: '/pages/admin-product-form/admin-product-form?id=' + encodeURIComponent(id) });
  },
  data: {
    searchText: '',
    queryDirty: false,
    queryControls: queryChoices.map(c=>({...c,index:0})),
    categoryFilters: [{id:'',name:'全部分类'}] as Category[],
    categoryFilterIndex: 0,
    entries: [] as any[],
    hasMore: false,
    loadingMore: false,
    moreError: '',
    refreshRequired: false,
    drafts: [] as Array<{id:string;version:number}>,
    storeTimeZone: 'Asia/Shanghai',
    batchMode: false,
    batchBusy: false,
    batchSelectedIds: [] as string[],
    batchSelected: {} as Record<string, boolean>,
    batchSelectedCount: 0,
    batchAllSelected: false,
    batchProgress: '',
    batchResult: '',
    batchCategoryId: '',
    batchCategoryName: '',
    catalogContext: '',
    // UNIFIED_PLACEHOLDER_THUMB_V1
    showProductForm: false,
    adminSection: '',
    placeholderStyle: 'premium',
    customPlaceholderUrl: '',
    placeholderStyleIndex: 4,
    placeholderStyleNames: ['经典图案', '山峰插画', '购物袋', '彩色礼盒', '精品礼盒', '自定义图片'],
    categories: [] as Category[],
    products: [] as Array<{id:string}>,
    categoryName: '',
    productName: '',
    productDescription: '',
    productImageUrl: '',
    isSoldOut: false,
    priceText: '',
    discountText: '',
    startText: '',
    endText: '',
    selectedCategory: '',
    selectedCategoryName: '',
    editId: '',
    isAvailable: true, cloudError: '', cloudLoading: false
  },
  toggleAdminSection(e: any) {
    const section = String(e.currentTarget.dataset.section || '')
    if (['placeholder', 'categories', 'product', 'saved'].indexOf(section) < 0) return
    this.setData({ adminSection: this.data.adminSection === section ? '' : section })
  },    openNewProductForm() {
    this.resetForm()
    this.setData({ showProductForm: true })
  },
  closeProductForm() {
    this.resetForm()
    this.setData({ showProductForm: false })
  },  onShow() {
    if (this.data.batchBusy) return
    this.setData({ placeholderStyle: String(wx.getStorageSync('stall_placeholder_style_v1') || 'premium'), customPlaceholderUrl: String(wx.getStorageSync('stall_placeholder_custom_v1') || '') })
 this.refresh() },
  uploadCustomPlaceholder() {
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], success: (result: any) => {
      const item = result.tempFiles && result.tempFiles[0]
      if (!item || !item.tempFilePath) return
      const oldPath = String(wx.getStorageSync('stall_placeholder_custom_v1') || '')
      wx.saveFile({ tempFilePath: item.tempFilePath, success: (saved: any) => {
        if (oldPath && oldPath !== saved.savedFilePath) wx.removeSavedFile({ filePath: oldPath, fail: () => {} })
        wx.setStorageSync('stall_placeholder_custom_v1', saved.savedFilePath)
        wx.setStorageSync('stall_placeholder_style_v1', 'custom')
        this.setData({customPlaceholderUrl:saved.savedFilePath,placeholderStyle:'custom',placeholderStyleIndex:5})
        wx.showToast({title:'已保存自定义图',icon:'success'})
      }, fail: () => wx.showToast({title:'保存失败',icon:'none'}) })
    } })
  },
  removeCustomPlaceholder() {
    const path = String(wx.getStorageSync('stall_placeholder_custom_v1') || '')
    if(path) wx.removeSavedFile({filePath:path,fail:()=>{}})
    wx.removeStorageSync('stall_placeholder_custom_v1')
    wx.setStorageSync('stall_placeholder_style_v1', 'premium')
    this.setData({customPlaceholderUrl:'',placeholderStyle:'premium',placeholderStyleIndex:4})
  },
  changePlaceholderStyle(e: any) {
    const styles = ['classic','mountain','bag','playful','premium','custom']
    const n = Number(e.detail.value)
    if (!Number.isInteger(n) || n < 0 || n >= styles.length) return
    wx.setStorageSync('stall_placeholder_style_v1', styles[n])
    this.setData({ placeholderStyle: styles[n], placeholderStyleIndex: n })
    wx.showToast({ title: 'Style saved', icon: 'success' })
  },
  async refresh(): Promise<boolean> {
    if(this.data.catalogContext && this.data.catalogContext!==catalogContextKey()) {
      this.query=defaultProductQuery()
      this.setData({searchText:'',batchMode:false,categories:[],categoryFilters:[{id:'',name:'全部分类'}],categoryFilterIndex:0,queryControls:queryChoices.map(c=>({...c,index:0}))})
    }
    if(this.data.queryDirty)this.setData({batchMode:false})
    this.query.q=this.data.searchText.trim()
    return this.fetchCatalogPage(true)
  },
  async loadMore() {
    if(this.data.batchBusy || this.data.queryDirty || this.data.refreshRequired || this.data.cloudLoading || this.data.loadingMore || !this.data.hasMore)return
    await this.fetchCatalogPage(false)
  },
  async fetchCatalogPage(reset:boolean):Promise<boolean> {
    const context=catalogContextKey(), serial=++this.requestSerial, query={...this.query}
    const cfg=merchantCloudConfig()
    if(reset) {
      this.setBatchSelection([])
      this.catalogItems=[]; this.localItems=[]; this.nextCursor=''; this.localOffset=0
      this.setData({entries:[],products:[],drafts:[],cloudLoading:true,loadingMore:false,cloudError:'',moreError:'',
        hasMore:false,refreshRequired:false,queryDirty:false,catalogContext:context,batchCategoryId:'',batchCategoryName:''})
    } else this.setData({loadingMore:true,moreError:''})
    const current=()=>serial===this.requestSerial && context===catalogContextKey()
    try {
      let items:MerchantCatalogItem[], hasMore:boolean, nextCursor='', timeZone=this.data.storeTimeZone
      let categories:Category[]|null=null
      if(cfg) {
        const [page,categoryContext]=await Promise.all([merchantCloudProductPage(cfg,query,reset?'':this.nextCursor),
          reset?merchantCloudCategoryContext(cfg):Promise.resolve(null)])
        items=page.items; hasMore=page.hasMore; nextCursor=page.nextCursor; timeZone=page.timeZone
        if(categoryContext)categories=categoryContext.categories
      } else {
        if(reset) {
          const store=loadStore()
          this.localItems=localMerchantQuery(store,query)
          categories=store.categories; timeZone=store.timeZone || 'Asia/Shanghai'
        }
        items=this.localItems.slice(this.localOffset,this.localOffset+30)
        hasMore=this.localOffset+items.length<this.localItems.length
      }
      if(!current()) {
        if(serial===this.requestSerial)this.setData({entries:[],products:[],drafts:[],cloudLoading:false,loadingMore:false,queryDirty:true,cloudError:'店铺环境已变化，请重新搜索'})
        return false
      }
      const seen:Record<string,boolean>={}
      this.catalogItems.forEach(e=>{seen[e.kind+':'+(e.kind==='product'?e.product.id:e.draft.id)]=true})
      items.forEach(e=>{const key=e.kind+':'+(e.kind==='product'?e.product.id:e.draft.id);if(!seen[key]){seen[key]=true;this.catalogItems.push(e)}})
      this.localOffset+=items.length; this.nextCursor=nextCursor
      const categoryFilters=categories?[{id:'',name:'全部分类'},...categories]:this.data.categoryFilters
      if(query.categoryId && !categoryFilters.some(c=>c.id===query.categoryId))categoryFilters.push({id:query.categoryId,name:'原分类（已不可用）'})
      this.setData({hasMore,storeTimeZone:timeZone,cloudLoading:false,loadingMore:false,cloudError:'',moreError:'',
        ...(categories?{categories,categoryFilters,categoryFilterIndex:Math.max(0,categoryFilters.findIndex(c=>c.id===query.categoryId))}:{})})
      this.renderCatalog()
      return true
    } catch(error) {
      if(serial===this.requestSerial && context!==catalogContextKey()) {
        this.setBatchSelection([])
        this.setData({entries:[],products:[],drafts:[],cloudLoading:false,loadingMore:false,queryDirty:true,cloudError:'店铺环境已变化，请重新搜索'})
        return false
      }
      const refreshRequired=String(error).indexOf('catalog_changed_or_cursor_expired_refresh')>=0 || String(error).indexOf('invalid_or_expired_cursor_refresh')>=0
      if(current() && refreshRequired) {
        this.setBatchSelection([])
        this.setData({batchMode:false,queryDirty:true})
      }
      if(current())this.setData(reset?{cloudLoading:false,cloudError:'商品查询失败，请检查权限、后端版本及迁移状态后重试'}:
        {loadingMore:false,refreshRequired,moreError:refreshRequired?'店铺数据已变化或分页已过期，请刷新列表':'加载失败，请重试加载更多'})
      return false
    }
  },
  setBatchSelection(ids: string[]) {
    const selected: Record<string, boolean> = {}
    ids.forEach(id => { selected[id] = true })
    this.setData({ batchSelectedIds: ids, batchSelected: selected, batchSelectedCount: ids.length,
      batchAllSelected: this.data.products.length > 0 && ids.length === this.data.products.length })
  },
  toggleBatchMode() {
    if (this.data.batchBusy || this.data.cloudLoading || this.data.queryDirty || (!this.data.batchMode && !this.data.products.length)) return
    this.setBatchSelection([])
    this.setData({ batchMode: !this.data.batchMode, batchResult: '', batchCategoryId: '', batchCategoryName: '' })
  },
  toggleBatchProduct(e: any) {
    if (!this.data.batchMode || this.data.batchBusy || this.data.cloudLoading || this.data.queryDirty) return
    const id = String(e.currentTarget.dataset.id || '')
    if (!this.data.products.some(p => p.id === id)) return
    const ids = this.data.batchSelectedIds
    this.setBatchSelection(ids.indexOf(id) >= 0 ? ids.filter(x => x !== id) : ids.concat(id))
  },
  toggleBatchAll() {
    if (this.data.batchBusy || this.data.cloudLoading || this.data.queryDirty) return
    this.setBatchSelection(this.data.batchAllSelected ? [] : this.data.products.map(p => p.id))
  },
  chooseBatchCategory(e: any) {
    if (this.data.batchBusy) return
    const category = this.data.categories[Number(e.detail.value)]
    if (category) this.setData({ batchCategoryId: category.id, batchCategoryName: category.name })
  },
  async runBatchAction(e: any) {
    if (!this.data.batchMode || this.data.batchBusy || this.data.cloudLoading || this.data.cloudError || this.data.queryDirty || this.data.loadingMore) return
    const ids = this.data.batchSelectedIds.slice()
    if (!ids.length) { wx.showToast({ title: '请先选择商品', icon: 'none' }); return }
    const action = String(e.currentTarget.dataset.action || '')
    let patch: MerchantProductBatchPatch
    let label: string
    switch (action) {
      case 'activate': patch = { active: true }; label = '批量上架'; break
      case 'deactivate': patch = { active: false }; label = '批量下架'; break
      case 'soldOut': patch = { soldOut: true }; label = '批量标记售罄'; break
      case 'inStock': patch = { soldOut: false }; label = '批量恢复有货'; break
      case 'category':
        if (!this.data.categories.some(c => c.id === this.data.batchCategoryId)) {
          wx.showToast({ title: '请先选择目标分类', icon: 'none' }); return
        }
        patch = { categoryId: this.data.batchCategoryId }; label = '批量修改分类'; break
      default: return
    }
    const cfg = merchantCloudConfig()
    const context = catalogContextKey()
    if (context !== this.data.catalogContext) {
      wx.showToast({ title: '店铺或模式已变化，请刷新', icon: 'none' }); await this.refresh(); return
    }
    // Lock before confirmation, so repeated taps cannot open duplicate submissions.
    this.setData({ batchBusy: true })
    try {
      const confirmed = await new Promise<boolean>(resolve => wx.showModal({
        title: label,
        content: `已选择 ${ids.length} 件商品，确定${label}${action === 'category' ? '为「' + this.data.batchCategoryName + '」' : ''}？` + (action === 'deactivate' ? '手动下架会取消这些商品的定时计划。' : (action === 'activate' ? '尚未到期的定时商品会失败，请先在编辑页取消计划。' : '')),
        success: result => resolve(result.confirm), fail: () => resolve(false)
      }))
      if (!confirmed) return
      let succeeded = 0
      const failedIds: string[] = []
      this.setData({ batchResult: '', batchProgress: `正在处理 0/${ids.length} 件` })
      if (cfg) {
        for (let index = 0; index < ids.length; index++) {
          try {
            if (catalogContextKey() !== context) throw new Error('merchant_context_changed')
            await patchMerchantCloudProduct(cfg, ids[index], patch)
            succeeded++
          } catch (_) { failedIds.push(ids[index]) }
          this.setData({ batchProgress: `正在处理 ${index + 1}/${ids.length} 件` })
        }
      } else {
        try {
          if (catalogContextKey() !== context) throw new Error('merchant_context_changed')
          const store = loadStore()
          if ('categoryId' in patch) {
            const categoryId = patch.categoryId
            if (!store.categories.some(c => c.id === categoryId)) throw new Error('category_missing')
          }
          store.products = store.products.map(product => {
            if (ids.indexOf(product.id) < 0) return product
            if ('active' in patch && patch.active && productIsPending(product)) { failedIds.push(product.id); return product }
            return { ...product, ...('active' in patch ? { available: patch.active, publishAt:null } : patch), version:(product.version || 1)+1,updatedAt:new Date().toISOString() }
          })
          const existingIds = ids.filter(id => store.products.some(p => p.id === id))
          saveStore(store)
          succeeded = existingIds.length - failedIds.length
          failedIds.push(...ids.filter(id => existingIds.indexOf(id) < 0))
        } catch (_) { failedIds.splice(0,failedIds.length,...ids) }
      }
      const refreshed = await this.refresh()
      if (refreshed && catalogContextKey() === context) {
        this.setBatchSelection(failedIds.filter(id => this.data.products.some(p => p.id === id)))
      }
      const result = `已选 ${ids.length} 件：成功 ${succeeded} 件，失败 ${failedIds.length} 件。` +
        (failedIds.length && cfg ? '失败包含网络异常时未能确认的结果，请核对列表后重试。' : '') +
        (!refreshed ? '列表刷新失败，请重新进入页面核对。' : '')
      this.setData({ batchResult: result })
      wx.showModal({ title: failedIds.length ? '批量操作有失败' : '批量操作完成', content: result, showCancel: false })
    } finally {
      this.setData({ batchBusy: false, batchProgress: '' })
    }
  },
  inputCategory(e: any) { this.setData({ categoryName: e.detail.value }) },
  addCategory() {
    const name = this.data.categoryName.trim()
    if (!name) { wx.showToast({ title: '请输入分类名', icon: 'none' }); return }
    const store = loadStore()
    if (store.categories.some(c => c.name === name)) { wx.showToast({ title: '分类已存在', icon: 'none' }); return }
    const id = newId()
    store.categories.push({ id, name })
    saveStore(store)
    this.setData({ categoryName: '', selectedCategory: id })
    this.refresh()
  },
  deleteCategory(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    const store = loadStore()
    if (store.products.some(p => p.categoryId === id)) { wx.showToast({ title: '先移动或删除分类里的商品', icon: 'none' }); return }
    wx.showModal({ title: '删除分类？', content: '此操作不可撤销', success: res => {
      if (!res.confirm) return
      store.categories = store.categories.filter(c => c.id !== id)
      saveStore(store)
      this.setData({ selectedCategory: store.categories.length > 0 ? store.categories[0].id : '' })
      this.refresh()
    } })
  },
  inputName(e: any) { this.setData({ productName: e.detail.value }) },
  inputDescription(e: any) { this.setData({ productDescription: e.detail.value }) },
  switchSoldOut(e: any) { this.setData({ isSoldOut: e.detail.value }) },
  chooseProductImage() {
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: res => {
      const tempFilePath = res.tempFilePaths[0]
      if (!tempFilePath) return
      wx.saveFile({ tempFilePath, success: saved => {
        this.setData({ productImageUrl: saved.savedFilePath })
      }, fail: () => wx.showToast({title: '图片保存失败', icon: 'none'}) })
    } })
  },
  removeProductImage() { this.setData({productImageUrl: ''}) },
  inputPrice(e: any) { this.setData({ priceText: e.detail.value }) },
  inputDiscount(e: any) { this.setData({ discountText: e.detail.value }) },
  inputStart(e: any) { this.setData({ startText: e.detail.value }) },
  inputEnd(e: any) { this.setData({ endText: e.detail.value }) },
  selectCategory(e: any) {
    const index = Number(e.detail.value)
  
    const category = this.data.categories[index]
  
    if (!category) return
  
    this.setData({
      selectedCategory: category.id,
      selectedCategoryName: category.name
    })
  },
  switchAvailable(e: any) { this.setData({ isAvailable: e.detail.value }) },
  saveProduct() {
    const name = this.data.productName.trim()
    const price = Number(this.data.priceText)
    const txt = this.data.discountText.trim()
    const discountPrice = txt === '' ? null : Number(txt)
    if (!this.data.selectedCategory || !name || this.data.priceText.trim() === '' || !Number.isFinite(price) || price < 0 || (discountPrice !== null && (!Number.isFinite(discountPrice) || discountPrice < 0 || discountPrice >= price))) {
      { wx.showToast({ title: '请检查名称、价格与折扣价', icon: 'none' }); return }
    }
    const start = this.data.startText.trim()
    const end = this.data.endText.trim()
    const pattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
    if ((start && (!pattern.test(start) || Number.isNaN(Date.parse(start.replace(' ', 'T'))))) || (end && (!pattern.test(end) || Number.isNaN(Date.parse(end.replace(' ', 'T'))))) || (start && end && new Date(start.replace(' ', 'T')).getTime() >= new Date(end.replace(' ', 'T')).getTime())) {
      { wx.showToast({ title: '时间格式错误或结束早于开始', icon: 'none' }); return }
    }
    const store = loadStore()
    const product: Product = { id: this.data.editId || newId(), categoryId: this.data.selectedCategory, name, price, discountPrice, discountStart: start, discountEnd: end, available: this.data.isAvailable, soldOut: this.data.isSoldOut, description: this.data.productDescription.trim(), imageUrl: this.data.productImageUrl }
    const index = store.products.findIndex(p => p.id === product.id)
    if (index >= 0) store.products[index] = product
    else store.products.push(product)
    saveStore(store)
    this.resetForm()
    this.refresh()
    wx.showToast({ title: '保存成功' })
  },
  editProduct(e: WechatMiniprogram.TouchEvent) {
    this.setData({ showProductForm: true })
    const id = String(e.currentTarget.dataset.id)
    const p = loadStore().products.find(p => p.id === id)
    if (!p) return
    this.setData({ editId: p.id, productName: p.name, priceText: String(p.price), discountText: p.discountPrice === null ? '' : String(p.discountPrice), selectedCategory: p.categoryId, 
    selectedCategoryName:
    (this.data.categories.find(
      c => c.id === p.categoryId
    ) || { name: '' }).name,
    startText: p.discountStart, endText: p.discountEnd, isAvailable: p.available, isSoldOut: !!p.soldOut, productDescription: p.description || '', productImageUrl: p.imageUrl || '' })
    },
  deleteProduct(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    wx.showModal({ title: '确定删除商品？', success: res => {
      if (!res.confirm) return
      const store = loadStore()
      store.products = store.products.filter(p => p.id !== id)
      saveStore(store)
      if (this.data.editId === id) this.resetForm()
      this.refresh()
    } })
  },
  resetForm() {
    this.setData({ showProductForm: false })
    this.setData({ editId: '', productName: '', priceText: '', discountText: '', startText: '', endText: '', isAvailable: true, isSoldOut: false, productDescription: '', productImageUrl: '' })
  }
})
