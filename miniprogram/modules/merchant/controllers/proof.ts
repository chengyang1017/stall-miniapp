import { createProofViewer } from '../../features/proof/viewer'
import { getCloudContext,cloudIdentity as supportIdentity } from '../../shared/runtime/context'
import { proofSnapshot,proofUrl } from '../api/proof'
import { loadWorkflowOrders,saveDemoOrders } from '../demo/orders'
import { uploadDeliveryProof,completeCloudDelivery } from '../../../utils/merchantProofCloud'
export function createMerchantProofController(){
 const viewer=createProofViewer({management:true,configured:getCloudContext,snapshot:proofSnapshot,readUrl:proofUrl,demoSnapshot(id){return loadWorkflowOrders().find(o=>o.id===id)}})
 return {...viewer,uploadedProofKey:'',
 onShow(this:any){if(this.proofContext!==supportIdentity())this.uploadedProofKey='';viewer.onShow.call(this)},
 onUnload(this:any){this.uploadedProofKey='';viewer.onUnload.call(this)},
  chooseProof(this:any){
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
  completeDelivery(this:any){
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
        saveDemoOrders(orders)
        this.setData({ selectedPhoto: '' })
        this.refresh()
        wx.showToast({ title: '演示订单已送达', icon: 'success' })
      } catch (_error) {
        wx.showToast({ title: '订单保存失败', icon: 'none' })
      }
    } })
  }}
}
