export function supportTime(value:string|number):string {
 const d=new Date(new Date(value).getTime()+8*3600000),p=(n:number)=>String(n).padStart(2,'0')
 return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}
export function supportKey():string{return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return(c==='x'?n:(n&3)|8).toString(16)})}
// Decimal sequences stay strings; avoid losing bigint precision in Mini Program runtimes.
export function compareSupportSeq(a:string,b:string):number {a=String(a).replace(/^0+(?=\d)/,'');b=String(b).replace(/^0+(?=\d)/,'');return a.length-b.length||(a<b?-1:a>b?1:0)}
export function supportError(e:any):string {
 const s=String(e&&e.message||e)
 if(/401|not_logged_in/.test(s))return '请先使用微信登录后重试'
 if(/403/.test(s))return '没有当前店铺的客服权限'
 if(/404/.test(s))return '店铺或会话不存在，或无权访问'
 if(/429/.test(s))return '发送过于频繁，请稍后重试'
 if(/409/.test(s))return '会话已变化，请刷新；发送重试请保留原消息'
 return '云端请求失败，请检查网络后重试（不会切换为本地消息）'
}
