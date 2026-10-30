import { getCloudContext,cloudIdentity as supportIdentity } from '../../modules/shared/runtime/context'
import { merchantBusiness,patchMerchantBusiness } from '../../modules/merchant/api/business'
const KEY='stall_note_tags_v1'
function readTags():string[]{const raw=wx.getStorageSync(KEY);return Array.isArray(raw)?raw.filter((s:any)=>typeof s==='string').slice(0,30):[]}
Page({
 context:'',serial:0,revision:null as string|null,confirmed:[] as string[],queue:[] as string[][],saving:false,dragFrom:-1,dragTarget:-1,startY:0,
 data:{tags:[] as string[],rows:[] as Array<{key:string;name:string;y:number}>,rowHeight:86,areaHeight:0,draggingIndex:-1,draft:'',editingIndex:-1,editingValue:'',cloudMode:false,busy:false,loading:false,ready:false,error:''},
 onLoad(){const h=Math.round(wx.getSystemInfoSync().windowWidth*172/750);this.setData({rowHeight:h})},
 render(tags:string[]){const h=this.data.rowHeight;this.setData({tags,rows:tags.map((name,i)=>({key:name,name,y:i*h})),areaHeight:tags.length*h})},
 onShow(){if(this.context!==supportIdentity()||!this.data.ready)this.refresh()},
 onHide(){this.serial++;this.setData({loading:false,draggingIndex:-1})},
 onUnload(){this.serial++},
 async refresh(){
  if(this.saving)return
  const context=supportIdentity(),serial=++this.serial,cfg=getCloudContext(),changed=context!==this.context
  this.context=context;if(changed){this.confirmed=[];this.queue=[];this.revision=null;this.setData({draft:'',editingIndex:-1,editingValue:''});this.render([])}
  this.setData({cloudMode:!!cfg,loading:!!cfg,ready:!cfg,error:''})
  if(!cfg){const tags=readTags();this.confirmed=tags;this.render(tags);return}
  try{const r=await merchantBusiness(cfg);if(serial!==this.serial||context!==supportIdentity())return;this.revision=r.revision||null;this.confirmed=(r.noteTags||[]).slice();this.render(this.confirmed);this.setData({ready:true})}
  catch(e){if(serial===this.serial&&context===supportIdentity())this.setData({error:'标签读取失败：'+String(e).slice(0,90)})}
  finally{if(serial===this.serial&&context===supportIdentity())this.setData({loading:false})}
 },
 typeDraft(e:any){this.setData({draft:String(e.detail.value||'')})},
 typeEdit(e:any){this.setData({editingValue:String(e.detail.value||'')})},
 persist(tags:string[]){
  if(!this.data.ready||this.context!==supportIdentity())return
  this.render(tags)
  const cfg=getCloudContext()
  if(!cfg){wx.setStorageSync(KEY,tags);this.confirmed=tags.slice();return}
  this.queue.push(tags.slice());this.setData({busy:true,error:''});void this.flush()
 },
 async flush(){
  if(this.saving)return
  this.saving=true;const context=this.context
  try{
   while(this.queue.length&&context===supportIdentity()){
    const proposed=this.queue[0],cfg=getCloudContext();if(!cfg)break
    try{const revision=await patchMerchantBusiness(cfg,this.revision,{noteTags:proposed});if(context!==supportIdentity())return;this.revision=revision;this.confirmed=proposed.slice();this.queue.shift()}
    catch(e){
     if(context!==supportIdentity())return
     this.queue=[];this.render(this.confirmed);this.setData({error:'保存失败：'+String(e).slice(0,110)})
     wx.showToast({title:'标签未保存，已恢复',icon:'none'});return
    }
   }
  }finally{this.saving=false;if(context===supportIdentity())this.setData({busy:false})}
 },
 add(){const value=this.data.draft.trim(),tags=this.data.tags.slice();if(!value||value.length>20){wx.showToast({title:'标签须为1至20字',icon:'none'});return}if(tags.includes(value)||tags.length>=30){wx.showToast({title:'标签重复或超过30个',icon:'none'});return}this.persist([...tags,value]);this.setData({draft:''})},
 edit(e:any){const i=Number(e.currentTarget.dataset.index);if(this.data.draggingIndex>=0||this.data.tags[i]===undefined)return;this.setData({editingIndex:i,editingValue:this.data.tags[i]})},
 cancelEdit(){this.setData({editingIndex:-1,editingValue:''})},
 saveEdit(){const i=this.data.editingIndex,tags=this.data.tags.slice(),v=this.data.editingValue.trim();if(i<0||i>=tags.length)return;if(!v||v.length>20||tags.some((s,n)=>n!==i&&s===v)){wx.showToast({title:'标签无效或重复',icon:'none'});return}tags[i]=v;this.persist(tags);this.cancelEdit()},
 remove(e:any){const i=Number(e.currentTarget.dataset.index);if(i<0||i>=this.data.tags.length)return;const tags=this.data.tags.slice();tags.splice(i,1);this.persist(tags);this.cancelEdit()},
 handleStart(e:any){if(!this.data.ready||this.data.editingIndex>=0)return;const i=Number(e.currentTarget.dataset.index),touch=e.touches?.[0];if(!touch||i<0||i>=this.data.tags.length)return;this.dragFrom=i;this.dragTarget=i;this.startY=Number(touch.pageY);this.setData({draggingIndex:i})},
 handleMove(e:any){if(this.dragFrom<0)return;const touch=e.touches?.[0];if(!touch)return;const h=this.data.rowHeight,n=this.data.tags.length;const target=Math.min(n-1,Math.max(0,Math.round(this.dragFrom+(Number(touch.pageY)-this.startY)/h)));this.dragTarget=target;const order=this.data.tags.map((_,i)=>i);const [moving]=order.splice(this.dragFrom,1);order.splice(target,0,moving);const rows=this.data.rows.map((r,i)=>({...r,y:order.indexOf(i)*h}));this.setData({rows})},
 handleEnd(){if(this.dragFrom<0)return;const from=this.dragFrom,to=this.dragTarget;this.dragFrom=-1;this.dragTarget=-1;this.setData({draggingIndex:-1});if(from===to){this.render(this.data.tags);return}const tags=this.data.tags.slice();const [moving]=tags.splice(from,1);tags.splice(to,0,moving);this.persist(tags)}
})
