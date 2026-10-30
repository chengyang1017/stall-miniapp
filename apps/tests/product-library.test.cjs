const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const fixture=require('./helpers/library-fixture.cjs')
const item=(id='p1',priceCents=1000)=>({id,name:'合成商品 '+id,priceCents,imageUrl:'https://images.invalid/'+id+'.jpg'})
const ids=rows=>Array.from(rows,row=>row.id)
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const remote=id=>({id,name:'云端合成商品',priceCents:1800,effectivePriceCents:1500,soldOut:false,categoryId:null,imageObjectKey:null})
const respond=(request,products)=>request.success({statusCode:200,data:{products,categories:[],hasMore:false,nextCursor:null}})
function demo(f){f.storage.set('stall_demo_v1',{categories:[],products:[{id:'p1',name:'最新合成商品',categoryId:'c1',price:12,discountPrice:null,discountStart:'',discountEnd:'',available:true}]})}
async function list(f,kind='favorites'){const p=f.page('product-library',{kind});p.visible=true;await p.loadRecords();return p}

test('favorite toggles persist without inventing browsing history',()=>{
  const f=fixture(),l=f.library
  assert.equal(l.toggleFavorite(item()),true);assert.deepEqual(ids(l.savedProducts('favorites')),['p1'])
  assert.equal(l.savedProducts('history').length,0);assert.equal(l.toggleFavorite(item()),false)
  assert.equal(l.savedProducts('favorites').length,0)
})
test('history is deduplicated, most recent first, and bounded to 100',()=>{
  const {library:l}=fixture()
  for(let n=0;n<105;n++)l.recordProductView(item('p'+n))
  l.recordProductView(item('p50',1200))
  const rows=l.savedProducts('history');assert.equal(rows.length,100);assert.equal(rows[0].id,'p50')
  assert.equal(rows[0].priceCents,1200);assert.equal(ids(rows).filter(id=>id==='p50').length,1)
  assert.equal(ids(rows).includes('p0'),false)
})
test('favorite cap refuses overflow without removing an existing favorite',()=>{
  const {library:l}=fixture();for(let n=0;n<200;n++)l.toggleFavorite(item('p'+n))
  assert.throws(()=>l.toggleFavorite(item('overflow')),/favorite_limit/)
  assert.equal(l.savedProducts('favorites').length,200);assert.equal(l.favoriteProduct('p0'),true)
})
test('revisiting updates favorite snapshots without changing favorite order or saved time',()=>{
  const {library:l}=fixture();l.toggleFavorite(item('p1'));l.toggleFavorite(item('p2'))
  const before=l.savedProducts('favorites')[1];l.recordProductView({...item('p1',2300),name:'新名称'})
  const rows=l.savedProducts('favorites');assert.deepEqual(ids(rows),['p2','p1']);assert.equal(rows[1].at,before.at)
  assert.equal(rows[1].name,'新名称');assert.equal(rows[1].priceCents,2300)
})
test('account, store, origin, guest and demo namespaces remain separate',()=>{
  const f=fixture('combined',true),l=f.library;l.toggleFavorite(item(uuid(1)))
  f.identity('b'.repeat(43),'2'.repeat(64));assert.equal(l.savedProducts('favorites').length,0)
  f.identity('c'.repeat(43),'1'.repeat(64));assert.equal(l.savedProducts('favorites').length,1)
  f.store('store-b');assert.equal(l.savedProducts('favorites').length,0)
  f.store('store-a','https://other.invalid');assert.equal(l.savedProducts('favorites').length,0)
  f.store('store-a');f.identity(null);assert.equal(l.savedProducts('favorites').length,0)
  f.storage.delete('stall_cloud_catalog_config_v1');assert.equal(l.savedProducts('favorites').length,0)
})
test('stale scope cannot read or mutate a replacement identity',()=>{
  const f=fixture('combined',true),l=f.library,scope=l.libraryScope();l.toggleFavorite(item(uuid(1)))
  f.identity('b'.repeat(43),'2'.repeat(64))
  assert.throws(()=>l.clearSavedProducts('favorites',scope),/context_changed/)
  assert.throws(()=>l.toggleFavorite(item(uuid(2)),scope),/context_changed/)
  assert.throws(()=>l.savedProducts('favorites',scope),/context_changed/)
  assert.equal(l.savedProducts('favorites').length,0)
})
test('stored snapshots exclude token, extra fields and signed image query strings',()=>{
  const f=fixture('combined',true),l=f.library
  l.recordProductView({...item(uuid(1)),imageUrl:'https://private.invalid/image?signature=synthetic',token:'never-persist-this',phone:'synthetic'})
  const raw=JSON.stringify([...f.storage].filter(([key])=>key.startsWith('stall_product_library_v1:')))
  assert.equal(raw.includes('never-persist-this'),false);assert.equal(raw.includes('signature'),false)
  assert.equal(raw.includes('a'.repeat(43)),false);assert.equal(l.savedProducts('history')[0].imageUrl,'')
})
test('corrupt records are filtered and invalid incoming products cannot overwrite data',()=>{
  const {library:l,storage}=fixture(),scope=l.libraryScope()
  storage.set(scope.key,{version:1,favorites:[{...item(),at:1},{...item(),at:2},null,{id:'bad',priceCents:-1}],history:'broken'})
  assert.deepEqual(ids(l.savedProducts('favorites')),['p1']);assert.equal(l.savedProducts('history').length,0)
  assert.throws(()=>l.toggleFavorite(item('bad',NaN)),/invalid_library_product/)
  assert.equal(l.savedProducts('favorites').length,1)
})
test('remove and clear affect only the chosen kind',()=>{
  const {library:l}=fixture();l.toggleFavorite(item());l.recordProductView(item());l.removeSavedProduct('favorites','p1')
  assert.equal(l.savedProducts('favorites').length,0);assert.equal(l.savedProducts('history').length,1)
  l.toggleFavorite(item());l.clearSavedProducts('history');assert.equal(l.savedProducts('favorites').length,1)
})
test('favorites and history survive a fresh module session on the same device',()=>{
  const first=fixture('combined',true);first.library.toggleFavorite(item(uuid(1)));first.library.recordProductView(item(uuid(2)))
  const restored=fixture('combined',true);for(const [key,value] of first.storage)restored.storage.set(key,structuredClone(value))
  assert.deepEqual(ids(restored.library.savedProducts('favorites')),[uuid(1)])
  assert.deepEqual(ids(restored.library.savedProducts('history')),[uuid(2)])
})

for(const target of ['combined','customer']){
  test(`${target}: existing detail button favorites and confirmed visits create history`,async()=>{
    const f=fixture(target);demo(f);const p=f.page('product-detail',{id:'p1'});await p.refresh()
    assert.deepEqual(ids(f.library.savedProducts('history')),['p1']);assert.equal(p.data.isFavorite,false)
    p.favorite();assert.equal(p.data.isFavorite,true);assert.equal(f.library.favoriteProduct('p1'),true)
    p.favorite();assert.equal(p.data.isFavorite,false);assert.equal(f.library.savedProducts('history').length,1)
  })
  test(`${target}: invalid detail does not record a visit or allow favorite`,async()=>{
    const f=fixture(target);demo(f);const p=f.page('product-detail',{id:'missing'});await p.refresh();p.favorite()
    assert.equal(f.library.savedProducts('history').length,0);assert.equal(f.library.savedProducts('favorites').length,0)
  })
  test(`${target}: late cloud detail after identity change creates no history in either account`,async()=>{
    const f=fixture(target,true),p=f.page('product-detail',{id:uuid(1)});const pending=p.refresh()
    f.identity('b'.repeat(43),'2'.repeat(64));respond(f.requests[0],[remote(uuid(1))]);await pending
    assert.equal(f.library.savedProducts('history').length,0)
    f.identity('c'.repeat(43),'1'.repeat(64));assert.equal(f.library.savedProducts('history').length,0)
  })
  test(`${target}: storage failure reports unsuccessful favorite instead of fake success`,async()=>{
    const f=fixture(target);demo(f);const p=f.page('product-detail',{id:'p1'});await p.refresh();f.failWrites();p.favorite()
    assert.equal(p.data.isFavorite,false);assert.ok(f.toasts.some(text=>text.includes('保存失败')))
  })
  test(`${target}: saved list uses live demo price, preserves deleted rows and allows removing them`,async()=>{
    const f=fixture(target);demo(f);f.library.toggleFavorite(item());f.library.toggleFavorite(item('missing'))
    const p=await list(f);assert.equal(p.data.rows[0].canOpen,false);assert.match(p.data.rows[0].status,/下架/)
    assert.equal(p.data.rows[1].priceText,'12.00');assert.equal(p.data.rows[1].confirmed,true)
    p.openProduct({currentTarget:{dataset:{id:'p1'}}});assert.ok(f.navigation[0].endsWith('?id=p1'))
    p.removeProduct({currentTarget:{dataset:{id:'missing'}}});assert.equal(p.data.rows.length,1)
    assert.deepEqual(ids(f.library.savedProducts('favorites')),['p1'])
  })
  test(`${target}: sold out product stays visible and can open its detail`,async()=>{
    const f=fixture(target);demo(f);const store=f.storage.get('stall_demo_v1');store.products[0].soldOut=true
    f.library.recordProductView(item());const p=await list(f,'history')
    assert.equal(p.data.rows[0].status,'暂时缺货');assert.equal(p.data.rows[0].canOpen,true)
  })
  test(`${target}: cloud lookup batches at most 40 IDs and confirms current prices`,async()=>{
    const f=fixture(target,true);for(let n=0;n<45;n++)f.library.toggleFavorite(item(uuid(n)))
    const p=f.page('product-library');p.visible=true;const pending=p.loadRecords();assert.equal(f.requests.length,2)
    for(const request of f.requests){const ids=new URL(request.url).searchParams.get('ids').split(',');assert.ok(ids.length<=40);respond(request,ids.map(remote))}
    await pending;assert.equal(p.data.rows.length,45);assert.equal(p.data.rows[0].priceText,'15.00')
    assert.equal(p.data.loading,false);assert.equal(f.storage.has('stall_demo_v1'),false)
  })
  test(`${target}: cloud failure preserves explicitly stale snapshots and retry succeeds`,async()=>{
    const f=fixture(target,true);f.library.toggleFavorite(item(uuid(1)));const p=f.page('product-library');p.visible=true
    const first=p.loadRecords();f.requests[0].fail(Error('offline'));await first
    assert.ok(p.data.error);assert.equal(p.data.rows[0].confirmed,false);assert.equal(p.data.rows[0].canOpen,false)
    assert.equal(f.storage.has('stall_demo_v1'),false)
    const second=p.loadRecords();respond(f.requests[1],[remote(uuid(1))]);await second
    assert.equal(p.data.error,'');assert.equal(p.data.rows[0].confirmed,true)
  })
  for(const change of ['identity','store','hide'])test(`${target}: late response after ${change} cannot show previous records`,async()=>{
    const f=fixture(target,true);f.library.toggleFavorite(item(uuid(1)));const p=f.page('product-library');p.visible=true
    const pending=p.loadRecords()
    if(change==='identity')f.identity('b'.repeat(43),'2'.repeat(64));else if(change==='store')f.store('store-b');else p.onHide()
    respond(f.requests[0],[remote(uuid(1))]);await pending;assert.equal(p.data.rows.length,0);assert.equal(p.data.loading,false)
  })
  test(`${target}: old clear confirmation cannot delete another account or another kind`,async()=>{
    const f=fixture(target,true);f.library.toggleFavorite(item(uuid(1)));f.library.recordProductView(item(uuid(1)))
    const p=f.page('product-library');p.visible=true;const pending=p.loadRecords();respond(f.requests[0],[remote(uuid(1))]);await pending
    p.clearRecords();f.identity('b'.repeat(43),'2'.repeat(64));f.library.toggleFavorite(item(uuid(2)))
    f.modals[0].success({confirm:true});assert.deepEqual(ids(f.library.savedProducts('favorites')),[uuid(2)])
    f.identity('c'.repeat(43),'1'.repeat(64));assert.equal(f.library.savedProducts('favorites').length,1)
    assert.equal(f.library.savedProducts('history').length,1)
  })
  test(`${target}: clear only current history after confirmation and preserve favorite`,async()=>{
    const f=fixture(target);demo(f);f.library.toggleFavorite(item());f.library.recordProductView(item());const p=await list(f,'history')
    p.clearRecords();f.modals[0].success({confirm:false});assert.equal(p.data.rows.length,1)
    p.clearRecords();f.modals[1].success({confirm:true});assert.equal(p.data.rows.length,0)
    assert.equal(f.library.savedProducts('favorites').length,1);assert.equal(f.library.savedProducts('history').length,0)
  })
  test(`${target}: refreshing while clear dialog is pending invalidates the old confirmation`,async()=>{
    const f=fixture(target);demo(f);f.library.toggleFavorite(item());const p=await list(f)
    p.clearRecords();await p.loadRecords();f.modals[0].success({confirm:true})
    assert.equal(p.data.clearing,false);assert.equal(p.data.rows.length,1);assert.equal(f.library.savedProducts('favorites').length,1)
  })
  test(`${target}: switching library kind invalidates a pending clear dialog`,async()=>{
    const f=fixture(target);demo(f);f.library.toggleFavorite(item());f.library.recordProductView(item())
    const p=await list(f);p.clearRecords();p.chooseKind({currentTarget:{dataset:{kind:'history'}}})
    f.modals[0].success({confirm:true})
    assert.equal(p.data.kind,'history');assert.equal(p.data.rows.length,1)
    assert.equal(f.library.savedProducts('favorites').length,1);assert.equal(f.library.savedProducts('history').length,1)
  })
  test(`${target}: list storage read and write errors keep records recoverable`,async()=>{
    const f=fixture(target);demo(f);f.library.toggleFavorite(item());f.failReads();const p=await list(f)
    assert.ok(p.data.error);assert.equal(p.data.loading,false);f.failReads(false);await p.loadRecords()
    f.failWrites();p.removeProduct({currentTarget:{dataset:{id:'p1'}}})
    assert.equal(p.data.rows.length,1);assert.equal(f.library.savedProducts('favorites').length,1)
  })
  test(`${target}: existing profile and homepage entries open the shared library and show counts`,()=>{
    const f=fixture(target);f.library.toggleFavorite(item());f.library.recordProductView(item())
    const profile=f.page('profile');profile.refreshLibraryCounts();profile.openFavorites();profile.openHistory()
    const home=f.page('index');home.openFavorites()
    assert.equal(profile.data.favoriteCount,1);assert.equal(profile.data.historyCount,1)
    assert.equal(f.navigation.length,3);assert.ok(f.navigation[0].endsWith('?kind=favorites'));assert.ok(f.navigation[1].endsWith('?kind=history'))
  })
}
test('merchant output contains no customer library page or storage module',()=>{
  const root=path.resolve(__dirname,'../../dist/merchant/miniprogram')
  assert.equal(fs.existsSync(path.join(root,'pages/product-library')),false)
  assert.equal(fs.existsSync(path.join(root,'modules/customer/domain/productLibrary.js')),false)
})
