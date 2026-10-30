import { isPointDeliverable } from '../../modules/customer/demo/settings'
import { availableAreas } from '../../modules/customer/demo/settings'
import { getCloudContext } from '../../modules/shared/runtime/context'
import { loadCloudDelivery, cloudDeliveryReason, CloudDeliveryRules } from '../../utils/cloudCheckout'
import { deliveryStoreKey, resolveDeliveryArea, deliveryAddressReason } from '../../modules/customer/api/delivery'
import { PublicDeliveryArea } from '../../modules/shared/domain/delivery'
import { loadAddresses, saveAddresses, selectAddress, SavedAddress } from '../../utils/addresses'
import { refreshCloudAddresses, writeCloudAddress } from '../../modules/customer/api/addresses'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'
import { supportKey } from '../../modules/shared/domain/support'
import { loginWithWechat } from '../../modules/shared/runtime/auth'

const newAddressId = () => `addr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

Page({
  phoneAddressSerial:0,phoneWriteSerial:0,phoneCreateKey:'',
  disposed:false,writeSerial:0,addressIdentity:'',createRequest:{fingerprint:'',key:''},
  deliverySerial:0,cloudRules:null as CloudDeliveryRules|null,deliveryContext:'',
  data: {
    phoneAddressList:[] as Array<{id:string;receiverName:string;phone:string;area:string;detail:string;isDefault:boolean}>,phoneAddressStatus:'',phoneAddressLoading:false,phoneWriteBusy:false,phoneEditId:'',phoneEditVersion:0,phoneName:'',phoneNumber:'',phoneAreaId:'',phoneDetail:'',
    addressBusy:false,addressListSync:false,addressSync:'idle',addressFeedback:'',addressTiming:{validationMs:0,writeMs:0,listMs:0},
    addresses: [] as Array<SavedAddress & {deliveryIssue?:string}>,
    cloudMode:false,deliveryBusy:false,deliveryError:'',deliveryStatus:'',deliveryAreaId:'',
    areas: [] as PublicDeliveryArea[],
    editingId: '',
    receiverName: '',
    phone: '',
    area: '',
    detail: '',
    latitude: null as number | null,
    longitude: null as number | null,
    locationName: '',
    mapAddress: ''
  },
  onShow() { this.disposed=false;this.refreshPhoneAddresses();if(this.addressIdentity===supportIdentity()&&(this.data.addressBusy||this.data.addressListSync))return;this.refresh() },
  onHide(){this.phoneAddressSerial++;this.phoneWriteSerial++;this.deliverySerial++;this.setData({deliveryBusy:false})},
  onUnload(){this.phoneAddressSerial++;this.phoneWriteSerial++;this.disposed=true;this.deliverySerial++;this.writeSerial++},
  refreshPhoneAddresses(){
    const cfg=getCloudContext()
    const saved=wx.getStorageSync('stall_customer_phone_session_v1') as any
    const serial=++this.phoneAddressSerial
    this.setData({phoneAddressList:[],phoneAddressStatus:'',phoneAddressLoading:false})
    if(!cfg||!saved||saved.apiBase!==cfg.apiBase||typeof saved.token!=='string'||!/^[A-Za-z0-9_-]{40,100}$/.test(saved.token))return
    const token=saved.token,slug=cfg.storeSlug,apiBase=cfg.apiBase
    this.setData({phoneAddressLoading:true,phoneAddressStatus:'正在验证手机号顾客身份并读取地址…'})
    wx.request({url:apiBase.replace(/\/$/,'')+'/v1/customer/account/stores/'+slug+'/addresses',method:'GET',timeout:15000,
      header:{Authorization:'Bearer '+token},
      success:(r:any)=>{
        const current=wx.getStorageSync('stall_customer_phone_session_v1') as any
        const now=getCloudContext()
        if(this.disposed||serial!==this.phoneAddressSerial||current?.token!==token||current?.apiBase!==apiBase||now?.storeSlug!==slug||now?.apiBase!==apiBase)return
        if(r.statusCode===200&&Array.isArray(r.data?.addresses)){
          this.setData({phoneAddressList:r.data.addresses,phoneAddressStatus:'手机号顾客地址（独立账号；写入仅限测试环境）'})
        }else{
          this.setData({phoneAddressList:[],phoneAddressStatus:r.statusCode===404?'手机号地址预览暂未启用':r.statusCode===401?'手机号顾客会话已失效，请重新授权':'暂时无法读取手机号顾客地址'})
        }
      },
      fail:()=>{if(!this.disposed&&serial===this.phoneAddressSerial)this.setData({phoneAddressStatus:'手机号地址读取失败，请检查网络'})},
      complete:()=>{if(!this.disposed&&serial===this.phoneAddressSerial)this.setData({phoneAddressLoading:false})}
    })
  },
  phoneEdit(e:any){
    const item=this.data.phoneAddressList.find(a=>a.id===String(e.currentTarget.dataset.id)) as any
    if(!item||this.data.phoneWriteBusy)return
    this.setData({phoneEditId:item.id,phoneEditVersion:Number(item.version)||0,phoneName:item.receiverName||'',phoneNumber:item.phone||'',phoneAreaId:item.deliveryAreaId||'',phoneDetail:item.detail||'',phoneAddressStatus:'编辑手机号账号地址（测试环境）'})
  },
  phoneNew(){if(this.data.phoneWriteBusy)return;this.phoneCreateKey='';this.setData({phoneEditId:'',phoneEditVersion:0,phoneName:'',phoneNumber:'',phoneAreaId:'',phoneDetail:'',phoneAddressStatus:'新增手机号账号地址（测试环境）'})},
  phoneField(e:any){const field=String(e.currentTarget.dataset.field);if(['phoneName','phoneNumber','phoneAreaId','phoneDetail'].includes(field))this.setData({[field]:String(e.detail.value||'')})},
  phoneWrite(method:'POST'|'PATCH'|'DELETE',id:string,body:Record<string,unknown>):Promise<boolean>{
    const cfg=getCloudContext(),saved=wx.getStorageSync('stall_customer_phone_session_v1') as any
    if(this.data.phoneWriteBusy||!cfg||!saved||saved.apiBase!==cfg.apiBase||typeof saved.token!=='string'||!/^[A-Za-z0-9_-]{40,100}$/.test(saved.token))return Promise.resolve(false)
    const serial=++this.phoneWriteSerial,token=saved.token,apiBase=cfg.apiBase,slug=cfg.storeSlug
    this.setData({phoneWriteBusy:true,phoneAddressStatus:'正在提交手机号地址操作…'})
    return new Promise(resolve=>wx.request({
      url:apiBase.replace(/\/$/,'')+'/v1/customer/account/stores/'+slug+'/addresses'+(id?'/'+id:''),
      method:method as WechatMiniprogram.RequestOption['method'],timeout:20000,header:{Authorization:'Bearer '+token,'content-type':'application/json'},data:body,
      success:(r:any)=>{
        const now=getCloudContext(),session=wx.getStorageSync('stall_customer_phone_session_v1') as any
        if(this.disposed||serial!==this.phoneWriteSerial||session?.token!==token||session?.apiBase!==apiBase||now?.apiBase!==apiBase||now?.storeSlug!==slug){resolve(false);return}
        if(r.statusCode===200&&r.data?.ok===true){
          this.setData({phoneAddressStatus:'服务器已确认保存'})
          this.refreshPhoneAddresses()
          resolve(true)
        }else{
          this.setData({phoneAddressStatus:r.statusCode===404?'手机号地址写入尚未启用':r.statusCode===409?'地址已变化或账号关联需要审核，请刷新核对':r.statusCode===401?'手机号会话已失效':'保存未成功，请重试'})
          resolve(false)
        }
      },
      fail:()=>{if(!this.disposed&&serial===this.phoneWriteSerial)this.setData({phoneAddressStatus:'请求失败或结果未知，请刷新地址列表确认'});resolve(false)},
      complete:()=>{if(!this.disposed&&serial===this.phoneWriteSerial)this.setData({phoneWriteBusy:false})}
    }))
  },
  async phoneSave(){
    if(this.data.phoneWriteBusy)return
    const name=this.data.phoneName.trim(),number=this.data.phoneNumber.trim(),area=this.data.phoneAreaId.trim(),detail=this.data.phoneDetail.trim()
    if(!name||name.length>100||!/^1[3-9]\d{9}$/.test(number)||!area||area.length>60||!detail||detail.length>300){this.setData({phoneAddressStatus:'请填写正确的姓名、11位手机号、配送区域 ID 和详细地址'});return}
    const existing=this.data.phoneEditId
    if(!existing&&!this.phoneCreateKey)this.phoneCreateKey='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,(c)=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3|8)).toString(16)})
    const ok=await this.phoneWrite(existing?'PATCH':'POST',existing,{receiverName:name,phone:number,deliveryAreaId:area,detail,latitude:null,longitude:null,locationName:'',mapAddress:'',...(existing?{expectedVersion:this.data.phoneEditVersion}:{clientKey:this.phoneCreateKey})})
    if(ok){this.phoneCreateKey='';this.setData({phoneEditId:'',phoneEditVersion:0,phoneName:'',phoneNumber:'',phoneAreaId:'',phoneDetail:''})}
  },
  async phoneRemove(e:any){
    const id=String(e.currentTarget.dataset.id||''),a=(this.data.phoneAddressList as any[]).find(x=>x.id===id)
    if(!a||this.data.phoneWriteBusy)return
    wx.showModal({title:'删除手机号地址',content:'确认删除这条地址？',success:async r=>{if(r.confirm)await this.phoneWrite('DELETE',id,{expectedVersion:a.version})}})
  },
  async phoneDefault(e:any){
    const id=String(e.currentTarget.dataset.id||''),a=(this.data.phoneAddressList as any[]).find(x=>x.id===id)
    if(a&&!this.data.phoneWriteBusy)await this.phoneWrite('PATCH',id,{isDefault:true,expectedVersion:a.version})
  },
  async refresh() {
    const cfg=getCloudContext(),serial=++this.deliverySerial,key=cfg?deliveryStoreKey(cfg):'local-demo'
    const identity=supportIdentity();if(this.addressIdentity!==identity){this.writeSerial++;this.addressIdentity=identity;this.setData({addressBusy:false,addressListSync:false,addressSync:'idle',addressFeedback:''});this.createRequest={fingerprint:'',key:''};this.cloudRules=null;this.setData({addresses:[],areas:[]});this.clearForm()}
    const changed=this.deliveryContext && this.deliveryContext!==key;this.deliveryContext=key
    if(changed)this.clearForm()
    if(changed)this.cloudRules=null
    if(!cfg){this.setData({cloudMode:false,deliveryBusy:false,deliveryError:'',deliveryStatus:'本机演示配送区域',addresses:loadAddresses(),areas:availableAreas()});return}
    this.setData({cloudMode:true,deliveryBusy:true,deliveryError:'',deliveryStatus:'正在读取自己的云端地址及配送区域…'})
    try{
      const [addressesResult,rulesResult]=await Promise.allSettled([refreshCloudAddresses(),loadCloudDelivery(cfg)]),current=getCloudContext()
      if(serial!==this.deliverySerial||identity!==supportIdentity())return
      if(addressesResult.status==='rejected')throw addressesResult.reason
      if(rulesResult.status==='rejected'){this.setData({addresses:addressesResult.value.map(a=>({...a,deliveryIssue:'配送规则未配置或读取失败，不能确认可配送'})),deliveryError:'配送规则暂不可用；地址可查看、删除或设置默认，不能确认配送'});return}
      const rules=rulesResult.value
      if(serial!==this.deliverySerial||!current||deliveryStoreKey(current)!==key)return
      this.cloudRules=rules
      this.setData({areas:rules.areas.filter(a=>a.enabled),deliveryStatus:cloudDeliveryReason(rules)||'区域以云端规则为准，地图半径由下单服务器最终校验',addresses:loadAddresses().map(a=>({...a,area:resolveDeliveryArea(a,rules.areas,key)?.name||a.area,deliveryIssue:deliveryAddressReason(a,rules.areas,key)}))})
    }catch(error){if(serial===this.deliverySerial&&!this.disposed&&identity===supportIdentity())this.setData({.../http_40[13]/.test(String(error))?{addresses:[],areas:[]}: {},deliveryError:'云端地址读取失败，请先微信登录或重试；未使用本机地址替代',deliveryStatus:'地址及配送信息未确认'})}
    finally{if(serial===this.deliverySerial){this.setData({deliveryBusy:false});const current=getCloudContext();if(!current||deliveryStoreKey(current)!==key)this.setData({deliveryError:'店铺或模式已变化，请重新读取配送区域',areas:[]})}}
  },
  async login(){const cfg=getCloudContext();if(!cfg||this.data.addressBusy)return;this.setData({addressBusy:true});try{await loginWithWechat(cfg.apiBase);await this.refresh()}catch(_){wx.showToast({title:'微信登录失败，请重试',icon:'none'})}finally{this.setData({addressBusy:false})}},
  renderAddressList(){this.setData({addresses:loadAddresses().map(a=>({...a,deliveryIssue:this.cloudRules?deliveryAddressReason(a,this.cloudRules.areas,this.deliveryContext):'配送规则未确认'}))})},
  async cloudChange(method:'POST'|'PATCH'|'DELETE',id:string,body:Record<string,any>):Promise<boolean>{
    if(this.data.addressBusy||this.addressIdentity!==supportIdentity())return false
    this.deliverySerial++
    const identity=supportIdentity(),serial=++this.writeSerial,start=Date.now(),current=()=>!this.disposed&&serial===this.writeSerial&&identity===supportIdentity()
    this.setData({addressBusy:true,addressListSync:false,deliveryBusy:false,addressSync:'saving',addressFeedback:'正在保存，等待服务器确认'})
    try{
      await writeCloudAddress(method,id,body);if(!current())return false
      this.setData({addressSync:'confirmed',addressFeedback:'服务器已确认保存，正在更新列表',addressTiming:{...this.data.addressTiming,writeMs:Date.now()-start,listMs:0}})
      const readStart=Date.now();this.setData({addressListSync:true})
      // A confirmed save releases the form immediately. The single read-back is background work.
      refreshCloudAddresses().then(()=>{if(current()){this.renderAddressList();this.setData({addressFeedback:'地址已保存',addressTiming:{...this.data.addressTiming,listMs:Date.now()-readStart}})}}).catch(error=>{if(current()){if(/http_40[13]/.test(String(error)))this.setData({addresses:[]});this.setData({addressFeedback:'地址已保存，但列表同步失败，请重新读取核对',addressTiming:{...this.data.addressTiming,listMs:Date.now()-readStart}})}}).finally(()=>{if(current())this.setData({addressListSync:false})})
      return true
    }catch(e){if(current()){
      if(/http_40[13]/.test(String(e)))this.setData({addresses:[]})
      this.setData({addressSync:'failed',addressFeedback:String(e).includes('409')?'地址已变化，请刷新核对；输入已保留':'保存未确认，请检查网络或登录后重试；输入已保留',addressTiming:{...this.data.addressTiming,writeMs:Date.now()-start}})
    }return false}finally{if(current())this.setData({addressBusy:false})}
  },
  addressAllowed(address:SavedAddress):boolean {
    const cfg=getCloudContext()
    if(!cfg){const allowed=isPointDeliverable(address.area,address.latitude??null,address.longitude??null);if(!allowed)wx.showToast({title:'地址不在配送范围内',icon:'none'});return allowed}
    if(this.data.deliveryBusy||this.data.deliveryError||!this.cloudRules||deliveryStoreKey(cfg)!==this.deliveryContext){wx.showToast({title:'请先重新读取云端区域',icon:'none'});return false}
    const issue=deliveryAddressReason(address,this.cloudRules.areas,this.deliveryContext)
    if(issue){wx.showModal({title:'暂不可配送',content:issue,showCancel:false});return false}
    return true
  },
  changeName(e: WechatMiniprogram.Input) { this.setData({receiverName:e.detail.value}) },
  changePhone(e: WechatMiniprogram.Input) { this.setData({phone:e.detail.value}) },
  changeDetail(e: WechatMiniprogram.Input) { this.setData({detail:e.detail.value}) },
  changeArea(e: any) {
    const area = this.data.areas[Number(e.detail.value)]
    if (area) this.setData({area:area.name,deliveryAreaId:area.id})
  },
  chooseMapLocation() {
    wx.chooseLocation({
      success: (result) => {
        const latitude = Number(result.latitude)
        const longitude = Number(result.longitude)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          wx.showToast({ title: '地图返回的位置无效', icon: 'none' })
          return
        }
        const locationName = String(result.name || '')
        const mapAddress = String(result.address || '')
        this.setData({ latitude, longitude, locationName, mapAddress })
      },
      fail: (error) => {
        const message = String((error && error.errMsg) || '')
        if (message.toLowerCase().includes('cancel')) return
        wx.showModal({
          title: '地图暂时无法使用',
          content: '请检查微信小程序的“打开地图选择位置”接口权限和隐私设置。你仍可以手动填写配送地址。',
          showCancel: false
        })
      }
    })
  },
  edit(e: WechatMiniprogram.TouchEvent) {
    const address = loadAddresses().find(a=>a.id===String(e.currentTarget.dataset.id))
    if (!address) return
    const region=this.data.cloudMode?resolveDeliveryArea(address,this.cloudRules?.areas||[],this.deliveryContext):undefined
    this.setData({deliveryAreaId:region?.id||'',editingId:address.id,receiverName:address.receiverName,phone:address.phone,area:region?.name||address.area,detail:address.detail,latitude:address.latitude == null ? null : address.latitude,longitude:address.longitude == null ? null : address.longitude,locationName:address.locationName || '',mapAddress:address.mapAddress || ''})
  },
  clearForm() {
    this.setData({deliveryAreaId:'',editingId:'',receiverName:'',phone:'',area:'',detail:'',latitude:null,longitude:null,locationName:'',mapAddress:''})
  },
  async save() {
    if(this.data.addressBusy)return
    const validationStart=Date.now()
    const receiverName=this.data.receiverName.trim()
    const phone=this.data.phone.trim()
    const area=this.data.area
    const detail=this.data.detail.trim()
    if (!receiverName || !phone || !area || !detail) { wx.showToast({title:'请填写完整地址',icon:'none'}); return }
    if (!/^1[3-9]\d{9}$/.test(phone)) { wx.showToast({title:'手机号格式错误',icon:'none'}); return }
    const cfg=getCloudContext()
    const candidate:SavedAddress={id:'',receiverName,phone,area,detail,isDefault:false,latitude:this.data.latitude??undefined,longitude:this.data.longitude??undefined,
      ...(cfg?{deliveryAreaId:this.data.deliveryAreaId,deliveryStoreKey:this.deliveryContext}:{})}
    if(cfg&&!this.data.deliveryAreaId){wx.showToast({title:'请选择当前云端区域',icon:'none'});return}
    if(cfg){
      if(this.data.editingId&&!loadAddresses().some(a=>a.id===this.data.editingId)){wx.showToast({title:'地址已变化，请刷新核对',icon:'none'});return}
      const current=loadAddresses().find(a=>a.id===this.data.editingId),body={receiverName,phone,deliveryAreaId:this.data.deliveryAreaId,detail,latitude:this.data.latitude,longitude:this.data.longitude,locationName:this.data.locationName,mapAddress:this.data.mapAddress}
      const fp=JSON.stringify(body);if(this.createRequest.fingerprint!==fp)this.createRequest={fingerprint:fp,key:supportKey()}
      this.setData({addressTiming:{validationMs:Date.now()-validationStart,writeMs:0,listMs:0}})
      const ok=await this.cloudChange(current?'PATCH':'POST',current?.id||'',{...body,...current?{expectedVersion:current.version}:{clientKey:this.createRequest.key}})
      if(ok){this.clearForm();this.createRequest={fingerprint:'',key:''};wx.showToast({title:'云端地址已保存'})}return
    }
    if(!this.addressAllowed(candidate))return
    const items=loadAddresses()
    const existing=items.find(a=>a.id===this.data.editingId)
    const id=(existing ? existing.id : newAddressId())
    const entry: SavedAddress={id,receiverName,phone,area,detail,deliveryAreaId:cfg?this.data.deliveryAreaId:undefined,deliveryStoreKey:cfg?this.deliveryContext:undefined,latitude:this.data.latitude == null ? undefined : this.data.latitude,longitude:this.data.longitude == null ? undefined : this.data.longitude,locationName:this.data.locationName,mapAddress:this.data.mapAddress,isDefault:(existing ? existing.isDefault : items.length === 0)}
    if (existing) Object.assign(existing,entry)
    else items.push(entry)
    saveAddresses(items)
    selectAddress(id)
    this.clearForm()
    this.refresh()
    wx.showToast({title:'地址已保存'})
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    if(getCloudContext()&&(this.data.addressBusy||this.data.addressListSync)){wx.showToast({title:'地址正在同步，请稍候再选择',icon:'none'});return}
    const id=String(e.currentTarget.dataset.id),address=loadAddresses().find(a=>a.id===id)
    if(!address||!this.addressAllowed(address))return
    selectAddress(id)
    wx.navigateBack()
  },
  async setDefault(e: WechatMiniprogram.TouchEvent) {
    const id=String(e.currentTarget.dataset.id)
    const target=loadAddresses().find(a=>a.id===id)
    if (!target) { wx.showToast({title:'地址不存在',icon:'none'}); return }
    if(getCloudContext()){await this.cloudChange('PATCH',id,{isDefault:true,expectedVersion:target.version});return}
    if(!this.addressAllowed(target))return
    const region=this.data.cloudMode&&this.cloudRules?resolveDeliveryArea(target,this.cloudRules.areas,this.deliveryContext):undefined
    const items=loadAddresses().map(a=>({...a,isDefault:a.id===id,...a.id===id&&region?{area:region.name,deliveryAreaId:region.id,deliveryStoreKey:this.deliveryContext}:{}}))
    saveAddresses(items)
    selectAddress(id)
    this.refresh()
  },
  remove(e: WechatMiniprogram.TouchEvent) {
    const id=String(e.currentTarget.dataset.id)
    if(this.data.addressBusy)return
    if(getCloudContext()){const address=loadAddresses().find(a=>a.id===id),identity=supportIdentity();if(!address)return;wx.showModal({title:'删除这个云端地址？',content:'仅删除常用地址，不影响历史订单地址快照。',success:async r=>{if(r.confirm&&identity===supportIdentity())await this.cloudChange('DELETE',id,{expectedVersion:address.version})}});return}
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
