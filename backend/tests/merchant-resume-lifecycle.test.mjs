import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import vm from 'node:vm'
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function fixture(name='admin'){
 let definition,identity='A',cfg={apiBase:'https://unit.test',storeSlug:'store-a'}
 const requests=[],navigation=[],removed=[],loads=[],states=[]
 const wx={getStorageSync:()=>'',setStorageSync(){},removeStorageSync:k=>removed.push(k),showToast(){},navigateTo:x=>navigation.push(x),switchTab:x=>navigation.push(x)}
 const dependencies={hasRecentMerchantPermission:()=>false,CLOUD_ONLY:true,PUBLIC_API_BASE:"https://unit.test",merchantOrderContextKey:()=>identity,merchantOrderConfig:()=>cfg,getCloudContext:()=>cfg,supportIdentity:()=>identity,businessContextKey:()=>identity,CAN_OPEN_CUSTOMER:true,CAN_OPEN_MERCHANT:true,
 authorizedGet:()=>{const d=deferred();requests.push(d);return d.promise},supportConfig:()=>null,openMerchantWorkspace:()=>navigation.push('merchant')}
 const code=stripTypeScriptTypes(readFileSync(new URL(`../../miniprogram/pages/${name}/${name}.ts`,import.meta.url),'utf8'),{mode:'strip'}).replace(/^import .* from .*$/gm,'')
 vm.runInNewContext(code,{...dependencies,Page:x=>{definition=x},wx,clearTimeout(){},setTimeout(){return 1}})
 const p={...definition,data:structuredClone(definition.data),setData(v){states.push(v);Object.assign(this.data,v)}}
 if(name==='admin'){p.refreshMinimum=()=>{loads.push('minimum');p.setData({settingsReady:true})};p.refreshNewOrderNotice=()=>loads.push('orders');p.refreshSupport=()=>loads.push('support')}
 return {p,requests,navigation,removed,loads,states,identity:v=>{identity=v},store:()=>{cfg={...cfg,storeSlug:'store-b'};identity='B'}}
}
async function grant(f){const p=f.p.onShow();f.requests.at(-1).resolve({items:[]});await p}
test('first workbench entry is blocked until actual permission response',async()=>{const f=fixture(),pending=f.p.onShow();assert.equal(f.p.data.workspaceAuthorized,false);assert.equal(f.p.data.accessLoading,true);f.requests[0].resolve({items:[]});await pending;assert.equal(f.p.data.workspaceAuthorized,true)})
test('ten background resumes retain authorized UI and never navigate or reload editable settings',async()=>{const f=fixture();await grant(f);f.p.data.minimumOrderInput='123.45';for(let i=0;i<10;i++){f.p.onHide();const pending=f.p.onShow();assert.equal(f.p.data.workspaceAuthorized,true);assert.equal(f.p.data.accessLoading,false);f.requests.at(-1).resolve({items:[]});await pending}assert.equal(f.p.data.minimumOrderInput,'123.45');assert.equal(f.loads.filter(x=>x==='minimum').length,1);assert.deepEqual(f.navigation,[])})
for(const failure of [Error('timeout'),Error('http_503'),Error('http_500'),Error('malformed')])test(`resume preserves UI on ${failure.message}`,async()=>{const f=fixture();await grant(f);f.p.onHide();const pending=f.p.onShow();f.requests.at(-1).reject(failure);await pending;assert.equal(f.p.data.workspaceAuthorized,true);assert.match(f.p.data.accessError,/已保留/);assert.equal(f.p.data.accessLoading,false)})
for(const code of [401,403])test(`explicit ${code} revokes workbench without navigation`,async()=>{const f=fixture();await grant(f);const pending=f.p.onShow();f.requests.at(-1).reject(Error('http_'+code));await pending;assert.equal(f.p.data.workspaceAuthorized,false);assert.equal(f.p.data.settingsReady,false);assert.equal(f.removed.includes('stall_server_session_v1'),code===401);assert.deepEqual(f.navigation,[])})
for(const change of ['identity','store'])test(`${change} change blocks old UI and stale responses`,async()=>{const f=fixture();await grant(f);const old=f.p.onShow();change==='store'?f.store():f.identity('new');const fresh=f.p.onShow();assert.equal(f.p.data.workspaceAuthorized,false);f.requests.at(-1).resolve({items:[]});await fresh;f.requests[1].reject(Error('http_401'));await old;assert.equal(f.p.data.workspaceAuthorized,true);assert.deepEqual(f.removed,[])})
for(const lifecycle of ['onHide','onUnload'])test(`${lifecycle} invalidates outstanding permission response`,async()=>{const f=fixture(),pending=f.p.onShow();f.p[lifecycle]();const count=f.states.length;f.requests[0].resolve({items:[]});await pending;assert.equal(f.states.length,count);assert.equal(f.p.data.workspaceAuthorized,false)})
test('old finally cannot clear new loading state',async()=>{const f=fixture(),old=f.p.onShow();f.identity('new');const fresh=f.p.onShow();f.requests[0].reject(Error('timeout'));await old;assert.equal(f.p.data.accessLoading,true);f.requests[1].resolve({items:[]});await fresh;assert.equal(f.p.data.accessLoading,false)})
test('invalid first permission response never grants access',async()=>{const f=fixture(),pending=f.p.onShow();f.requests[0].resolve({});await pending;assert.equal(f.p.data.workspaceAuthorized,false)})
for(const code of ['timeout','http_403','http_401'])test(`profile retains only transient failures: ${code}`,async()=>{const f=fixture('profile');let pending=f.p.checkMerchant();f.requests[0].resolve({items:[]});await pending;f.p.onHide();pending=f.p.checkMerchant();assert.equal(f.p.data.merchantAuthorized,true);f.requests[1].reject(Error(code));await pending;assert.equal(f.p.data.merchantAuthorized,code==='timeout')})
test('profile identity change and unload reject old permission result',async()=>{const f=fixture('profile');const old=f.p.checkMerchant();f.identity('B');const fresh=f.p.checkMerchant();f.requests[0].resolve({items:[]});await old;assert.equal(f.p.data.merchantAuthorized,false);f.p.onUnload();f.requests[1].resolve({items:[]});await fresh;assert.equal(f.p.data.merchantAuthorized,false)})


test('order resume retains filters, loaded data, unsaved notes and ETA; context change clears private drafts',()=>{
 const f=fixture('admin-orders'),p=f.p;p.context='A';p.loaded=[{id:'one'}];p.data.dateResults=[{id:'one'}];p.data.noteInputs={one:'unsaved'};p.data.etaInputs={one:'tomorrow'};p.data.currentTab='accepted';let args;p.fetchPage=(...v)=>{args=v}
 p.onHide();p.onShow();assert.equal(p.data.noteInputs.one,'unsaved');assert.equal(p.data.etaInputs.one,'tomorrow');assert.equal(p.data.currentTab,'accepted');assert.equal(p.data.dateResults[0].id,'one');assert.deepEqual(args,[true,true]);f.identity('B');p.onShow();assert.equal(Object.keys(p.data.noteInputs).length,0);assert.equal(p.data.dateResults.length,0)
})
test('business hours resume preserves unsaved schedule/notice; new context reloads',()=>{
 const f=fixture('store-hours'),p=f.p;p.context='A';p.data.ready=true;p.data.notice='unsaved';p.data.days=[{start:'09:00'}];let reads=0;p.refresh=()=>reads++;p.onShow();assert.equal(reads,0);assert.equal(p.data.notice,'unsaved');assert.equal(p.data.days[0].start,'09:00');f.identity('B');p.onShow();assert.equal(reads,1)
})

test('profile explicit entry still revalidates and revokes on 403 without navigation',async()=>{const f=fixture('profile');let pending=f.p.checkMerchant();f.requests[0].resolve({items:[]});await pending;pending=f.p.openMerchant();f.requests[1].reject(Error('http_403'));await pending;assert.equal(f.p.data.merchantAuthorized,false);assert.deepEqual(f.navigation,[])})
