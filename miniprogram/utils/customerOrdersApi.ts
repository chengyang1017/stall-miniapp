// PHASE35_CUSTOMER_ORDERS
const CONFIG_KEY = 'stall_cloud_catalog_config_v1'
const TOKEN_KEY = 'stall_server_session_v1'
export function customerOrdersConfig(): {apiBase:string;storeSlug:string}|null {
 const cfg=wx.getStorageSync(CONFIG_KEY) as any
 if (!cfg || typeof cfg.apiBase!=='string' || typeof cfg.storeSlug!=='string') return null
 const apiBase=cfg.apiBase.trim().replace(/\/$/,'')
 const storeSlug=cfg.storeSlug.trim()
 let local=false
 try {local=wx.getSystemInfoSync().platform==='devtools' && /^http:\/\/(127\.0\.0\.1|localhost):8787$/.test(apiBase)}catch(_){}
 if(!(/^https:\/\//.test(apiBase)||local)||!/^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug))return null
 return {apiBase,storeSlug}
}
export function customerOrdersRequest(cfg:{apiBase:string;storeSlug:string},id?:string):Promise<any> {
 const token=wx.getStorageSync(TOKEN_KEY)
 if(typeof token!=='string'||!token)return Promise.reject(new Error('not_logged_in'))
 if(id && !/^[0-9a-f-]{36}$/i.test(id))return Promise.reject(new Error('invalid_order_id'))
 const uri=cfg.apiBase+'/v1/stores/'+cfg.storeSlug+'/orders'+(id?'/'+encodeURIComponent(id):'')
 return new Promise((resolve,reject)=>wx.request({url:uri,method:'GET',timeout:15000,header:{Authorization:'Bearer '+token},success:(res:any)=>{
   if(res.statusCode===200)resolve(res.data)
   else reject(new Error('http_'+res.statusCode))
 },fail:reject}))
}
