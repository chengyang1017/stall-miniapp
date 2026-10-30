import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
import {createHash} from 'node:crypto'
import {CATEGORY_ICON_KEYS,validCategoryIconKey,categoryIconsSupported} from '../src/categoryIcons.mjs'
import {categoryRevision,categoryWrite} from '../src/categoryManagement.mjs'
const root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8'),clone=x=>JSON.parse(JSON.stringify(x))
function evaluate(p,globals={},names=[]){const code=stripTypeScriptTypes(read(p),{mode:'strip'}).replace(/^import .*$/gm,'').replace(/^export /gm,'');return vm.runInNewContext(code+'\n;({'+names.join(',')+'})',globals,{filename:p})}
const icons=evaluate('miniprogram/modules/shared/domain/categoryIcons.ts',{},['CATEGORY_ICONS','validCategoryIconKey','resolveCategoryIcon','categoryIconView'])
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
function fixture(cloud=false){let definition,subject='A',store={categories:[{id:'a',name:'饮料',iconKey:'drink'},{id:'b',name:'米饭',iconKey:'rice'}],products:[]};const reads=[],writes=[],toasts=[]
 const globals={...icons,Page:d=>definition=d,getCloudContext:()=>cloud?{apiBase:'https://unit.invalid',storeSlug:'store-a'}:null,supportIdentity:()=>subject,loadStore:()=>store,saveStore:s=>store=clone(s),newId:()=> 'new-category',cachedCloudCategories:()=>null,readCloudCategories:()=>{const gate=deferred();reads.push(gate);return gate.promise},writeCloudCategories:(method,id,body)=>{const gate=deferred();writes.push({...gate,method,id,body});return gate.promise},wx:{showToast:o=>toasts.push(o.title),showModal:o=>o.success({confirm:true}),getSystemInfoSync:()=>({windowWidth:375})}}
 evaluate('miniprogram/pages/admin-categories/admin-categories.ts',globals)
 const create=()=>{const p={...definition,data:clone(definition.data),setData(patch){for(const [key,value]of Object.entries(patch)){const parts=key.match(/[^.[\]]+/g);let dest=this.data;for(const part of parts.slice(0,-1))dest=dest[part];dest[parts.at(-1)]=clone(value)}}};p.onLoad();p.onShow();return p}
 const p=create(),event=(id,key)=>({currentTarget:{dataset:{id,key}}})
 return {p,create,reads,writes,toasts,event,store:()=>store,subject:v=>subject=v,async load(supported=true){reads.at(-1).resolve({items:clone(store.categories),revision:'r1',categoryIconsSupported:supported});await tick()}}
}
test('44 icon keys match the independent server whitelist and own local purple/white assets',()=>{
 assert.equal(icons.CATEGORY_ICONS.length,44);assert.deepEqual(clone(icons.CATEGORY_ICONS.map(x=>x.key)),CATEGORY_ICON_KEYS)
 for(const icon of icons.CATEGORY_ICONS){assert.match(read('miniprogram'+icon.path),/<svg/);assert.match(read('miniprogram'+icon.activePath),/#ffffff/);assert.equal(validCategoryIconKey(icon.key),true)}
 for(const value of ['https://unit.invalid/evil.svg','../bad','<svg>','unknown',1,{}]){assert.equal(icons.validCategoryIconKey(value),false);assert.equal(validCategoryIconKey(value),false)}
})
test('explicit merchant choice takes precedence; missing and unknown keys have deterministic diverse defaults',()=>{
 assert.equal(icons.resolveCategoryIcon({name:'饮料',iconKey:'apple'}),'apple');assert.equal(icons.resolveCategoryIcon({name:'咖啡'}),'grid');assert.equal(icons.resolveCategoryIcon({name:'奶茶'}),'more');assert.equal(icons.resolveCategoryIcon({name:'饮料',iconKey:'https://evil.invalid'}),'more');assert.equal(icons.resolveCategoryIcon({name:'服装',iconKey:'shirt'}),'shirt');assert.equal(icons.resolveCategoryIcon({name:'宠物',iconKey:'pets'}),'pets')
 const categories=['123','456','你好','蔬菜','面食'].map((name,i)=>({id:String(i),name}));assert.ok(categories.every(c=>icons.resolveCategoryIcon(c)==='grid'));assert.equal(icons.resolveCategoryIcon(categories[0]),icons.resolveCategoryIcon(clone(categories[0])))
})
test('local add previews and persists merchant icon across page recreation',()=>{
 const f=fixture();f.p.onNewName({detail:{value:'新分类'}});f.p.openNewIconPicker();f.p.selectIcon(f.event('','coffee'));assert.match(f.p.data.newIconPath,/coffee.svg$/);f.p.closeIconPicker();f.p.addCategory();assert.equal(f.store().categories.at(-1).iconKey,'coffee');const reopened=f.create();assert.match(reopened.data.rows.at(-1).iconPath,/coffee.svg$/)
})
test('icon-only edit preserves category name, cancel does not mutate saved icon',()=>{
 const f=fixture();f.p.beginRename(f.event('a'));f.p.openEditIconPicker(f.event('a'));f.p.selectIcon(f.event('a','snowflake'));f.p.closeIconPicker();f.p.saveRename();assert.equal(f.store().categories[0].iconKey,'snowflake');assert.equal(f.store().categories[0].name,'饮料');f.p.beginRename(f.event('a'));f.p.openEditIconPicker(f.event('a'));f.p.selectIcon(f.event('a','cake'));f.p.cancelRename();assert.equal(f.store().categories[0].iconKey,'snowflake')
})
test('local sorting and deletion retain category icons without modifying row height',()=>{
 const f=fixture(),h=f.p.data.rowHeight;f.p.handleStart({currentTarget:{dataset:{id:'a'}},touches:[{pageY:0}]});f.p.handleMove({currentTarget:{dataset:{id:'a'}},touches:[{pageY:1000}]});f.p.handleEnd(f.event('a'));assert.deepEqual(f.store().categories.map(x=>[x.id,x.iconKey]),[['b','rice'],['a','drink']]);assert.equal(f.p.data.rowHeight,h);f.p.deleteCategory(f.event('b'));assert.deepEqual(f.store().categories.map(x=>x.iconKey),['drink'])
})
test('legacy cloud service permits name changes but never pretends to save an icon',async()=>{
 const f=fixture(true);await f.load(false);f.p.openNewIconPicker();assert.equal(f.p.data.pickerTarget,'new');f.p.closeIconPicker();f.p.onNewName({detail:{value:'名称仍可保存'}});f.p.addCategory();assert.equal(f.writes.length,1);assert.equal(Object.hasOwn(f.writes[0].body,'iconKey'),false)
})
test('supported cloud submits icon and revision; pending and failed writes retain icon draft',async()=>{
 const f=fixture(true);await f.load();f.p.beginRename(f.event('a'));f.p.openEditIconPicker(f.event('a'));f.p.selectIcon(f.event('a','cake'));f.p.closeIconPicker();f.p.saveRename();assert.equal(f.writes[0].body.iconKey,'cake');assert.equal(f.writes[0].body.expectedRevision,'r1');assert.equal(f.p.data.syncState,'pending');f.writes[0].reject(Error('http_409'));await tick();assert.equal(f.p.data.editingIconKey,'cake');assert.equal(f.p.data.categories[0].iconKey,'drink');assert.equal(f.p.data.syncState,'failed')
})
test('confirmed cloud icon edit is restored on the next category read',async()=>{
 const f=fixture(true);await f.load();f.p.beginRename(f.event('a'));f.p.openEditIconPicker(f.event('a'));f.p.selectIcon(f.event('a','cake'));f.p.saveRename();const items=f.p.data.categories.map(x=>x.id==='a'?{...x,iconKey:'cake'}:x);f.writes[0].resolve({ok:true,items,revision:'r2',categoryIconsSupported:true});await tick();assert.match(f.p.data.rows[0].iconPath,/cake.svg$/);assert.equal(f.p.data.editingId,'');const next=f.create();f.reads.at(-1).resolve({items,revision:'r2',categoryIconsSupported:true});await tick();assert.match(next.data.rows[0].iconPath,/cake.svg$/)
})
test('switching cloud identity drops icon drafts and rejects the old icon response',async()=>{
 const f=fixture(true);await f.load();f.p.beginRename(f.event('a'));f.p.openEditIconPicker(f.event('a'));f.p.selectIcon(f.event('a','cake'));f.p.saveRename();f.subject('B');f.p.onShow();assert.equal(f.p.data.editingIconKey,'');assert.equal(f.p.data.pickerTarget,'');f.writes[0].resolve({ok:true,items:[{id:'a',name:'old',iconKey:'cake'}],revision:'old',categoryIconsSupported:true});await tick();assert.equal(f.p.data.categories.length,0)
})
test('icon revisions preserve legacy hashes while detecting icon-only edits',()=>{
 const rows=[{id:'a',name:'A',sortOrder:0}],legacy=createHash('sha256').update(JSON.stringify([['a','A',0]])).digest('hex');assert.equal(categoryRevision(rows),legacy);assert.equal(categoryRevision([{...rows[0],iconKey:null}]),legacy);assert.notEqual(categoryRevision([{...rows[0],iconKey:'coffee'}]),categoryRevision([{...rows[0],iconKey:'rice'}]))
})
function database(supported=true){let rows=[{id:'a',name:'饮料',sortOrder:0,iconKey:null}],snapshot;const calls=[];const db={async query(sql,params=[]){calls.push({sql,params});if(sql==='BEGIN')snapshot=clone(rows);if(sql==='ROLLBACK')rows=snapshot;if(sql.includes('pg_attribute'))return {rows:[{supported}]};if(sql.startsWith('SELECT id,name'))return {rows:clone(rows)};if(sql.startsWith('INSERT INTO categories')){rows.push({id:'new',name:params[1],sortOrder:params[2],iconKey:params[3]??null});return {rowCount:1,rows:[]}}if(sql.startsWith('UPDATE categories SET name=')){const row=rows.find(x=>x.id===params[1]);if(!row)return {rowCount:0};row.name=params[2];if(sql.includes('icon_key=$4'))row.iconKey=params[3];return {rowCount:1}}if(sql.startsWith('DELETE FROM categories')){const exists=rows.some(x=>x.id===params[1]);rows=rows.filter(x=>x.id!==params[1]);return {rowCount:Number(exists)}}return {rows:[]}},release(){}};return {db,calls,rows:()=>rows,pool:{connect:async()=>db}}}
async function write(database,method,id,body){let result;await categoryWrite({method},{},database.pool,{id:'authorized-store'},id,body,(_res,status,data)=>result={status,data});return result}
test('server writes and reads allowlisted icon keys with the original category revision guard',async()=>{
 const f=database(),r=await write(f,'PATCH','a',{name:'饮料',iconKey:'coffee',expectedRevision:categoryRevision(f.rows())});assert.equal(r.status,200);assert.equal(r.data.items[0].iconKey,'coffee');assert.equal(r.data.categoryIconsSupported,true);assert.ok(f.calls.some(x=>x.sql.includes('WHERE store_id=$1 AND id=$2')&&x.params[0]==='authorized-store'));assert.notEqual(r.data.revision,categoryRevision([{id:'a',name:'饮料',sortOrder:0,iconKey:null}]))
})
test('server accepts automatic null icons and preserves explicit icons on old name-only edits',async()=>{
 const f=database();await write(f,'PATCH','a',{name:'饮料',iconKey:'coffee'});await write(f,'PATCH','a',{name:'改名'});assert.equal(f.rows()[0].iconKey,'coffee');await write(f,'PATCH','a',{name:'改名',iconKey:null});assert.equal(f.rows()[0].iconKey,null)
})
test('legacy database safely rejects icon saves but retains name-only creation without schema changes',async()=>{
 const f=database(false),r=await write(f,'PATCH','a',{name:'饮料',iconKey:'coffee'});assert.equal(r.status,503);assert.equal(r.data.error,'category_icons_not_available');assert.equal(f.calls.some(x=>/^(INSERT|UPDATE) categories/.test(x.sql)),false);assert.equal((await write(f,'POST','',{name:'新分类'})).status,200);assert.equal(f.calls.some(x=>/ALTER|CREATE TABLE/.test(x.sql)),false);assert.equal(await categoryIconsSupported(f.db),false)
})
test('invalid icons and stale revisions never mutate categories',async()=>{
 for(const value of ['unknown','https://evil.invalid/icon.svg','<svg>',42]){const f=database(),r=await write(f,'PATCH','a',{name:'饮料',iconKey:value});assert.equal(r.status,400);assert.equal(f.rows()[0].iconKey,null)}const f=database(),r=await write(f,'PATCH','a',{name:'饮料',iconKey:'coffee',expectedRevision:'stale'});assert.equal(r.status,409);assert.equal(f.rows()[0].iconKey,null)
})
test('customer category templates bind real per-category assets and retain selected white icons',()=>{
 for(const page of ['index','category']){const wxml=read('miniprogram/pages/'+page+'/'+page+'.wxml');assert.match(wxml,/item.iconActivePath : item.iconPath/);assert.match(wxml,/allCategoryIcon.iconActivePath/);assert.doesNotMatch(wxml,/<text>◇<\/text>\{\{item.name\}\}/)}assert.match(read('miniprogram/modules/customer/controllers/catalog.ts'),/categories\.map\(c=>\(\{\.\.\.c,\.\.\.categoryIconView\(c\)\}\)\)/)
})

function transport(){const requests=[];const api=evaluate('miniprogram/utils/merchantCategoriesCloud.ts',{getCloudContext:()=>({apiBase:'https://unit.invalid',storeSlug:'store-a'}),getSessionToken:()=> 'synthetic-session',supportIdentity:()=> 'customer-a',registerSessionCacheReset(){},wx:{request:r=>requests.push(r)}},['writeCloudCategories','cachedCloudCategories']);return {api,requests}}
test('icon save acknowledgement must include server capability and the exact saved icon',async()=>{
 for(const response of [{ok:true,items:[{id:'a',name:'A'}],revision:'r2',categoryIconsSupported:true},{ok:true,items:[{id:'a',name:'A',iconKey:'rice'}],revision:'r2',categoryIconsSupported:true},{ok:true,items:[{id:'a',name:'A',iconKey:'coffee'}],revision:'r2'}]){
  const f=transport(),pending=f.api.writeCloudCategories('PATCH','a',{name:'A',iconKey:'coffee',expectedRevision:'r1'});f.requests[0].success({statusCode:200,data:response});await assert.rejects(pending,/category_icon_write_unconfirmed/);assert.equal(f.api.cachedCloudCategories(),null)
 }
})
test('matching icon acknowledgement enters the scoped confirmed cache',async()=>{
 const f=transport(),pending=f.api.writeCloudCategories('PATCH','a',{name:'A',iconKey:'coffee',expectedRevision:'r1'});f.requests[0].success({statusCode:200,data:{ok:true,items:[{id:'a',name:'A',iconKey:'coffee'}],revision:'r2',categoryIconsSupported:true}});await pending;assert.equal(f.api.cachedCloudCategories().items[0].iconKey,'coffee')
})
test('server creation persists icon and deleting a different category retains it',async()=>{
 const f=database(),created=await write(f,'POST','',{name:'奶茶',iconKey:'bubble-tea',expectedRevision:categoryRevision(f.rows())});assert.equal(created.status,200);assert.equal(created.data.category.iconKey,'bubble-tea');const deleted=await write(f,'DELETE','a',{expectedRevision:created.data.revision});assert.equal(deleted.status,200);assert.equal(deleted.data.items[0].iconKey,'bubble-tea')
})
