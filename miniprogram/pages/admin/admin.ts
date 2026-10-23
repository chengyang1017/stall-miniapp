import { loadStore, saveStore, newId, Category, Product } from '../../utils/store'

Page({
  data: {
    categories: [] as Category[],
    products: [] as Product[],
    categoryName: '',
    productName: '',
    priceText: '',
    discountText: '',
    startText: '',
    endText: '',
    selectedCategory: '',
    selectedCategoryName: '',
    editId: '',
    isAvailable: true
  },
  onShow() { this.refresh() },
  refresh() {
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
    const product: Product = { id: this.data.editId || newId(), categoryId: this.data.selectedCategory, name, price, discountPrice, discountStart: start, discountEnd: end, available: this.data.isAvailable }
    const index = store.products.findIndex(p => p.id === product.id)
    if (index >= 0) store.products[index] = product
    else store.products.push(product)
    saveStore(store)
    this.resetForm()
    this.refresh()
    wx.showToast({ title: '保存成功' })
  },
  editProduct(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    const p = loadStore().products.find(p => p.id === id)
    if (!p) return
    this.setData({ editId: p.id, productName: p.name, priceText: String(p.price), discountText: p.discountPrice === null ? '' : String(p.discountPrice), selectedCategory: p.categoryId, 
    selectedCategoryName:
    (this.data.categories.find(
      c => c.id === p.categoryId
    ) || { name: '' }).name,
    startText: p.discountStart, endText: p.discountEnd, isAvailable: p.available })
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
    this.setData({ editId: '', productName: '', priceText: '', discountText: '', startText: '', endText: '', isAvailable: true })
  }
})
