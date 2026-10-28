import { supportTime,supportKey,supportError,compareSupportSeq } from '../../shared/domain/support'
import { registerSessionCacheReset } from '../../shared/runtime/sessionLifecycle'
import type { ChatPort } from '../../shared/domain/chat'
let retainedChat:any=null
registerSessionCacheReset(()=>{retainedChat=null})
export function createChatController(createPort:()=>ChatPort){return {
 identity:'',visible:false,disposed:false,sendEpoch:0,serial:0,reading:false,sending:false,timer:0 as any,pending:null as null|{content:string;clientKey:string},
 data:{messages:[] as any[],draft:'',bottomId:'',cloudMode:false,merchantMode:false,conversationLabel:'',loading:false,sending:false,loginBusy:false,error:'',sendError:'',hasOlder:false,ready:false,unread:null as number|null},
 onLoad(this:any,options:any){this.chatPort=createPort();this.setData({merchantMode:this.chatPort.sender==='merchant',conversationLabel:this.chatPort.bind(options)})},
 remember(this:any){if(this.identity===this.chatPort.identity())retainedChat={key:this.chatPort.sender+'|'+this.identity,pending:this.pending,data:JSON.parse(JSON.stringify(this.data))}},
 onShow(this:any){
  this.visible=true;this.disposed=false;const identity=this.chatPort.identity()
  if(identity!==this.identity){
   this.serial++;this.sendEpoch++;this.reading=false;this.sending=false;this.identity=identity;this.pending=null
   this.setData({messages:[],draft:'',sendError:'',error:'',ready:false,hasOlder:false,loading:false,sending:false,unread:null})
   if(retainedChat?.key===this.chatPort.sender+'|'+identity){this.pending=retainedChat.pending;this.setData({...retainedChat.data,loading:false,sending:false,loginBusy:false,messages:retainedChat.data.messages.map((m:any)=>m.delivery==='sending'?{...m,delivery:'failed'}:m),sendError:this.pending?'上次消息尚未确认，请使用原编号重试':''})}
   else retainedChat=null
  }
  this.setData({cloudMode:!!this.chatPort.configured()});this.refresh();this.schedule()
 },
 onHide(this:any){this.remember();this.visible=false;this.serial++;clearTimeout(this.timer);this.reading=false;this.setData({loading:false})},
 onUnload(this:any){this.remember();this.disposed=true;this.visible=false;this.serial++;this.sendEpoch++;clearTimeout(this.timer)},
 schedule(this:any){clearTimeout(this.timer);if(this.visible)this.timer=setTimeout(async()=>{await this.refresh();this.schedule()},12000)},
 current(this:any,serial:number,identity:string){return this.visible&&serial===this.serial&&identity===this.chatPort.identity()},
 async login(this:any){const c=this.chatPort.configured();if(!c||this.data.loginBusy)return;const epoch=this.sendEpoch;this.setData({loginBusy:true});try{await this.chatPort.login();if(!this.disposed&&epoch===this.sendEpoch){this.setData({loginBusy:false});if(this.visible)this.onShow()}}catch(e){if(!this.disposed&&epoch===this.sendEpoch)this.setData({error:supportError(e)})}finally{if(!this.disposed&&epoch===this.sendEpoch)this.setData({loginBusy:false})}},
 async refresh(this:any,older=false){
  if(!this.visible||this.reading)return
  if(this.identity!==this.chatPort.identity()){this.onShow();return}
  if(!this.chatPort.configured()) {const messages=this.chatPort.demoMessages().map((m:any)=>({...m,time:supportTime(m.createdAt),mine:m.sender===this.chatPort.sender,read:false}));this.setData({messages,ready:true,hasOlder:false,bottomId:messages.length?'msg-'+messages[messages.length-1].id:''});return}
  this.reading=true;const serial=++this.serial,identity=this.identity,rows=this.data.messages.filter((m:any)=>!m.delivery||m.delivery==='confirmed')
  this.setData({loading:true,error:''})
  try {
   const query:Record<string,string|number>={limit:30}
   if(rows.length){if(older)query.before=rows[0].seq;else query.after=rows[rows.length-1].seq}
   const r=await this.chatPort.get('messages',query)
   if(!this.current(serial,identity))return
   if(!Array.isArray(r.messages))throw Error('invalid_response')
   const incomingKeys=new Set(r.messages.filter((m:any)=>m.sender===this.chatPort.sender&&m.clientKey).map((m:any)=>m.clientKey))
   if(this.pending&&incomingKeys.has(this.pending.clientKey)){this.pending=null;this.setData({sendError:''})}
   const seen=new Map<string,any>();this.data.messages.filter((m:any)=>!m.local||!incomingKeys.has(m.clientKey)).concat(r.messages).forEach((m:any)=>seen.set(m.id,m))
   const read=String(r.conversation&&(this.chatPort.sender==='merchant'?r.conversation.customerReadSeq:r.conversation.merchantReadSeq)||'0')
   const messages=Array.from(seen.values()).sort((a,b)=>a.local?b.local?0:1:b.local?-1:compareSupportSeq(a.seq,b.seq)).map(m=>({...m,time:supportTime(m.createdAt),mine:m.sender===this.chatPort.sender,read:compareSupportSeq(m.seq,read)<=0}))
   this.setData({messages,ready:true,hasOlder:older||!rows.length?r.hasMore:this.data.hasOlder,bottomId:older?this.data.bottomId:messages.length?'msg-'+messages[messages.length-1].id:''})
   const confirmed=messages.filter((m:any)=>!m.local)
   if(confirmed.length&&this.current(serial,identity))await this.chatPort.post('read',{through:String(confirmed[confirmed.length-1].seq)})
   if(this.current(serial,identity)){const u=await this.chatPort.get('unread');if(this.current(serial,identity))this.setData({unread:u.unread})}
  }catch(e){if(this.current(serial,identity)){if(/401|403/.test(String((e as any).message))){this.pending=null;this.sendEpoch++;this.sending=false;retainedChat=null;this.setData({messages:[],draft:'',sending:false,ready:false,hasOlder:false})}this.setData({error:supportError(e)})}}
  finally{if(serial===this.serial){this.reading=false;this.setData({loading:false})}}
 },
 async onPullDownRefresh(this:any){await this.refresh();wx.stopPullDownRefresh()},
 reload(this:any){this.refresh()},
 older(this:any){if(this.data.hasOlder)this.refresh(true)},
 onInput(this:any,e:any){if(!this.sending&&!this.pending)this.setData({draft:String(e.detail.value)})},
 discard(this:any){if(this.sending)return;const identity=this.identity;wx.showModal({title:'修改未确认消息',content:'原消息可能已到达服务端。建议先重试确认；修改后再次发送会被视为新消息。是否继续修改？',success:r=>{if(r.confirm&&!this.sending&&this.visible&&identity===this.chatPort.identity()){const old=this.pending;this.pending=null;this.setData({draft:old?.content||this.data.draft,messages:this.data.messages.filter((m:any)=>!m.local||m.clientKey!==old?.clientKey),sendError:''})}}})},
 async send(this:any){
  if(this.sending||!this.visible)return
  if(this.identity!==this.chatPort.identity()){this.onShow();return}
  const content=this.pending?this.pending.content:this.data.draft.trim();if(!content||[...content].length>500){wx.showToast({title:'请输入1至500字',icon:'none'});return}
  if(!this.chatPort.configured()){this.chatPort.sendDemo(content);this.setData({draft:''});this.refresh();return}
  this.pending=this.pending||{content,clientKey:supportKey()};const pending=this.pending,identity=this.identity,epoch=this.sendEpoch
  const localId='local-'+pending.clientKey,existing=this.data.messages.find((m:any)=>m.id===localId)
  const local={id:localId,clientKey:pending.clientKey,content,sender:this.chatPort.sender,seq:'0',createdAt:Date.now(),time:'本机 '+supportTime(Date.now()),mine:true,read:false,local:true,delivery:'sending'}
  this.sending=true;this.setData({messages:existing?this.data.messages.map((m:any)=>m.id===localId?{...m,delivery:'sending'}:m):this.data.messages.concat(local),draft:'',bottomId:'msg-'+localId,sending:true,sendError:''})
  try{
   const r=await this.chatPort.post('messages',pending)
   if(!r.message||typeof r.message.id!=='string'||!/^\d+$/.test(String(r.message.seq))||r.message.sender!==this.chatPort.sender||r.message.content!==content)throw Error('invalid_response')
   if(!this.disposed&&epoch===this.sendEpoch&&identity===this.chatPort.identity()&&identity===this.identity){
    this.pending=null
    const confirmed={...r.message,time:supportTime(r.message.createdAt),mine:true,read:false,delivery:'confirmed'}
    const messages=this.data.messages.filter((m:any)=>m.id!==localId&&m.id!==confirmed.id).concat(confirmed).sort((a:any,b:any)=>a.local?1:b.local?-1:compareSupportSeq(a.seq,b.seq))
    this.setData({messages,sendError:''});this.remember()
   }
  }catch(e){if(!this.disposed&&epoch===this.sendEpoch&&identity===this.chatPort.identity()&&identity===this.identity&&this.pending?.clientKey===pending.clientKey){this.setData({messages:this.data.messages.map((m:any)=>m.id===localId?{...m,delivery:'failed'}:m),sendError:supportError(e)+'；消息未确认，点击重试将使用同一发送编号。'});this.remember()}}
  finally{if(!this.disposed&&epoch===this.sendEpoch&&identity===this.chatPort.identity()){this.sending=false;this.setData({sending:false})}}

 }
}
}
