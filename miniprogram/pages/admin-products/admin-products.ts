import { loadStore, saveStore, newId, Category, Product } from '../../utils/store'
import { merchantCloudConfig, merchantCloudProducts } from '../../utils/cloudMerchantProducts'

Page({
  openNewProduct() { wx.navigateTo({ url: '/pages/admin-product-form/admin-product-form' }) },
  openEditProduct(e: any) {
    const id = String(e.currentTarget.dataset.id || '');
    if (id) wx.navigateTo({ url: '/pages/admin-product-form/admin-product-form?id=' + encodeURIComponent(id) });
  },
  data: {
    // UNIFIED_PLACEHOLDER_THUMB_V1
    placeholderStyle: 'premium',
    customPlaceholderUrl: '',
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
  async refresh() {
    const styles = ['classic','mountain','bag','playful','premium','custom']
    const savedStyle = String(wx.getStorageSync('stall_placeholder_style_v1') || 'premium')
    const customPlaceholderUrl = String(wx.getStorageSync('stall_placeholder_custom_v1') || '')
    this.setData({ placeholderStyle: savedStyle, placeholderStyleIndex: Math.max(0,styles.indexOf(savedStyle)), customPlaceholderUrl })
    const cfg = merchantCloudConfig()
    if (cfg) {
      this.setData({ products: [], cloudError: '', cloudLoading: true })
      try {
        const products = await merchantCloudProducts(cfg)
        this.setData({ products: products.map(p => ({
          id: p.id, name: p.name, categoryId: p.categoryId || '',
          price: (p.priceCents / 100).toFixed(2), soldOut: p.soldOut,
          available: p.active, imageUrl: p.imageUrl || ''
        })), cloudError: '', cloudLoading: false })
      } catch (_) {
        this.setData({ products: [], cloudError: '商品读取失败，请确认商家已登录且有店铺权限', cloudLoading: false })
      }
      return
    }
    const store = loadStore()
    const selectedCategory = store.categories.some(c => c.id === this.data.selectedCategory)
      ? this.data.selectedCategory : (store.categories.length > 0 ? store.categories[0].id : '')
    const category = store.categories.find(c => c.id === selectedCategory)
    this.setData({ categories: store.categories, products: store.products,
      selectedCategory, selectedCategoryName: category ? category.name : '', cloudError: '', cloudLoading: false })
  },
  inputCategory(e: any) { this.setData({ categoryName: e.detail.value }) },
  addCategory() {
    const name = this.data.categoryName.trim()
    if (!name) return wx.showToast({ title: '请输入分类名', icon: 'none' })
    const store = loadStore()
    if (store.categories.some(c => c.name === name)) return wx.showToast({ title: '分类已存在', icon: 'none' })
    const id = newId()
    store.categories.push({ id, name })
    saveStore(store)
    this.setData({ categoryName: '', selectedCategory: id })
    this.refresh()
  },
  deleteCategory(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    const store = loadStore()
    if (store.products.some(p => p.categoryId === id)) return wx.showToast({ title: '先移动或删除分类里的商品', icon: 'none' })
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
      return wx.showToast({ title: '请检查名称、价格与折扣价', icon: 'none' })
    }
    const start = this.data.startText.trim()
    const end = this.data.endText.trim()
    const pattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
    if ((start && (!pattern.test(start) || Number.isNaN(Date.parse(start.replace(' ', 'T'))))) || (end && (!pattern.test(end) || Number.isNaN(Date.parse(end.replace(' ', 'T'))))) || (start && end && new Date(start.replace(' ', 'T')).getTime() >= new Date(end.replace(' ', 'T')).getTime())) {
      return wx.showToast({ title: '时间格式错误或结束早于开始', icon: 'none' })
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
