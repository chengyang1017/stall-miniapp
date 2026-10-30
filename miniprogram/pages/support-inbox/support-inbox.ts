import { supportConfig,merchantSupportGet,supportIdentity,supportTime,supportError } from '../../modules/merchant/api/support'
Page({
 identity:'',serial:0,visible:false,cursor:'',busy:false,
 data:{cloudMode:false,conversations:[] as any[],loading:false,error:'',hasMore:false,unread:null as number|null},
 onShow(){this.visible=true;this.refresh()},
 onHide(){this.visible=false;this.serial++;this.busy=false;this.setData({loading:false})},
 onUnload(){this.visible=false;this.serial++},
 async refresh(){await this.fetch(false)},
 async more(){if(this.data.hasMore)await this.fetch(true)},
 async onPullDownRefresh(){await this.refresh();wx.stopPullDownRefresh()},
 async fetch(more:boolean){
  if(this.busy||!this.visible)return
  const identity=supportIdentity();if(identity!==this.identity){this.identity=identity;this.cursor='';more=false;this.setData({conversations:[],unread:null,hasMore:false})}
  const cfg=supportConfig();this.setData({cloudMode:!!cfg});if(!cfg)return
  this.busy=true;const serial=++this.serial;this.setData({loading:true,error:''})
  try{
   const r=await merchantSupportGet('conversations',more?{cursor:this.cursor,limit:30}:{limit:30})
   if(!this.visible||serial!==this.serial||identity!==supportIdentity())return
   const seen=new Map<string,any>();(more?this.data.conversations:[]).concat(r.conversations).forEach((c:any)=>seen.set(c.id,{...c,time:supportTime(c.lastMessageAt),label:'顾客会话 '+c.id.slice(0,8)}))
   this.cursor=r.nextCursor||'';this.setData({conversations:Array.from(seen.values()),hasMore:r.hasMore})
   const u=await merchantSupportGet('unread');if(this.visible&&serial===this.serial&&identity===supportIdentity())this.setData({unread:u.unread})
  }catch(e){if(this.visible&&serial===this.serial&&identity===supportIdentity()){const s=String((e as any).message);if(/401|403/.test(s))this.setData({conversations:[],unread:null,hasMore:false});if(/409/.test(s)){this.cursor='';this.setData({hasMore:false})}this.setData({error:supportError(e)})}}
  finally{if(serial===this.serial){this.busy=false;this.setData({loading:false})}}
 },
 open(e:any){const id=String(e.currentTarget.dataset.id||'');if(supportIdentity()!==this.identity){this.refresh();return}if(this.data.cloudMode&&!this.data.conversations.some(c=>c.id===id))return;wx.navigateTo({url:'/pages/merchant-support-chat/merchant-support-chat'+(this.data.cloudMode?'?conversation='+encodeURIComponent(id):'')})},
 demo(){wx.navigateTo({url:'/pages/merchant-support-chat/merchant-support-chat'})}
})
