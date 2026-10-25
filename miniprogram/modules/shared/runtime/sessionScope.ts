// Opaque cache namespace, never a credential. Cloud private data still requires server auth.
const KEY='stall_server_cache_scope_v1'
let seenToken:string|undefined
const fresh=()=>`unverified_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,14)}`
export function rememberSessionScope(token:string,scope?:string){seenToken=token;wx.setStorageSync(KEY,typeof scope==='string'&&/^[a-f0-9]{64}$/.test(scope)?scope:fresh())}
export function sessionScope():string{
 const token=wx.getStorageSync('stall_server_session_v1')
 if(typeof token!=='string'||!token){seenToken='';return 'guest'}
 if(seenToken!==undefined&&seenToken!==token)rememberSessionScope(token)
 seenToken=token
 let scope=wx.getStorageSync(KEY);if(typeof scope!=='string'||!scope){scope=fresh();wx.setStorageSync(KEY,scope)}return scope
}
