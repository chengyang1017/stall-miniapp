import { loadStore, saveStore, newId, Category, Product, ProductDraft, ProductDraftPayload, InventoryMovement, productIsPublished } from '../../utils/store'
import { merchantCloudConfig, merchantCloudProduct, merchantCloudCategoryContext, merchantCloudDraft, saveMerchantCloudDraft, saveMerchantCloudProduct, archiveMerchantCloudProduct, merchantCloudInventory, adjustMerchantCloudInventory } from '../../utils/cloudMerchantProducts'
import { uploadMerchantImage } from '../../utils/cloudMerchantImage'
import { formatPublishTime, parsePublishTime } from '../../utils/productPublishing'
import { stockInteger, configureDemoInventory, adjustDemoInventory } from '../../utils/inventory'

function formContextKey(): string {
  const cfg = merchantCloudConfig()
  return cfg ? cfg.apiBase + '/' + cfg.storeSlug : 'local-demo'
}

function copyProductName(name: string): string {
  // Keep the default within the existing cloud API's 200-character limit.
  return name.slice(0, 195) + ' - 副本'
}

Page({
  inventoryRequestKey:'',
  inventorySnapshot:'unlimited|0|5',
  inventoryAdjustment:{fingerprint:'',key:''},
  pendingInventory:null as null | {stockMode:'unlimited'|'finite';stockQuantity:number;lowStockThreshold:number;expectedInventoryVersion:number;reason:string;requestKey:string},
  inventorySignature():string { return [this.data.stockMode,this.data.stockQuantityText,this.data.lowStockThresholdText].join('|') },
  loadInventory(product: {stockMode?:'finite'|'unlimited';stockQuantity?:number;lowStockThreshold?:number;inventoryVersion?:number}) {
    this.setData({stockMode:product.stockMode || 'unlimited',stockQuantityText:String(product.stockQuantity || 0),
      lowStockThresholdText:String(product.lowStockThreshold === undefined ? 5 : product.lowStockThreshold),inventoryVersion:product.inventoryVersion || 1})
    this.inventorySnapshot=this.inventorySignature()
  },
  changeStockMode(e:any){this.setData({stockMode:e.detail.value?'finite':'unlimited'})},
  inputStockQuantity(e:any){this.setData({stockQuantityText:String(e.detail.value)})},
  inputStockThreshold(e:any){this.setData({lowStockThresholdText:String(e.detail.value)})},
  inputStockDelta(e:any){this.setData({stockDeltaText:String(e.detail.value)})},
  inputStockReason(e:any){this.setData({stockReason:String(e.detail.value)})},
  async refreshInventory() {
    if(!this.data.editId || this.data.copyMode || this.data.draftId)return
    const cfg=merchantCloudConfig()
    if(formContextKey()!==this.loadedContext)throw new Error('店铺或模式已变化')
    let movements:InventoryMovement[]
    if(cfg){
      const result=await merchantCloudInventory(cfg,this.data.editId)
      if(formContextKey()!==this.loadedContext)throw new Error('店铺已变化')
      this.loadInventory(result.product);movements=result.movements
    }else{
      const store=loadStore(),product=store.products.find(p=>p.id===this.data.editId)
      if(!product)throw new Error('商品不存在')
      this.loadInventory(product)
      movements=(store.inventoryMovements || []).filter(m=>m.productId===product.id).slice().reverse().slice(0,100)
    }
    const labels:Record<string,string>={manual:'商家手动',order:'订单预留',cancel:'取消释放',expiry:'到期释放',payment:'付款确认',payment_failed:'支付失败释放'}
    this.setData({stockMovements:movements.map(m=>({...m,timeText:formatPublishTime(m.createdAt,'Asia/Shanghai')+' 北京时间',sourceText:labels[m.source] || m.source}))})
  },
  async showInventoryHistory(){
    if(this.data.inventoryBusy || this.data.saveBusy || this.data.cloudBusy)return
    if(this.inventorySignature()!==this.inventorySnapshot){wx.showToast({title:'请先保存库存设置，再刷新记录',icon:'none'});return}
    this.setData({inventoryBusy:true})
    try{await this.refreshInventory();this.inventoryAdjustment={fingerprint:'',key:''};this.setData({showStockHistory:!this.data.showStockHistory})}
    catch(_){wx.showToast({title:'库存读取失败，请重试',icon:'none'})}
    finally{this.setData({inventoryBusy:false})}
  },
  async adjustStock(e:any){
    if(this.data.inventoryBusy||this.data.saveBusy||this.data.cloudBusy||this.data.saved||!this.data.editId||this.data.copyMode||this.data.draftId)return
    if(this.inventorySignature()!==this.inventorySnapshot){wx.showToast({title:'请先保存库存设置，再调整数量',icon:'none'});return}
    let delta:number
    try{delta=stockInteger(this.data.stockDeltaText);if(!delta)throw new Error('补货或扣减数量必须大于零')}
    catch(error:any){wx.showToast({title:error.message,icon:'none'});return}
    if(String(e.currentTarget.dataset.action)==='subtract')delta=-delta
    const reason=this.data.stockReason.trim()
    if(!reason){wx.showToast({title:'请填写库存操作原因',icon:'none'});return}
    const fingerprint=JSON.stringify({id:this.data.editId,delta,reason})
    if(fingerprint!==this.inventoryAdjustment.fingerprint)this.inventoryAdjustment={fingerprint,key:newId()}
    this.setData({inventoryBusy:true})
    try{
      const confirmed=await new Promise<boolean>(resolve=>wx.showModal({title:delta>0?'确认补货':'确认扣减库存',content:`${delta>0?'补货':'扣减'} ${Math.abs(delta)} 件，仅调整库存，不解除手动售罄。`,success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
      if(!confirmed)return
      if(formContextKey()!==this.loadedContext)throw new Error('店铺或模式已变化')
      const cfg=merchantCloudConfig()
      if(cfg)await adjustMerchantCloudInventory(cfg,this.data.editId,delta,reason,this.data.inventoryVersion,this.inventoryAdjustment.key)
      else adjustDemoInventory(this.data.editId,delta,this.data.inventoryVersion,reason)
      await this.refreshInventory()
      this.inventoryAdjustment={fingerprint:'',key:''}
      this.setData({stockDeltaText:''})
      wx.showToast({title:'库存已更新',icon:'success'})
    }catch(error:any){wx.showModal({title:'库存操作未确认',content:'请核对当前库存及记录后重试。'+String(error.message || '').slice(0,100),showCancel:false})}
    finally{this.setData({inventoryBusy:false})}
  },
  draftClientKey: '',
  scheduleCancelled: false,
  loadedSchedule: { publishAt:null as string | null, date:'', time:'' },
  pendingPublishAt: null as string | null,
  restoreDraft(draft: ProductDraft, categories: Category[]) {
    const p = draft.payload
    const category = categories.find(c=>c.id===p.selectedCategory)
    this.cloudImageKey = p.imageObjectKey || null
    this.cloudExistingImageUrl = this.data.cloudMode ? draft.imageUrl || '' : p.productImageUrl || ''
    this.copyDiscountTimes = {start:p.discountStartUtc || null,end:p.discountEndUtc || null,
      startText:p.discountStartUtc === undefined ? '' : p.startText,
      endText:p.discountEndUtc === undefined ? '' : p.endText}
    this.setData({ draftId:draft.id, draftVersion:draft.version, categories, editId:'', copyMode:false,
      productName:p.productName, productDescription:p.productDescription, selectedCategory:p.selectedCategory,
      selectedCategoryName:category ? category.name : '', priceText:p.priceText, discountText:p.discountText,
      startText:p.startText, endText:p.endText, productImageUrl:this.cloudExistingImageUrl,
      isAvailable:p.isAvailable, isSoldOut:p.isSoldOut,
      scheduleEnabled:p.scheduleEnabled, scheduleDate:p.scheduleDate, scheduleTime:p.scheduleTime })
    this.setData({stockMode:p.stockMode || 'unlimited',stockQuantityText:p.stockQuantityText === undefined ? '0' : p.stockQuantityText,lowStockThresholdText:p.lowStockThresholdText === undefined ? '5' : p.lowStockThresholdText})
    wx.setNavigationBarTitle({title:'编辑商品草稿'})
  },
  draftPayload(): ProductDraftPayload {
    return { productName:this.data.productName, productDescription:this.data.productDescription,
      selectedCategory:this.data.selectedCategory, priceText:this.data.priceText, discountText:this.data.discountText,
      startText:this.data.startText, endText:this.data.endText, imageObjectKey:this.cloudImageKey,
      productImageUrl:this.data.cloudMode ? '' : this.data.productImageUrl,
      isAvailable:this.data.isAvailable, isSoldOut:this.data.isSoldOut,
      scheduleEnabled:this.data.scheduleEnabled, scheduleDate:this.data.scheduleDate, scheduleTime:this.data.scheduleTime,
      stockMode:this.data.editId?'unlimited':this.data.stockMode,stockQuantityText:this.data.editId?'0':this.data.stockQuantityText,
      lowStockThresholdText:this.data.lowStockThresholdText,
      ...(this.data.startText === this.copyDiscountTimes.startText ? {discountStartUtc:this.copyDiscountTimes.start} : {}),
      ...(this.data.endText === this.copyDiscountTimes.endText ? {discountEndUtc:this.copyDiscountTimes.end} : {}) }
  },
  async saveDraft() {
    if (this.data.cloudBusy || this.data.saveBusy || this.data.inventoryBusy || this.data.saved || this.data.cloudError) return
    if (formContextKey() !== this.loadedContext) { wx.showToast({title:'店铺或模式已变化，请返回列表',icon:'none'}); return }
    this.setData({saveBusy:true})
    try {
      const cfg = merchantCloudConfig()
      const payload = this.draftPayload()
      if (cfg) {
        const result = await saveMerchantCloudDraft(cfg,this.data.draftId,this.data.draftVersion,payload,this.draftClientKey)
        this.setData({draftId:result.id,draftVersion:result.version,editId:'',copyMode:false})
      } else {
        const store = loadStore()
        store.drafts = store.drafts || []
        const id = this.data.draftId || 'draft-' + this.draftClientKey
        const index = store.drafts.findIndex(d=>d.id===id)
        if (this.data.draftId && (index < 0 || store.drafts[index].version !== this.data.draftVersion)) throw new Error('draft_changed_reload')
        const draft: ProductDraft = {id,payload,version:index<0?1:store.drafts[index].version+1,createdAt:index<0?new Date().toISOString():store.drafts[index].createdAt,updatedAt:new Date().toISOString()}
        if (index<0) store.drafts.push(draft); else store.drafts[index]=draft
        saveStore(store)
        this.setData({draftId:id,draftVersion:draft.version,editId:'',copyMode:false})
      }
      this.setData({saved:true})
      wx.showToast({title:'草稿已保存',icon:'success'})
      wx.navigateBack({delta:1})
    } catch (error: any) {
      wx.showModal({title:'草稿保存未确认',content:'表单内容已保留。若版本冲突，请返回列表重新打开草稿；若首次保存超时，请先核对草稿列表。' + String(error && error.message || '').slice(0,100),showCancel:false})
    } finally { this.setData({saveBusy:false}) }
  },
  changeSchedule(e: any) {
    this.scheduleCancelled = !e.detail.value
    this.setData({scheduleEnabled:!!e.detail.value,isAvailable:false})
  },
  changeScheduleDate(e: any) { this.setData({scheduleDate:String(e.detail.value)}) },
  changeScheduleTime(e: any) { this.setData({scheduleTime:String(e.detail.value)}) },
  cancelSchedule() { this.scheduleCancelled = true; this.setData({scheduleEnabled:false,scheduleDate:'',scheduleTime:'',isAvailable:false}) },
  loadSchedule(publishAt: string | null | undefined, version: number | undefined, serverPending?: boolean) {
    const pending = serverPending === undefined ? !!publishAt && Date.parse(publishAt)>Date.now() : serverPending
    const text = pending ? formatPublishTime(publishAt!,this.data.storeTimeZone) : ''
    this.loadedSchedule = {publishAt:publishAt || null,date:text.slice(0,10),time:text.slice(11,16)}
    this.setData({productVersion:version || 1,scheduleEnabled:pending,scheduleDate:text.slice(0,10),scheduleTime:text.slice(11,16)})
  },
  deleteFromForm() {
    if (this.data.copyMode || this.data.saveBusy || this.data.inventoryBusy || this.data.saved) return
    const id = String(this.data.editId || '')
    if (!id) return
    const cfg = merchantCloudConfig()
    if (this.data.cloudMode || cfg) {
      if (!cfg || this.data.cloudBusy) return
      wx.showModal({ title: '下架商品', content: '云端删除为下架，并取消定时计划；历史订单仍会保留。确定继续？', success: async r => {
        if (!r.confirm) return
        this.setData({ cloudBusy: true })
        try { await archiveMerchantCloudProduct(cfg, id); wx.showToast({ title: '已下架', icon: 'success' }); wx.navigateBack({ delta: 1 }) }
        catch (_) { wx.showToast({ title: '下架失败', icon: 'none' }) }
        finally { this.setData({ cloudBusy: false }) }
      } })
      return
    }
    wx.showModal({ title: '删除商品', content: '确定删除这件商品？', success: (result: any) => {
      if (!result.confirm) return
      const store = loadStore()
      if((store.inventoryReservations || []).some(h=>h.productId===id&&h.state==='held')){wx.showToast({title:'商品仍有预留订单，暂不能删除',icon:'none'});return}
      store.products = store.products.filter((item: any) => item.id !== id)
      saveStore(store)
      wx.navigateBack({ delta: 1 })
    } })
  },
  async onLoad(options: any) {
    this.inventoryRequestKey=newId()
    this.draftClientKey = newId()
    const draftId = options && options.draftId ? decodeURIComponent(String(options.draftId)) : ''
    const copyFrom = options && options.copyFrom ? decodeURIComponent(String(options.copyFrom)) : ''
    const copyMode = !!copyFrom
    const id = copyMode ? '' : (options && options.id ? decodeURIComponent(String(options.id)) : '')
    this.loadedContext = formContextKey()
    this.setData({ copyMode })
    if (copyMode) wx.setNavigationBarTitle({ title: '复制商品' })
    const cfg = merchantCloudConfig()
    if (draftId) {
      this.setData({cloudMode:!!cfg,cloudBusy:true})
      try {
        if (cfg) {
          const [context,draft] = await Promise.all([merchantCloudCategoryContext(cfg),merchantCloudDraft(cfg,draftId)])
          if (!draft) throw new Error('draft_not_found')
          this.setData({storeTimeZone:context.timeZone})
          this.restoreDraft(draft,context.categories)
        } else {
          const store = loadStore()
          const draft = (store.drafts || []).find(d=>d.id===draftId)
          if (!draft) throw new Error('draft_not_found')
          this.setData({storeTimeZone:store.timeZone || 'Asia/Shanghai'})
          this.restoreDraft(draft,store.categories)
        }
      } catch (_) { this.setData({cloudError:'草稿读取失败，请返回列表重新打开'}) }
      finally { this.setData({cloudBusy:false}) }
      return
    }
    if (!cfg) {
      this.setData({storeTimeZone:loadStore().timeZone || 'Asia/Shanghai'})
      if (copyMode) {
        try {
          const store = loadStore()
          const source = store.products.find(product => product.id === copyFrom)
          if (!source) throw new Error('source_not_found')
          const category = store.categories.find(item => item.id === source.categoryId)
          this.setData({ categories: store.categories, copySourceName: source.name, editId: '',
            productName: copyProductName(source.name), productDescription: source.description || '',
            selectedCategory: source.categoryId, selectedCategoryName: category ? category.name : '',
            priceText: String(source.price), discountText: source.discountPrice == null ? '' : String(source.discountPrice),
            startText: source.discountStart || '', endText: source.discountEnd || '', productImageUrl: source.imageUrl || '',
            isAvailable: false, isSoldOut: false })
        } catch (_) { this.setData({ cloudError: '复制来源商品读取失败，请返回列表重新选择' }) }
        return
      }
      if (id) { this.refresh(); this.editProduct({ currentTarget: { dataset: { id } } } as any) }
      return
    }
    this.setData({ cloudMode: true, cloudError: '', cloudBusy: true, editId: id })
    try {
      const [context, source] = await Promise.all([merchantCloudCategoryContext(cfg), (id || copyMode) ? merchantCloudProduct(cfg,copyMode?copyFrom:id) : Promise.resolve(null)])
      const categories = context.categories
      this.setData({storeTimeZone:context.timeZone})
      const selected = categories.length ? categories[0] : null
      if (id || copyMode) {
        const p = source
        if (!p) throw new Error('product_not_found')
        const c = categories.find(x => x.id === p.categoryId)
        this.cloudImageKey = p.imageObjectKey || null
        this.cloudExistingImageUrl = p.imageUrl || ''
        this.copyDiscountTimes = { start: p.discountStart || null, end: p.discountEnd || null,
          startText: p.discountStart ? formatPublishTime(p.discountStart,this.data.storeTimeZone) : '',
          endText: p.discountEnd ? formatPublishTime(p.discountEnd,this.data.storeTimeZone) : '' }
        this.setData({ categories, editId: id, copySourceName: copyMode ? p.name : '',
          productName: copyMode ? copyProductName(p.name) : p.name, priceText: (p.priceCents / 100).toFixed(2),
          selectedCategory: p.categoryId || '', selectedCategoryName: c ? c.name : '',
          isAvailable: copyMode ? false : (p.effectiveActive === undefined ? p.active : p.effectiveActive), isSoldOut: copyMode ? false : p.soldOut, productImageUrl: p.imageUrl || '',
          productDescription: p.description || '', discountText: p.discountPriceCents == null ? '' : (p.discountPriceCents / 100).toFixed(2),
          startText: this.copyDiscountTimes.startText,
          endText: this.copyDiscountTimes.endText,
          cloudBusy: false })
        if (!copyMode) this.loadSchedule(p.publishAt,p.version,!!p.publishAt && p.effectiveActive === false)
        if (!copyMode) this.loadInventory(p)
      } else {
        this.cloudImageKey = null
        this.cloudExistingImageUrl = ''
        this.setData({ categories, selectedCategory: selected ? selected.id : '',
          selectedCategoryName: selected ? selected.name : '', cloudBusy: false })
      }
    } catch (_) { this.setData({ cloudError: '云端商品或分类读取失败，请检查商家登录及权限', cloudBusy: false }) }
  },
  async saveFromForm() {
    if (this.data.saveBusy || this.data.inventoryBusy || this.data.saved || this.data.cloudBusy || this.data.cloudError) return
    if (formContextKey() !== this.loadedContext) {
      wx.showModal({ title: '店铺或模式已变化', content: '请返回商品列表重新打开表单，避免保存到其他店铺或模式。', showCancel: false })
      return
    }
    const cfg = merchantCloudConfig()
    try{
      const dirty=!this.data.editId || this.inventorySignature()!==this.inventorySnapshot
      this.pendingInventory=dirty?{stockMode:this.data.stockMode,stockQuantity:this.data.stockMode==='finite'?stockInteger(this.data.stockQuantityText):0,
        lowStockThreshold:stockInteger(this.data.lowStockThresholdText),expectedInventoryVersion:this.data.inventoryVersion,
        reason:this.data.stockReason.trim() || '商品库存设置',requestKey:this.inventoryRequestKey}:null
    }catch(error:any){wx.showToast({title:error.message,icon:'none'});return}
    const preserveSchedule = !!this.data.editId && !!this.loadedSchedule.publishAt && this.data.scheduleEnabled && !this.scheduleCancelled &&
      this.data.scheduleDate === this.loadedSchedule.date && this.data.scheduleTime === this.loadedSchedule.time
    try {
      this.pendingPublishAt = preserveSchedule ? this.loadedSchedule.publishAt :
        (this.data.scheduleEnabled ? parsePublishTime(this.data.scheduleDate,this.data.scheduleTime,this.data.storeTimeZone,!cfg) : null)
    } catch (error: any) { wx.showToast({title:String(error.message || '上架时间无效'),icon:'none'}); return }
    if (this.data.cloudMode || cfg) {
      if (!cfg || this.data.cloudBusy || this.data.cloudError) return
      const name = String(this.data.productName || '').trim()
      const priceText = String(this.data.priceText || '').trim()
      const price = Number(priceText)
      const priceCents = Math.round(price * 100)
      if (!name || !this.data.selectedCategory || !priceText || !Number.isFinite(price) || price < 0 ||
          !Number.isSafeInteger(priceCents) || priceCents > 100000000 || Math.abs(price * 100 - priceCents) > 0.00001) {
        { wx.showToast({ title: '请检查名称、分类和价格（最多两位小数）', icon: 'none' }); return }
      }
      // PHASE31_DISCOUNT_CLOUD: preserve existing form validation and serialize times explicitly.
      const description = String(this.data.productDescription || '').trim()
      const discountRaw = String(this.data.discountText || '').trim()
      const discountNumber = Number(discountRaw)
      const discountCents = Math.round(discountNumber * 100)
      if (description.length > 1000 || (discountRaw && (!Number.isFinite(discountNumber) || discountNumber < 0 || !Number.isSafeInteger(discountCents) || discountCents >= priceCents || Math.abs(discountNumber * 100 - discountCents) > 0.00001))) {
        { wx.showToast({ title: 'Please check discount price', icon: 'none' }); return }
      }
      const parseLocalTime = (raw: string): string | null | false => {
        const input = raw.trim()
        if (!input) return null
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input)) return false
        try { return parsePublishTime(input.slice(0,10),input.slice(11),this.data.storeTimeZone,false) }
        catch (_) { return false }
      }
      // Unedited product/copy/draft times keep their original UTC precision.
      const discountStart = this.data.startText === this.copyDiscountTimes.startText
        ? this.copyDiscountTimes.start : parseLocalTime(String(this.data.startText || ''))
      const discountEnd = this.data.endText === this.copyDiscountTimes.endText
        ? this.copyDiscountTimes.end : parseLocalTime(String(this.data.endText || ''))
      if (discountStart === false || discountEnd === false || (discountStart && discountEnd && Date.parse(discountStart) >= Date.parse(discountEnd))) {
        { wx.showToast({ title: 'Invalid discount time', icon: 'none' }); return }
      }
      if (String(this.data.productImageUrl || '') !== this.cloudExistingImageUrl) {
        { wx.showModal({ title: '图片尚未接通', content: '云端图片上传尚未连接此表单。请先保留原图，或等待图片上传功能完成。', showCancel: false }); return }
      }
      this.setData({ cloudBusy: true, saveBusy: true })
      try {
        const result = await saveMerchantCloudProduct(cfg, this.data.copyMode ? '' : String(this.data.editId || ''), {
          name, categoryId: this.data.selectedCategory, priceCents,
          description, discountPriceCents: discountRaw ? discountCents : null, discountStart, discountEnd,
          active: this.data.scheduleEnabled ? false : !!this.data.isAvailable, soldOut: !!this.data.isSoldOut,
          imageObjectKey: this.cloudImageKey,
          ...(this.data.editId ? {expectedVersion:this.data.productVersion} : {}),
          cancelSchedule:this.scheduleCancelled,
          ...(!preserveSchedule ? {
            publishLocalTime:this.data.scheduleEnabled ? this.data.scheduleDate + ' ' + this.data.scheduleTime : null,
            publishTimeZone:this.data.storeTimeZone
          } : {}),
          ...(this.data.draftId ? {sourceDraftId:this.data.draftId,expectedDraftVersion:this.data.draftVersion} : {}),
          ...(this.pendingInventory ? {inventory:this.pendingInventory} : {})
        })
        if (!result || typeof result.id !== 'string' || !result.id) throw new Error('unconfirmed_save')
        this.setData({ saved: true })
        wx.showToast({ title: '已保存至云端', icon: 'success' })
        wx.navigateBack({ delta: 1 })
      } catch (error: any) {
        const message = String(error && error.message || '')
        const content = /changed_reload|already_published_reload/.test(message)
          ? '商品或草稿已被其他操作修改，表单内容已保留。请返回列表重新打开，避免覆盖较新的内容。'
          : /publish_time|invalid_schedule|local_time/.test(message)
          ? '上架时间或时区未通过服务端校验，请选择未来的有效店铺时间后重试。表单内容已保留。'
          : '表单内容已保留。请检查权限及网络；若请求超时，服务端可能已创建商品，请先返回列表核对，避免重复创建。'
        wx.showModal({ title: '云端保存未确认', content, showCancel: false })
      }
      finally { this.setData({ cloudBusy: false, saveBusy: false }) }
      return
    }
    this.setData({ saveBusy: true })
    try {
      if (this.saveProduct()) {
        this.setData({ saved: true })
        wx.navigateBack({ delta: 1 })
      }
    } catch (_) { wx.showToast({ title: '本地保存失败，内容已保留', icon: 'none' }) }
    finally { this.setData({ saveBusy: false }) }
  },
  cancelCopy() {
    if (this.data.saveBusy || this.data.inventoryBusy || this.data.cloudBusy) return
    wx.navigateBack({ delta: 1 })
  },
  data: {
    stockMode:'unlimited' as 'unlimited'|'finite',stockQuantityText:'0',lowStockThresholdText:'5',inventoryVersion:1,
    stockDeltaText:'',stockReason:'',inventoryBusy:false,showStockHistory:false,
    stockMovements:[] as Array<InventoryMovement & {timeText:string;sourceText:string}>,
    draftId: '',
    draftVersion: 0,
    productVersion: 1,
    storeTimeZone: 'Asia/Shanghai',
    scheduleEnabled: false,
    scheduleDate: '',
    scheduleTime: '',
    copyMode: false,
    copySourceName: '',
    saveBusy: false,
    saved: false,
    showProductForm: false,
    adminSection: '',
    placeholderStyle: 'premium',
    customPlaceholderUrl: '',
    placeholderStyleIndex: 4,
    placeholderStyleNames: ['经典图案', '山峰插画', '购物袋', '彩色礼盒', '精品礼盒', '自定义图片'],
    categories: [] as Category[],
    products: [] as Product[],
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
    isAvailable: true, cloudMode: false, cloudBusy: false, cloudError: ''
  },
  cloudImageKey: null as string | null,
  cloudExistingImageUrl: '',
  loadedContext: '',
  copyDiscountTimes: { start: null as string | null, end: null as string | null, startText: '', endText: '' },
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
  },  onShow() { if (!this.data.copyMode && !this.data.draftId && !merchantCloudConfig()) this.refresh() },
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
  refresh() {
    const styles = ['classic','mountain','bag','playful','premium','custom']
    const savedStyle = String(wx.getStorageSync('stall_placeholder_style_v1') || 'premium')
    const customPlaceholderUrl = String(wx.getStorageSync('stall_placeholder_custom_v1') || '')
    this.setData({ placeholderStyle: savedStyle, placeholderStyleIndex: Math.max(0,styles.indexOf(savedStyle)), customPlaceholderUrl })
    const store = loadStore()
  
    const selectedCategory =
      store.categories.some(
        c => c.id === this.data.selectedCategory
      )
        ? this.data.selectedCategory
        : (store.categories.length > 0 ? store.categories[0].id : '')
  
    const category = store.categories.find(
      c => c.id === selectedCategory
    )
    const selectedCategoryName = category ? category.name : ''
  
    this.setData({
      categories: store.categories,
      products: store.products,
      selectedCategory,
      selectedCategoryName
    })
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
    if (this.data.saveBusy || this.data.inventoryBusy || this.data.saved || this.data.cloudBusy || this.data.cloudError) return
    if (this.data.copyMode && formContextKey() !== this.loadedContext) {
      wx.showToast({ title: '店铺已变化，请返回列表', icon: 'none' }); return
    }
    const cfg = merchantCloudConfig()
    if (!cfg) {
      wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: res => {
        const tempFilePath = res.tempFilePaths[0]
        if (!tempFilePath) return
        wx.saveFile({ tempFilePath, success: saved => {
          this.setData({ productImageUrl: saved.savedFilePath })
        }, fail: () => wx.showToast({title: '图片保存失败', icon: 'none'}) })
      } })
      return
    }
    if (this.data.cloudBusy) return
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: async res => {
      const path = res.tempFilePaths && res.tempFilePaths[0]
      if (!path) return
      this.setData({ cloudBusy: true })
      try {
        const key = await uploadMerchantImage(cfg, path)
        this.cloudImageKey = key
        this.cloudExistingImageUrl = path
        this.setData({ productImageUrl: path })
        wx.showToast({ title: '图片已上传', icon: 'success' })
      } catch (err: any) {
        const message = err && err.message ? String(err.message) : String(err)
        console.error('Merchant image upload failed', message, err)
        wx.showModal({ title: 'Image upload failed', content: message.slice(0, 300), showCancel: false })
      } finally {
        this.setData({ cloudBusy: false })
      }
    } })
  },
  removeProductImage() {
    if (this.data.saveBusy || this.data.saved || this.data.cloudBusy || this.data.cloudError) return
    if (merchantCloudConfig()) {
      this.cloudImageKey = null
      this.cloudExistingImageUrl = ''
    }
    this.setData({productImageUrl: ''})
  },
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
  switchAvailable(e: any) {
    if (e.detail.value && this.data.scheduleEnabled) { wx.showToast({title:'请先取消定时计划再手动上架',icon:'none'}); this.setData({isAvailable:false}); return }
    this.setData({ isAvailable: e.detail.value })
  },
  saveProduct(): boolean {
    const name = this.data.productName.trim()
    const price = Number(this.data.priceText)
    const txt = this.data.discountText.trim()
    const discountPrice = txt === '' ? null : Number(txt)
    if (!this.data.selectedCategory || !name || this.data.priceText.trim() === '' || !Number.isFinite(price) || price < 0 || (discountPrice !== null && (!Number.isFinite(discountPrice) || discountPrice < 0 || discountPrice >= price))) {
      { wx.showToast({ title: '请检查名称、价格与折扣价', icon: 'none' }); return false }
    }
    const start = this.data.startText.trim()
    const end = this.data.endText.trim()
    const pattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
    if ((start && (!pattern.test(start) || Number.isNaN(Date.parse(start.replace(' ', 'T'))))) || (end && (!pattern.test(end) || Number.isNaN(Date.parse(end.replace(' ', 'T'))))) || (start && end && new Date(start.replace(' ', 'T')).getTime() >= new Date(end.replace(' ', 'T')).getTime())) {
      { wx.showToast({ title: '时间格式错误或结束早于开始', icon: 'none' }); return false }
    }
    const store = loadStore()
    const previous=store.products.find(p=>p.id===this.data.editId)
    if (this.data.editId) {
      const current = store.products.find(p=>p.id===this.data.editId)
      if (!current || (current.version || 1) !== this.data.productVersion) throw new Error('product_changed_reload')
    }
    if (this.data.draftId) {
      const draft = (store.drafts || []).find(d=>d.id===this.data.draftId)
      if (!draft || draft.version !== this.data.draftVersion) throw new Error('draft_changed_reload')
    }
    if (!store.categories.some(category => category.id === this.data.selectedCategory)) {
      wx.showToast({ title: '所选分类已不存在，请重新选择', icon: 'none' }); return false
    }
    let id = this.data.copyMode ? '' : this.data.editId
    if (!id) { do { id = newId() } while (store.products.some(product => product.id === id)) }
    const product: Product = { id, categoryId: this.data.selectedCategory, name, price, discountPrice, discountStart: start, discountEnd: end, available: this.pendingPublishAt ? false : this.data.isAvailable, soldOut: this.data.isSoldOut, description: this.data.productDescription.trim(), imageUrl: this.data.productImageUrl, publishAt:this.pendingPublishAt,version:this.data.productVersion+1,createdAt:previous?previous.createdAt:new Date().toISOString(),updatedAt:new Date().toISOString() }
    Object.assign(product,{stockMode:previous?.stockMode || 'unlimited',stockQuantity:previous?.stockQuantity || 0,lowStockThreshold:previous?.lowStockThreshold === undefined ? 5 : previous.lowStockThreshold,inventoryVersion:previous?.inventoryVersion || 1})
    if(this.pendingInventory)configureDemoInventory(store,product,this.pendingInventory.stockMode,this.pendingInventory.stockQuantity,this.pendingInventory.lowStockThreshold,this.pendingInventory.expectedInventoryVersion,this.pendingInventory.reason,!previous)
    const index = store.products.findIndex(p => p.id === product.id)
    if (index >= 0) store.products[index] = product
    else store.products.push(product)
    if (this.data.draftId) store.drafts = (store.drafts || []).filter(d=>d.id!==this.data.draftId)
    saveStore(store)
    if (this.data.copyMode || this.data.draftId) {
      wx.showToast({ title: this.data.draftId ? '草稿已发布' : '副本已保存', icon: 'success' })
      return true
    }
    this.resetForm()
    this.refresh()
    wx.showToast({ title: '保存成功' })
    return true
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
    startText: p.discountStart, endText: p.discountEnd, isAvailable: productIsPublished(p), isSoldOut: !!p.soldOut, productDescription: p.description || '', productImageUrl: p.imageUrl || '' })
    this.loadSchedule(p.publishAt,p.version)
    this.loadInventory(p)
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
    this.scheduleCancelled = false
    this.loadedSchedule = {publishAt:null,date:'',time:''}
    this.pendingPublishAt = null
    this.cloudImageKey = null
    this.cloudExistingImageUrl = ''
    this.copyDiscountTimes = {start:null,end:null,startText:'',endText:''}
    this.pendingInventory=null;this.inventorySnapshot='unlimited|0|5';this.inventoryRequestKey=newId()
    this.setData({stockMode:'unlimited',stockQuantityText:'0',lowStockThresholdText:'5',inventoryVersion:1,stockDeltaText:'',stockReason:'',stockMovements:[],showStockHistory:false})
    this.setData({ showProductForm: false })
    this.setData({ editId: '', productName: '', priceText: '', discountText: '', startText: '', endText: '', isAvailable: true, isSoldOut: false, productDescription: '', productImageUrl: '',scheduleEnabled:false,scheduleDate:'',scheduleTime:'',productVersion:1 })
  }
})
