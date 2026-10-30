import { getCloudContext } from '../../modules/shared/runtime/context'
import { merchantBusiness, patchMerchantBusiness } from '../../modules/merchant/api/business'
import { cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'
const KEY='stall_note_tags_v1'
function readTags():string[]{const raw=wx.getStorageSync(KEY);return Array.isArray(raw)?raw.filter((s:any)=>typeof s==='string').slice(0,30):[]}
Page({
 context:'',serial:0,revision:null as string|null,
 data:{tags:[] as string[],draft:'',editingIndex:-1,editingValue:'',cloudMode:false,busy:false,loading:false,ready:false,error:''},
 onShow(){if(this.context!==supportIdentity()){this.setData({busy:false});this.refresh();return}if(!this.data.ready||!this.data.draft&&this.data.editingIndex<0)this.refresh()},
 onHide(){this.serial++;if(getCloudContext())this.setData({loading:false})},
 onUnload(){this.serial++},
 async refresh(){
  if(this.data.busy)return
  const context=supportIdentity(),serial=++this.serial,cfg=getCloudContext(),changed=context!==this.context;if(changed)this.setData({draft:'',editingIndex:-1,editingValue:''});this.context=context
  this.setData({cloudMode:!!cfg,tags:cfg?changed?[]:this.data.tags:readTags(),loading:!!cfg,ready:!cfg||!changed&&this.data.ready,error:''})
  if(!cfg)return
  try{const r=await merchantBusiness(cfg);if(serial!==this.serial||context!==supportIdentity())return;this.revision=r.revision||null;this.setData({tags:r.noteTags||[],ready:true})}catch(e){if(serial===this.serial&&context===supportIdentity()){if(/http_40[13]/.test(String(e)))this.setData({tags:[],ready:false});this.setData({error:'云端标签读取失败，请检查商家登录和权限；未回退本机标签'})}}finally{if(serial===this.serial&&context===supportIdentity())this.setData({loading:false})}
 },
 typeDraft(e:any){if(!this.data.busy)this.setData({draft:String(e.detail.value||'')})},
 typeEdit(e:any){if(!this.data.busy)this.setData({editingValue:String(e.detail.value||'')})},
 async persist(tags:string[]):Promise<boolean>{
  if(this.data.busy||!this.data.ready||this.context!==supportIdentity())return false
  const cfg=getCloudContext(),context=this.context;this.setData({busy:true,error:''})
  try{if(cfg)this.revision=await patchMerchantBusiness(cfg,this.revision,{noteTags:tags});else wx.setStorageSync(KEY,tags)
   if(context!==supportIdentity())return false;this.setData({tags});return true
  }catch(e){if(context===supportIdentity())this.setData({error:String(e).includes('409')?'设置已变化，请刷新后重新编辑，未覆盖云端配置':'保存失败，输入保留；请重试或刷新核对',ready:false});return false}finally{if(context===supportIdentity())this.setData({busy:false})}
 },
 async add(){const value=this.data.draft.trim(),tags=this.data.tags.slice();if(!value||value.length>20){wx.showToast({title:'标签须为1至20字',icon:'none'});return}if(tags.includes(value)||tags.length>=30){wx.showToast({title:'标签重复或超过30个',icon:'none'});return}if(await this.persist([...tags,value]))this.setData({draft:''})},
 edit(e:any){if(!this.data.ready||this.data.busy)return;const i=Number(e.currentTarget.dataset.index);if(Number.isInteger(i)&&this.data.tags[i]!==undefined)this.setData({editingIndex:i,editingValue:this.data.tags[i]})},
 cancelEdit(){if(!this.data.busy)this.setData({editingIndex:-1,editingValue:''})},
 async saveEdit(){const i=this.data.editingIndex,tags=this.data.tags.slice(),v=this.data.editingValue.trim();if(!Number.isInteger(i)||i<0||i>=tags.length)return;if(!v||v.length>20||tags.some((s,n)=>n!==i&&s===v)){wx.showToast({title:'标签无效或重复',icon:'none'});return}tags[i]=v;if(await this.persist(tags))this.cancelEdit()},
 remove(e:any){if(this.data.busy||!this.data.ready)return;const i=Number(e.currentTarget.dataset.index),context=this.context,tags=this.data.tags.slice();if(!tags[i])return;wx.showModal({title:'删除标签？',content:tags[i],success:async r=>{if(!r.confirm||context!==supportIdentity())return;tags.splice(i,1);if(await this.persist(tags))this.cancelEdit()}})},
 async move(e:any){const i=Number(e.currentTarget.dataset.index),step=Number(e.currentTarget.dataset.step),tags=this.data.tags.slice(),j=i+step;if(![-1,1].includes(step)||!Number.isInteger(i)||i<0||j<0||j>=tags.length||this.data.editingIndex>=0)return;[tags[i],tags[j]]=[tags[j],tags[i]];await this.persist(tags)}
})
