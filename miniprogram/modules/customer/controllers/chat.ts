import { createChatController } from '../../features/chat/controller'
import { getCloudContext,cloudIdentity } from '../../shared/runtime/context'
import { loginWithWechat } from '../../shared/runtime/auth'
import { customerSupportGet,customerSupportPost } from '../api/support'
import { displaySupportMessages,sendSupportMessage } from '../../shared/demo/support'
import type { ChatPort } from '../../shared/domain/chat'
export function createCustomerChatController(){return createChatController(()=>{
 let conversation=''
 const tail=(action:string)=>{return action}
 const port:ChatPort={sender:'customer',bind(options){conversation='';void options;return conversation.slice(0,8)},configured:getCloudContext,identity:cloudIdentity,
  async login(){const c=getCloudContext();if(!c)throw Error('cloud_not_configured');await loginWithWechat(c.apiBase)},
  get(action,query){return customerSupportGet(action==='unread'?'unread':tail(action),query)},
  post(action,body){return customerSupportPost(tail(action),body)},
  demoMessages:displaySupportMessages,sendDemo(content){return sendSupportMessage('customer',content)}}
 return port
 })
}
