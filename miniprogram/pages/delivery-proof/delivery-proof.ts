import { supportIdentity } from '../../utils/supportCloud'
import { customerOrdersRequest } from '../../utils/customerOrdersApi'
import { cloudProofUrl } from '../../utils/cloudProofRead' // PHASE38_PROOF_READ
import { loadWorkflowOrders, chinaTime } from '../../utils/orderWorkflow'
import { cloudProofConfig, loadProofOrder, uploadDeliveryProof, completeCloudDelivery } from '../../utils/merchantProofCloud' // PHASE37B_PROOF

const KEY = 'stall_demo_orders_v1'
Page({
  proofSerial:0,proofVisible:false,proofContext:'',uploadedProofKey:'',
  data: {
    orderId: '', merchant: false, found: false, isDelivering: false, cloudMode: false,
    photoPath: '', deliveredText: '', selectedPhoto: '', busy: false,proofError:'',proofLoading:false
  },
  onLoad(options: any) {
    this.setData({ orderId: String(options.id || ''), merchant: String(options.merchant || '') === '1' })
  },
  onShow(){this.proofVisible=true;if(this.proofContext!==supportIdentity()){this.proofContext=supportIdentity();this.uploadedProofKey='';this.setData({selectedPhoto:'',photoPath:'',found:false,proofError:''})}this.refresh()},
  onHide(){this.proofVisible=false;this.proofSerial++;if(this.data.cloudMode)this.setData({photoPath:'',proofLoading:false})},
  onUnload(){this.proofVisible=false;this.proofSerial++;this.uploadedProofKey=''},
  refresh() {
    const cfg=cloudProofConfig(),identity=supportIdentity(),serial=++this.proofSerial
    if(cfg){
      this.setData({cloudMode:true,proofLoading:true,proofError:'',photoPath:''})
      const request=this.data.merchant?loadProofOrder(String(this.data.orderId)):customerOrdersRequest(cfg,String(this.data.orderId)).then(r=>({fulfillment_status:r.order.fulfillmentStatus,delivered_at:r.order.deliveredAt}))
      request.then(async(o:any)=>{
        if(!this.proofVisible||serial!==this.proofSerial||identity!==supportIdentity())return
        const delivered=o.fulfillment_status==='delivered'
        this.setData({found:true,isDelivering:o.fulfillment_status==='delivering',deliveredText:o.delivered_at?chinaTime(String(o.delivered_at)):''})
        if(delivered){
          this.uploadedProofKey='';this.setData({selectedPhoto:''})
          const url=await cloudProofUrl(cfg.apiBase,cfg.storeSlug,String(this.data.orderId),this.data.merchant)
          if(this.proofVisible&&serial===this.proofSerial&&identity===supportIdentity())this.setData({photoPath:url})
        }
      }).catch(()=>{if(this.proofVisible&&serial===this.proofSerial&&identity===supportIdentity())this.setData({proofError:'云端订单或凭证读取失败，请检查权限、私有存储配置或刷新链接重试。'})}).finally(()=>{if(serial===this.proofSerial)this.setData({proofLoading:false})})
      return
    }
    this.setData({cloudMode:false,proofError:''})
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
    const identity=supportIdentity();this.setData({busy:true})
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['camera', 'album'], success: (chosen) => {
      if (!chosen.tempFiles || !chosen.tempFiles.length || identity!==supportIdentity()){this.setData({busy:false});return}
      const source = chosen.tempFiles[0].tempFilePath
      this.setData({ busy: true })
      wx.saveFile({ tempFilePath: source, success: (stored) => {
        if(identity!==supportIdentity()){this.setData({busy:false});return}
        this.uploadedProofKey='';this.setData({ selectedPhoto: stored.savedFilePath, busy: false })
      }, fail: () => {
        this.setData({ busy: false })
        wx.showToast({ title: '照片保存失败，请重试', icon: 'none' })
      } })
    },fail:()=>this.setData({busy:false}) })
  },
  proofReadError(){this.setData({photoPath:'',proofError:'凭证链接可能已过期或读取失败，请点击重新获取。'})},
  previewPhoto() {
    const path = this.data.selectedPhoto || this.data.photoPath
    if (path) wx.previewImage({ current: path, urls: [path] })
  },
  completeDelivery() {
    if(this.data.cloudMode){
      if(!this.data.merchant||!this.data.isDelivering||!this.data.selectedPhoto||this.data.busy)return
      const identity=supportIdentity(),id=String(this.data.orderId)
      this.setData({busy:true})
      wx.showModal({title:'确认送达？',content:'上传并校验照片后才提交服务器；未付款订单无法标记已送达。',success:async(r:any)=>{
        if(!r.confirm||!this.proofVisible||identity!==supportIdentity()){this.setData({busy:false});return}
        try{
          const key=this.uploadedProofKey||await uploadDeliveryProof(id,String(this.data.selectedPhoto))
          if(identity!==supportIdentity()||!this.proofVisible)throw Error('context_changed')
          this.uploadedProofKey=key
          await completeCloudDelivery(id,key)
          if(identity!==supportIdentity()||!this.proofVisible)return
          this.setData({selectedPhoto:''});this.refresh();wx.showToast({title:'服务器已确认送达',icon:'success'})
        }catch(_){if(identity===supportIdentity())this.setData({proofError:'上传或送达提交未确认，照片已保留；可重试并刷新核对订单状态。'})}
        finally{this.setData({busy:false})}
      },fail:()=>this.setData({busy:false})})
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
