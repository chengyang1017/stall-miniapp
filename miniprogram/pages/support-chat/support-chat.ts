import { displaySupportMessages, sendSupportMessage } from '../../utils/support'
import { supportConfig,supportIdentity,supportGet,supportPost,supportTime,supportKey,supportError,compareSupportSeq } from '../../utils/supportCloud'
import { loginWithWechat } from '../../utils/authApi'
Page({
 identity:'',visible:false,serial:0,reading:false,sending:false,merchant:false,conversation:'',timer:0 as any,pending:null as null|{content:string;clientKey:string},
 data:{messages:[] as any[],draft:'',bottomId:'',cloudMode:false,merchantMode:false,conversationLabel:'',loading:false,sending:false,loginBusy:false,error:'',sendError:'',hasOlder:false,ready:false,unread:null as number|null},
 onLoad(options:any){this.merchant=options.merchant==='1';this.conversation=this.merchant?String(options.conversation||''):'';this.setData({merchantMode:this.merchant,conversationLabel:this.conversation.slice(0,8)})},
 onShow(){this.visible=true;const identity=supportIdentity();if(identity!==this.identity){this.serial++;this.reading=false;this.identity=identity;this.pending=null;this.setData({messages:[],draft:'',sendError:'',error:'',ready:false,hasOlder:false,loading:false,unread:null})}this.setData({cloudMode:!!supportConfig()});this.refresh();this.schedule()},
 onHide(){this.visible=false;this.serial++;clearTimeout(this.timer);this.setData({messages:[],bottomId:'',ready:false,unread:null as number|null});this.reading=false;this.setData({loading:false})},
 onUnload(){this.visible=false;this.serial++;clearTimeout(this.timer);this.pending=null;this.setData({messages:[],draft:''})},
 schedule(){clearTimeout(this.timer);if(this.visible)this.timer=setTimeout(async()=>{await this.refresh();this.schedule()},12000)},
 current(serial:number,identity:string){return this.visible&&serial===this.serial&&identity===supportIdentity()},
 tail(action:string){if(this.merchant){if(!/^[0-9a-f-]{36}$/i.test(this.conversation))throw Error('http_404');return `conversations/${this.conversation}/${action}`}return action},
 async login(){const c=supportConfig();if(!c||this.data.loginBusy)return;this.setData({loginBusy:true});try{await loginWithWechat(c.apiBase);if(this.visible)this.onShow()}catch(e){this.setData({error:supportError(e)})}finally{this.setData({loginBusy:false})}},
 async refresh(older=false){
  if(!this.visible||this.reading)return
  if(this.identity!==supportIdentity()){this.onShow();return}
  if(!supportConfig()) {const messages=displaySupportMessages().map(m=>({...m,time:supportTime(m.createdAt),mine:m.sender===(this.merchant?'merchant':'customer'),read:false}));this.setData({messages,ready:true,hasOlder:false,bottomId:messages.length?'msg-'+messages[messages.length-1].id:''});return}
  this.reading=true;const serial=++this.serial,identity=this.identity,rows=this.data.messages
  this.setData({loading:true,error:''})
  try {
   const query:Record<string,string|number>={limit:30}
   if(rows.length){if(older)query.before=rows[0].seq;else query.after=rows[rows.length-1].seq}
   const r=await supportGet(this.merchant,this.tail('messages'),query)
   if(!this.current(serial,identity))return
   if(!Array.isArray(r.messages))throw Error('invalid_response')
   const seen=new Map<string,any>();rows.concat(r.messages).forEach((m:any)=>seen.set(m.id,m))
   const read=String(r.conversation&&(this.merchant?r.conversation.customerReadSeq:r.conversation.merchantReadSeq)||'0')
   const messages=Array.from(seen.values()).sort((a,b)=>compareSupportSeq(a.seq,b.seq)).map(m=>({...m,time:supportTime(m.createdAt),mine:m.sender===(this.merchant?'merchant':'customer'),read:compareSupportSeq(m.seq,read)<=0}))
   this.setData({messages,ready:true,hasOlder:older||!rows.length?r.hasMore:this.data.hasOlder,bottomId:older?this.data.bottomId:messages.length?'msg-'+messages[messages.length-1].id:''})
   if(messages.length&&this.current(serial,identity))await supportPost(this.merchant,this.tail('read'),{through:String(messages[messages.length-1].seq)})
   if(this.current(serial,identity)){const u=await supportGet(this.merchant,'unread');if(this.current(serial,identity))this.setData({unread:u.unread})}
  }catch(e){if(this.current(serial,identity)){if(/401|403/.test(String((e as any).message))){this.setData({messages:[],ready:false,hasOlder:false})}this.setData({error:supportError(e)})}}
  finally{if(serial===this.serial){this.reading=false;this.setData({loading:false})}}
 },
 async onPullDownRefresh(){await this.refresh();wx.stopPullDownRefresh()},
 reload(){this.refresh()},
 older(){if(this.data.hasOlder)this.refresh(true)},
 onInput(e:any){if(!this.sending&&!this.pending)this.setData({draft:String(e.detail.value)})},
 discard(){if(this.sending)return;const identity=this.identity;wx.showModal({title:'修改未确认消息',content:'原消息可能已到达服务端。建议先重试确认；修改后再次发送会被视为新消息。是否继续修改？',success:r=>{if(r.confirm&&!this.sending&&this.visible&&identity===supportIdentity()){this.pending=null;this.setData({sendError:''})}}})},
 async send(){
  if(this.sending||!this.visible)return
  if(this.identity!==supportIdentity()){this.onShow();return}
  const content=this.pending?this.pending.content:this.data.draft.trim();if(!content||[...content].length>500){wx.showToast({title:'请输入1至500字',icon:'none'});return}
  if(!supportConfig()){sendSupportMessage(this.merchant?'merchant':'customer',content);this.setData({draft:''});this.refresh();return}
  if(this.merchant&&!this.conversation)return
  this.pending=this.pending||{content,clientKey:supportKey()};const pending=this.pending,identity=this.identity
  this.sending=true;this.setData({sending:true,sendError:''})
  try{const r=await supportPost(this.merchant,this.tail('messages'),pending);if(!r.message||r.message.content!==content)throw Error('invalid_response');if(identity===supportIdentity()&&identity===this.identity){this.pending=null;this.setData({draft:'',sendError:''});if(this.visible)await this.refresh()}}
  catch(e){if(identity===supportIdentity()&&identity===this.identity)this.setData({sendError:supportError(e)+'；消息未确认，点击重试将使用同一发送编号。'})}
  finally{this.sending=false;this.setData({sending:false})}
 }
})
