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
        }catch(error:any){if(identity===supportIdentity()){
          const reason=String(error?.message||error)
          const message=/proof_private_storage_not_confirmed|object_storage_not_configured/.test(reason)
            ?'送达照片的私有对象存储尚未配置完成，请管理员检查 Render 的私有存储桶及 S3/R2 凭证。'
            :/unsupported_image_format|invalid_image/.test(reason)
            ?'照片格式或大小不符合要求，请选用 5MB 以内的 JPG、PNG 或 WebP 照片。'
            :/upload_http_|proof_not_uploaded|proof_object_unavailable/.test(reason)
            ?'照片上传到对象存储失败，请检查上传域名、网络或存储桶权限。'
            :/http_40[13]/.test(reason)
            ?'当前登录身份无权提交送达照片，请检查商家登录状态与权限。'
            :/http_409|order_state_changed|not_delivering|payment_not_confirmed/.test(reason)
            ?'订单状态或付款状态已变化，送达未确认，请先刷新订单状态。'
            :/http_503/.test(reason)
            ?'送达服务暂不可用（HTTP 503），请检查后端日志及私有照片存储配置。'
            :'上传或送达结果尚未确认（'+reason.slice(0,85)+'），照片已保留；请刷新核对后再重试。'
          this.setData({proofError:message})
        }}
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
