// No persistence of UI data, tokens, URLs or raw identity values. Devtools opt-in only.
const KEY='stall_ui_trace_v1',LIMIT=600
let events:any[]=[],sequence=0,requestId=0,aliasId=0,patchId=0
const scopes=new Map<string,string>(),rows=new Map<string,string>(),apis=new Map<string,string>(),stores=new Map<string,string>(),sessions=new Map<string,string>()
export function uiTraceEnabled():boolean{try{return wx.getSystemInfoSync().platform==='devtools'&&wx.getStorageSync(KEY)===true}catch(_){return false}}
function alias(map:Map<string,string>,key:string,prefix:string){if(!map.has(key)){if(map.size>=2000)map.delete(map.keys().next().value!);map.set(key,prefix+(++aliasId))}return map.get(key)!}
export function traceRow(key:string):string{return alias(rows,key,'R')}
function push(event:any){if(!uiTraceEnabled())return;const entry={seq:++sequence,at:Date.now(),...event};events.push(entry);if(events.length>LIMIT)events.shift();try{console.info('[stall-ui]',entry)}catch(_){}}
export function readUiTrace():any[]{return uiTraceEnabled()?JSON.parse(JSON.stringify(events)):[]}
export function clearUiTrace(){events=[]}
function summary(page:any){const data=page.data||{},counts:any={},keys:any={};for(const field of ['items','products','discountedProducts','categories']){if(Array.isArray(data[field])){counts[field]=data[field].length;keys[field]=data[field].slice(0,120).map((r:any)=>traceRow(String(r?.productId||r?.id||'')))}}
 return {counts,keys,quantities:Array.isArray(data.items)?data.items.slice(0,40).map((r:any)=>({key:traceRow(String(r?.productId||'')),quantity:Number.isSafeInteger(r?.quantity)?r.quantity:null})):undefined,totalCount:data.totalCount,flags:['cloudLoading','deliveryLoading','quantityPending','cloudBusy','entryLoading','entryBlocking','cloudConnectionError','uiTraceEnabled'].reduce((out:any,k)=>{out[k]=!!data[k];return out},{}),hasEntryError:!!data.entryError,placeholderStyle:['none','classic','mountain','bag','playful','premium','custom'].includes(data.placeholderStyle)?data.placeholderStyle:'unknown'}
}
function scope(page:any){try{return alias(scopes,String(page.__uiScope?.()||''),'C')}catch(_){return 'context-unavailable'}}
function contextMarks(page:any){
 try{const raw=JSON.parse(String(page.__uiScope?.()||'[]')),parts=typeof raw[2]==='string'&&raw[2].startsWith('[')?JSON.parse(raw[2]):raw
 return {api:alias(apis,String(parts[0]||''),'A'),store:alias(stores,JSON.stringify([parts[0],parts[1]]),'S'),session:alias(sessions,String(parts[2]||'guest'),'I')}
 }catch(_){return {api:'unknown',store:'unknown',session:'unknown'}}
}
export function traceUi(page:any,event:string,details:Record<string,number|boolean>={}){if(uiTraceEnabled())push({type:event,page:page.__uiTracePage||'page',scope:scope(page),context:contextMarks(page),...details,...summary(page)})}
function origin(){return (String(new Error().stack||'').match(/(?:[\w/-]+\/)?(?:cart|index|stableRows|storePresentation)\.(?:js|ts):\d+(?::\d+)?/g)||[]).slice(0,4)}
function inspectRendered(page:any,update:number){
 if(!uiTraceEnabled()||!page.__uiVisible)return
 try{wx.createSelectorQuery().in(page).selectAll('[data-trace-list]').fields({dataset:true,rect:true,size:true}).exec(result=>{
  if(!uiTraceEnabled()||!page.__uiVisible)return
  const nodes=Array.isArray(result?.[0])?result[0]:[]
  push({type:'render:rects',update,page:page.__uiTracePage,scope:scope(page),nodes:nodes.slice(0,120).map((n:any)=>({key:traceRow(String(n.dataset?.traceKey||'')),list:['items','products','discountedProducts','footer','checkout'].includes(n.dataset?.traceList)?n.dataset.traceList:'unknown',top:n.top,height:n.height,width:n.width})),count:nodes.length})
 })}catch(_){push({type:'render:query-unavailable',page:page.__uiTracePage})}
}
export function prepareUiTrace(page:any,name:string,getScope:()=>string){
 page.__uiTracePage=name;page.__uiScope=getScope;page.__uiVisible=true
 if(!uiTraceEnabled()&&page.__uiTraceInstalled&&page.setData===page.__uiTraceHook){try{page.setData=page.__uiRawSetData;page.__uiTraceInstalled=false}catch(_){}}
 if(uiTraceEnabled()&&page.__uiTraceInstalled&&page.setData!==page.__uiTraceHook)page.__uiTraceInstalled=false
 if(uiTraceEnabled()&&!page.__uiTraceInstalled){
  const raw=page.setData
  try{const wrapped=function(this:any,patch:any,callback?:()=>void){
   if(!uiTraceEnabled())return raw.call(this,patch,callback)
   const update=++patchId,before=summary(this),oldScope=this.__uiLastScope,nowScope=scope(this);this.__uiLastScope=nowScope
   push({type:'setData:before',update,page:name,scope:nowScope,context:contextMarks(this),scopeChanged:!!oldScope&&oldScope!==nowScope,patchKeyCount:Object.keys(patch).length,patchKeys:Object.keys(patch).slice(0,100),origin:origin(),before})
   const result=raw.call(this,patch,()=>{push({type:'setData:flushed',update,page:name,scope:scope(this),...summary(this)});inspectRendered(this,update);callback?.()})
   push({type:'setData:applied',update,page:name,scope:scope(this),...summary(this)});return result
  };page.setData=wrapped;if(page.setData!==wrapped)throw Error('hook_unavailable');page.__uiRawSetData=raw;page.__uiTraceHook=wrapped;page.__uiTraceInstalled=true}catch(_){push({type:'setData:hook-unavailable',page:name})}
 }
 if(uiTraceEnabled())try{const app=getApp<any>();app.globalData=app.globalData||{};app.globalData.uiTrace={read:readUiTrace,clear:clearUiTrace}}catch(_){}
 if(page.data.uiTraceEnabled!==uiTraceEnabled())page.setData({uiTraceEnabled:uiTraceEnabled()})
 traceUi(page,'onShow')
}
export function hideUiTrace(page:any,event:'onHide'|'onUnload'){traceUi(page,event);page.__uiVisible=false}
export function traceProbe(event:string,page:string,list:string,key:string,instance:number){if(uiTraceEnabled())push({type:'probe:'+event,page,list,key:traceRow(key),instance})}
export async function traceRequest<T>(operation:string,work:()=>Promise<T>):Promise<T>{
 if(!uiTraceEnabled())return work()
 const id=++requestId,start=Date.now();push({type:'request:start',operation,id,origin:origin()})
 try{const result=await work();push({type:'request:end',operation,id,ok:true,ms:Date.now()-start});return result}
 catch(error){const code=/http_(\d{3})/.exec(String((error as any)?.message||''))?.[1]||'network-or-response';push({type:'request:end',operation,id,ok:false,code,ms:Date.now()-start});throw error}
}
