const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const clone=value=>value===undefined?undefined:structuredClone(value)
module.exports=function fixture(target='combined',cloud=false){
  const root=path.resolve(__dirname,'../../../dist',target,'miniprogram')
  const storage=new Map(),requests=[],modals=[],toasts=[],navigation=[],cache=new Map(),pages=new Map()
  let registered,failWrites=false,failReads=false
  if(cloud){storage.set('stall_cloud_catalog_config_v1',{apiBase:'https://catalog.invalid',storeSlug:'store-a'});storage.set('stall_server_session_v1','a'.repeat(43));storage.set('stall_server_cache_scope_v1','1'.repeat(64))}
  const wx={
    getStorageSync:key=>{if(failReads&&key.startsWith('stall_product_library_v1:'))throw Error('synthetic read failure');return clone(storage.get(key))},
    setStorageSync:(key,value)=>{if(failWrites&&key.startsWith('stall_product_library_v1:'))throw Error('synthetic quota');storage.set(key,clone(value))},
    removeStorageSync:key=>storage.delete(key),getSystemInfoSync:()=>({platform:'devtools'}),getMenuButtonBoundingClientRect:()=>({top:24}),
    request:args=>requests.push(args),showModal:args=>modals.push(args),showToast:args=>toasts.push(args.title),
    navigateTo:args=>navigation.push(args.url),setNavigationBarTitle:()=>{},stopPullDownRefresh:()=>{},
    setTabBarBadge:()=>{},removeTabBarBadge:()=>{},showShareMenu:()=>{},hideShareMenu:()=>{}
  }
  function load(name){
    const file=path.resolve(root,name.endsWith('.js')?name:name+'.js')
    if(cache.has(file))return cache.get(file).exports
    const module={exports:{}};cache.set(file,module)
    const wrap=vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})',{wx,Page:p=>{registered=p},setTimeout,clearTimeout,console},{filename:file})
    wrap(spec=>load(path.relative(root,path.resolve(path.dirname(file),spec+'.js'))),module,module.exports)
    return module.exports
  }
  function page(name,options={}){
    if(pages.has(name))return pages.get(name)
    load('pages/'+name+'/'+name)
    const p=registered;p.data=clone(p.data);p.setData=values=>Object.assign(p.data,clone(values));pages.set(name,p);p.onLoad?.(options);return p
  }
  const library=load('modules/customer/domain/productLibrary')
  return {root,storage,requests,modals,toasts,navigation,library,page,load,wx,
    failWrites(value=true){failWrites=value},failReads(value=true){failReads=value},
    identity(token,scope){if(!token)storage.delete('stall_server_session_v1');else{storage.set('stall_server_session_v1',token);load('modules/shared/runtime/sessionScope').rememberSessionScope(token,scope)}},
    store(slug,apiBase='https://catalog.invalid'){storage.set('stall_cloud_catalog_config_v1',{apiBase,storeSlug:slug})}
  }
}
