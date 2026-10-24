import { cloudProofUrl } from '../../utils/cloudProofRead' // PHASE38_PROOF_READ
import { loadWorkflowOrders, chinaTime } from '../../utils/orderWorkflow'
import { cloudProofConfig, loadProofOrder, uploadDeliveryProof, completeCloudDelivery } from '../../utils/merchantProofCloud' // PHASE37B_PROOF

const KEY = 'stall_demo_orders_v1'
Page({
  data: {
    orderId: '', merchant: false, found: false, isDelivering: false, cloudMode: false,
    photoPath: '', deliveredText: '', selectedPhoto: '', busy: false
  },
  onLoad(options: any) {
    this.setData({ orderId: String(options.id || ''), merchant: String(options.merchant || '') === '1' })
    this.refresh()
  },
  onShow() { this.refresh() },
  refresh() {
    if(this.data.merchant && cloudProofConfig()){
      this.setData({cloudMode:true})
      loadProofOrder(String(this.data.orderId)).then((o:any)=>{
        this.setData({found:true,isDelivering:o.fulfillment_status==='delivering',deliveredText:o.delivered_at?chinaTime(String(o.delivered_at)):'',photoPath:''})
        if(o.fulfillment_status==='delivered'){const cfg=cloudProofConfig();if(cfg)cloudProofUrl(cfg.apiBase,cfg.storeSlug,String(this.data.orderId),true).then((url:string)=>this.setData({photoPath:url})).catch(()=>{})}
      }).catch(()=>this.setData({found:false}))
      return
    }
    const order = loadWorkflowOrders().find(o => o.id === this.data.orderId) as any
    if (!order) { this.setData({ found: false }); return }
    this.setData({
      found: true,
      isDelivering: (order.fulfillmentStatus || 'new') === 'delivering',
      photoPath: String(order.deliveryPhotoPath || ''),
      deliveredText: order.deliveredAt ? chinaTime(order.deliveredAt) : ''
    })
  },
  chooseProof() {
    if (!this.data.merchant || !this.data.isDelivering || this.data.photoPath || this.data.busy) return
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['camera', 'album'], success: (chosen) => {
      if (!chosen.tempFiles || !chosen.tempFiles.length) return
      const source = chosen.tempFiles[0].tempFilePath
      this.setData({ busy: true })
      wx.saveFile({ tempFilePath: source, success: (stored) => {
        this.setData({ selectedPhoto: stored.savedFilePath, busy: false })
      }, fail: () => {
        this.setData({ busy: false })
        wx.showToast({ title: '照片保存失败，请重试', icon: 'none' })
      } })
    } })
  },
  previewPhoto() {
    const path = this.data.selectedPhoto || this.data.photoPath
    if (path) wx.previewImage({ current: path, urls: [path] })
  },
  completeDelivery() {
    if(this.data.cloudMode){
      if(!this.data.merchant||!this.data.isDelivering||!this.data.selectedPhoto||this.data.busy)return
      wx.showModal({title:'确认送达？',content:'上传送达照片后提交服务器确认。未付款订单无法标记已送达。',success:async(r:any)=>{
        if(!r.confirm)return
        this.setData({busy:true})
        try{
          const id=String(this.data.orderId)
          const key=await uploadDeliveryProof(id,String(this.data.selectedPhoto))
          await completeCloudDelivery(id,key)
          this.setData({selectedPhoto:''})
          this.refresh()
          wx.showToast({title:'已确认送达',icon:'success'})
        }catch(e:any){wx.showModal({title:'提交失败',content:String(e&&e.message||e),showCancel:false})}
        finally{this.setData({busy:false})}
      }})
      return
    }
    if (!this.data.merchant || !this.data.isDelivering || !this.data.selectedPhoto || this.data.busy) return
    wx.showModal({ title: '确认送达？', content: '确认照片已拍摄并保存，订单将标记为已送达（本地演示）。', success: r => {
      if (!r.confirm) return
      const orders = loadWorkflowOrders() as any[]
      const order = orders.find(o => o.id === this.data.orderId)
      if (!order || (order.fulfillmentStatus || 'new') !== 'delivering' || order.deliveryPhotoPath) {
        wx.showToast({ title: '订单状态已变化', icon: 'none' }); this.refresh(); return
      }
      order.deliveryPhotoPath = this.data.selectedPhoto
      order.fulfillmentStatus = 'delivered'
      order.deliveredAt = new Date().toISOString()
      try {
        wx.setStorageSync(KEY, orders)
        this.setData({ selectedPhoto: '' })
        this.refresh()
        wx.showToast({ title: '演示订单已送达', icon: 'success' })
      } catch (_error) {
        wx.showToast({ title: '订单保存失败', icon: 'none' })
      }
    } })
  }
})