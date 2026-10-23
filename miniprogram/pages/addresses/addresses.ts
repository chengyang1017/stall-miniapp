import { availableAreas } from '../../utils/delivery'
import { loadAddresses, saveAddresses, selectAddress, SavedAddress } from '../../utils/addresses'

const newAddressId = () => `addr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

Page({
  data: {
    addresses: [] as SavedAddress[],
    areas: [] as Array<{id: string; name: string}>,
    editingId: '',
    receiverName: '',
    phone: '',
    area: '',
    detail: ''
  },
  onShow() { this.refresh() },
  refresh() {
    this.setData({ addresses: loadAddresses(), areas: availableAreas() })
  },
  changeName(e: WechatMiniprogram.Input) { this.setData({receiverName:e.detail.value}) },
  changePhone(e: WechatMiniprogram.Input) { this.setData({phone:e.detail.value}) },
  changeDetail(e: WechatMiniprogram.Input) { this.setData({detail:e.detail.value}) },
  changeArea(e: any) {
    const area = this.data.areas[Number(e.detail.value)]
    if (area) this.setData({area:area.name})
  },
  edit(e: WechatMiniprogram.TouchEvent) {
    const address = loadAddresses().find(a=>a.id===String(e.currentTarget.dataset.id))
    if (!address) return
    this.setData({editingId:address.id,receiverName:address.receiverName,phone:address.phone,area:address.area,detail:address.detail})
  },
  clearForm() {
    this.setData({editingId:'',receiverName:'',phone:'',area:'',detail:''})
  },
  save() {
    const receiverName=this.data.receiverName.trim()
    const phone=this.data.phone.trim()
    const area=this.data.area
    const detail=this.data.detail.trim()
    if (!receiverName || !phone || !area || !detail) return wx.showToast({title:'请填写完整地址',icon:'none'})
    if (!/^1[3-9]\d{9}$/.test(phone)) return wx.showToast({title:'手机号格式错误',icon:'none'})
    if (!availableAreas().some(a=>a.name===area)) return wx.showToast({title:'该地区暂不可配送',icon:'none'})
    const items=loadAddresses()
    const existing=items.find(a=>a.id===this.data.editingId)
    const id=(existing ? existing.id : newAddressId())
    const entry: SavedAddress={id,receiverName,phone,area,detail,isDefault:(existing ? existing.isDefault : items.length === 0)}
    if (existing) Object.assign(existing,entry)
    else items.push(entry)
    saveAddresses(items)
    selectAddress(id)
    this.clearForm()
    this.refresh()
    wx.showToast({title:'地址已保存'})
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    selectAddress(String(e.currentTarget.dataset.id))
    wx.navigateBack()
  },
  setDefault(e: WechatMiniprogram.TouchEvent) {
    const id=String(e.currentTarget.dataset.id)
    const items=loadAddresses().map(a=>({...a,isDefault:a.id===id}))
    saveAddresses(items)
    selectAddress(id)
    this.refresh()
  },
  remove(e: WechatMiniprogram.TouchEvent) {
    const id=String(e.currentTarget.dataset.id)
    wx.showModal({title:'删除这个地址？',success:r=>{
      if (!r.confirm) return
      const old=loadAddresses()
      const target=old.find(a=>a.id===id)
      const items=old.filter(a=>a.id!==id)
      if(target && target.isDefault && items.length) items[0].isDefault=true
      saveAddresses(items)
      if(items.length) selectAddress((items.find(a=>a.isDefault) || items[0]).id)
      else wx.removeStorageSync('stall_selected_address_v1')
      this.refresh()
    }})
  }
})
