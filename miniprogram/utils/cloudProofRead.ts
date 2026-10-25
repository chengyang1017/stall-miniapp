// PHASE38_PROOF_READ: request short-lived signed photo URL from the authorized order API.
import { supportIdentity } from './supportCloud'
export function cloudProofUrl(apiBase:string,storeSlug:string,id:string,merchant=false):Promise<string>{
 const identity=supportIdentity()
 const token=wx.getStorageSync('stall_server_session_v1')
 if(typeof token!=='string'||!token)return Promise.reject(new Error('not_logged_in'))
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug))return Promise.reject(new Error('invalid_order'))
 const endpoint=apiBase.replace(/\/$/,'')+'/v1/'+(merchant?'merchant/stores/':'stores/')+storeSlug+'/orders/'+id+'/proof'
 return new Promise((resolve,reject)=>wx.request({url:endpoint,method:'GET',timeout:15000,header:{Authorization:'Bearer '+token},success:(r:any)=>identity===supportIdentity()&&r.statusCode===200&&typeof r.data?.url==='string'&&/^https:\/\//.test(r.data.url)?resolve(r.data.url):reject(new Error('proof_read_failed_'+r.statusCode)),fail:reject}))
}
