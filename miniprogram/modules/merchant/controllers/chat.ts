import { createChatController } from '../../features/chat/controller'
import { getCloudContext,cloudIdentity } from '../../shared/runtime/context'
import { loginWithWechat } from '../../shared/runtime/auth'
import { merchantSupportGet,merchantSupportPost } from '../api/support'
import { displaySupportMessages,sendSupportMessage } from '../../shared/demo/support'
import type { ChatPort } from '../../shared/domain/chat'
export function createMerchantChatController(){return createChatController(()=>{
 let conversation=''
 const tail=(action:string)=>{if(!/^[0-9a-f-]{36}$/i.test(conversation))throw Error('http_404');return `conversations/${conversation}/${action}`}
 const port:ChatPort={sender:'merchant',bind(options){conversation=String(options.conversation||'');return conversation.slice(0,8)},configured:getCloudContext,identity:()=>cloudIdentity()+'|'+conversation,
  async login(){const c=getCloudContext();if(!c)throw Error('cloud_not_configured');await loginWithWechat(c.apiBase)},
  get(action,query){return merchantSupportGet(action==='unread'?'unread':tail(action),query)},
  post(action,body){return merchantSupportPost(tail(action),body)},
  demoMessages:displaySupportMessages,sendDemo(content){return sendSupportMessage('merchant',content)}}
 return port
 })
}
