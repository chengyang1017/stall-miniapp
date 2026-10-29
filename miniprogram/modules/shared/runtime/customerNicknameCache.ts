// Display-only nickname cache, keyed by the server-provided customer cache scope.
// This is not an authorization cache and is never used to identify an account.
import { sessionScope } from './sessionScope'
const PREFIX='stall_customer_nickname_by_scope_v1_'
function key():string|null{
  if(!wx.getStorageSync('stall_server_session_v1'))return null
  const scope=sessionScope()
  return /^[a-f0-9]{64}$/.test(scope)?PREFIX+scope:null
}
export function cachedCustomerNickname():string{
  const k=key()
  if(!k)return ''
  const value=wx.getStorageSync(k)
  return typeof value==='string'?value.slice(0,30):''
}
export function cacheCustomerNickname(nickname:string):void{
  const k=key()
  if(k)wx.setStorageSync(k,nickname.slice(0,30))
}
