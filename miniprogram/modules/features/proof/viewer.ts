import { cloudIdentity as supportIdentity } from '../../shared/runtime/context'
import { chinaTime } from '../../shared/domain/time'
import type { ProofViewPort } from '../../shared/domain/proof'
export function createProofViewer(port:ProofViewPort){return {
  proofSerial:0,proofVisible:false,proofContext:'',
  data: {
    orderId: '', merchant: false, found: false, isDelivering: false, cloudMode: false,
    photoPath: '', deliveredText: '', selectedPhoto: '', busy: false,proofError:'',proofLoading:false
  },
  onLoad(this:any,options: any){
    this.setData({ orderId: String(options.id || ''), merchant: port.management })
  },
  onShow(this:any){this.proofVisible=true;if(this.proofContext!==supportIdentity()){this.proofContext=supportIdentity();this.setData({selectedPhoto:'',photoPath:'',found:false,proofError:''})}this.refresh()},
  onHide(this:any){this.proofVisible=false;this.proofSerial++;if(this.data.cloudMode)this.setData({photoPath:'',proofLoading:false})},
  onUnload(this:any){this.proofVisible=false;this.proofSerial++},
  refresh(this:any){
    const cfg=port.configured(),identity=supportIdentity(),serial=++this.proofSerial
    if(cfg){
      this.setData({cloudMode:true,proofLoading:true,proofError:'',photoPath:''})
      const request=port.snapshot(String(this.data.orderId))
      request.then(async(o:any)=>{
        if(!this.proofVisible||serial!==this.proofSerial||identity!==supportIdentity())return
        const delivered=o.fulfillment_status==='delivered'
        this.setData({found:true,isDelivering:o.fulfillment_status==='delivering',deliveredText:o.delivered_at?chinaTime(String(o.delivered_at)):''})
        if(delivered){
          this.setData({selectedPhoto:''})
          const url=await port.readUrl(String(this.data.orderId))
          if(this.proofVisible&&serial===this.proofSerial&&identity===supportIdentity())this.setData({photoPath:url})
        }
      }).catch(()=>{if(this.proofVisible&&serial===this.proofSerial&&identity===supportIdentity())this.setData({proofError:'云端订单或凭证读取失败，请检查权限、私有存储配置或刷新链接重试。'})}).finally(()=>{if(serial===this.proofSerial)this.setData({proofLoading:false})})
      return
    }
    this.setData({cloudMode:false,proofError:''})
    const order=port.demoSnapshot(String(this.data.orderId))
    if (!order) { this.setData({ found: false }); return }
    this.setData({
      found: true,
      isDelivering: (order.fulfillmentStatus || 'new') === 'delivering',
      photoPath: String(order.deliveryPhotoPath || ''),
      deliveredText: order.deliveredAt ? chinaTime(order.deliveredAt) : ''
    })
  },
  proofReadError(this:any){this.setData({photoPath:'',proofError:'凭证链接可能已过期或读取失败，请点击重新获取。'})},
  previewPhoto(this:any){
    const path = this.data.selectedPhoto || this.data.photoPath
    if (path) wx.previewImage({ current: path, urls: [path] })
  },

}
}
