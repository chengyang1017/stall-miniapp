import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT,SOURCE,relative,walk,graph,checkInventory } from './miniapp-graph.mjs'
import { checkOutput } from './miniapp-output.mjs'
import { readPhoneProfile,cloudSource } from './phone-preview-profile.mjs'

const target=process.argv[2]||'combined'
const phone=process.env.STALL_PHONE_PREVIEW_PROFILE?readPhoneProfile(process.env.STALL_PHONE_PREVIEW_PROFILE):null
if(phone&&target!=='combined')throw Error('Phone preview uses the existing Combined application and one AppID')
checkInventory()
const {plan,files}=graph(target)
const output=path.join(ROOT,'dist',phone?'phone-preview':target),stage=path.join(output,'source'),miniapp=path.join(output,'miniprogram')
// Destructive operation is restricted to one fixed generated target, never source.
if(!['combined','customer','merchant'].includes(target)||path.dirname(output)!==path.join(ROOT,'dist'))throw Error('Unsafe output directory')
if(fs.existsSync(output)&&(!fs.existsSync(path.join(output,'.stall-build-output'))||fs.lstatSync(output).isSymbolicLink()))throw Error('Refusing to replace unowned/symlink output')
if(fs.existsSync(path.join(ROOT,'dist'))&&fs.lstatSync(path.join(ROOT,'dist')).isSymbolicLink())throw Error('Refusing symlink dist')
if(fs.existsSync(output))fs.rmSync(output,{recursive:true})
fs.mkdirSync(stage,{recursive:true});fs.mkdirSync(miniapp,{recursive:true});fs.writeFileSync(path.join(output,'.stall-build-output'),'generated Phase30 build output\n')
const bootstrap=path.join(ROOT,plan.bootstrap),location=file=>file===bootstrap?'app.ts':path.relative(SOURCE,file).split(path.sep).join('/')
for(const [file,deps] of files){
 let text=fs.readFileSync(file,'utf8')
 for(const d of [...deps].reverse()){
  let spec=path.posix.relative(path.posix.dirname(location(file)),location(d.target)).replace(/\.ts$/,'');if(!spec.startsWith('.'))spec='./'+spec
  text=text.slice(0,d.start)+d.text.replace(d.spec,spec)+text.slice(d.end)
 }
 const destination=path.join(stage,location(file));fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,text)
}
if(phone)fs.writeFileSync(path.join(stage,'config/cloud.ts'),cloudSource(phone))
const original=JSON.parse(fs.readFileSync(path.join(SOURCE,'app.json'),'utf8'))
const app={...original,pages:plan.pages}
if(target==='customer'){
 app.requiredPrivateInfos=(original.requiredPrivateInfos||[]).filter(name=>!['startLocationUpdate','onLocationChange','startLocationUpdateBackground'].includes(name))
 app.permission={...original.permission,'scope.userLocation':{desc:'用于顾客主动选择收货地址地图位置，不持续采集配送定位'}}
}
if(target==='merchant')app.permission={...original.permission,'scope.userLocation':{desc:'用于配送区域选点及经授权的本单前台位置共享'}}
if(target==='merchant'){delete app.tabBar;app.window={...original.window,navigationBarTitleText:'商家工作台'}}
fs.writeFileSync(path.join(miniapp,'app.json'),JSON.stringify(app,null,2)+'\n')
const copied=new Set(),resource=p=>{
 if(!fs.existsSync(p))throw Error('Missing resource '+relative(p))
 if(!p.startsWith(SOURCE+path.sep))throw Error('Resource escapes miniprogram root')
 const name=path.relative(SOURCE,p),to=path.join(miniapp,name)
 if(copied.has(p))return;copied.add(p);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(p,to)
 if(!/\.(wxml|wxss|json)$/.test(p))return
 const text=fs.readFileSync(p,'utf8')
 for(const m of text.matchAll(/(?:src\s*=\s*|@import\s+)["']([^"']+\.(?:wxml|wxss))["']/g))resource(path.resolve(path.dirname(p),m[1]))
 if(p.endsWith('.json'))for(const value of Object.values(JSON.parse(text).usingComponents||{})){
  if(typeof value!=='string'||value.startsWith('plugin:'))throw Error('Unconfigured external component')
  const base=value.startsWith('/')?path.join(SOURCE,value.slice(1)):path.resolve(path.dirname(p),value)
  if(!files.has(base+'.ts'))throw Error('Component controller missing from graph: '+relative(base)+'.ts')
  for(const ext of ['.json','.wxml','.wxss'])resource(base+ext)
 }
}
// Components are explicit source roots, just like pages. They must be in the graph.
for(const page of plan.pages)for(const ext of ['.json','.wxml','.wxss'])resource(path.join(SOURCE,page+ext))
for(const file of files.keys())if(fs.existsSync(file.replace(/\.ts$/,'.json'))&&file.includes(path.sep+'components'+path.sep))for(const ext of ['.json','.wxml','.wxss'])resource(file.replace(/\.ts$/,ext))
resource(path.join(SOURCE,'app.wxss'))
const texts=[...files.keys()].map(p=>fs.readFileSync(p,'utf8')).concat([...copied].filter(p=>/\.(wxml|wxss|json)$/.test(p)).map(p=>fs.readFileSync(p,'utf8')))
for(const icon of (app.tabBar?.list||[]).flatMap(i=>[i.iconPath,i.selectedIconPath]).filter(Boolean))resource(path.join(SOURCE,icon))
for(const text of texts)for(const m of text.matchAll(/["'(](\/?assets\/[^\s"')?{}]+\.(?:png|jpg|jpeg|webp|svg))["')]/g))resource(path.join(SOURCE,m[1].replace(/^\//,'')))
// Every literal miniapp navigation target must exist in this app's page registry.
for(const [file] of files){
 const text=fs.readFileSync(path.join(stage,location(file)),'utf8')
 for(const m of text.matchAll(/\/pages\/[a-z0-9-]+\/[a-z0-9-]+/g))if(!app.pages.includes(m[0].slice(1)))throw Error('Navigation outside target: '+m[0]+' in '+relative(file))
}
for(const p of copied){if(!p.endsWith('.wxml'))continue;const text=fs.readFileSync(p,'utf8');for(const m of text.matchAll(/\/pages\/[a-z0-9-]+\/[a-z0-9-]+/g))if(!app.pages.includes(m[0].slice(1)))throw Error('Template navigation outside target '+m[0])}
const baseConfig=JSON.parse(fs.readFileSync(path.join(ROOT,'tsconfig.json'),'utf8'))
const tsconfig={compilerOptions:{...baseConfig.compilerOptions,allowJs:false,rootDir:stage,outDir:miniapp,noEmitOnError:true,sourceMap:false,typeRoots:[path.join(ROOT,'typings')]},files:[...walk(path.join(ROOT,'typings')).filter(p=>p.endsWith('.d.ts')),...files.keys()].map(f=>f.startsWith(stage)?f:files.has(f)?path.join(stage,location(f)):f),include:[]}
fs.writeFileSync(path.join(output,'tsconfig.json'),JSON.stringify(tsconfig,null,2)+'\n')
const compiled=spawnSync(process.execPath,[path.join(ROOT,'node_modules/typescript/lib/tsc.js'),'--project',path.join(output,'tsconfig.json'),'--pretty','false'],{cwd:ROOT,stdio:'inherit'})
if(compiled.status!==0)throw Error('TypeScript compilation failed: '+target)
const baseProject=JSON.parse(fs.readFileSync(path.join(ROOT,'project.config.json'),'utf8'))
const supplied=target==='customer'?process.env.STALL_CUSTOMER_APPID:target==='merchant'?process.env.STALL_MERCHANT_APPID:undefined
if(supplied&&!/^wx[a-f0-9]{16}$/.test(supplied))throw Error('Invalid build AppID')
const project={...baseProject,appid:phone?.appId||supplied||(target==='merchant'?'touristappid':baseProject.appid),projectname:phone?'stall-staging-phone':'stall-'+target,miniprogramRoot:'miniprogram/',srcMiniprogramRoot:'miniprogram/',setting:{...baseProject.setting,useCompilerPlugins:[],...phone?{urlCheck:true}:{}},packOptions:{ignore:[],include:[]}}
fs.writeFileSync(path.join(output,'project.config.json'),JSON.stringify(project,null,2)+'\n')
const artifacts=walk(miniapp).map(p=>path.relative(miniapp,p).split(path.sep).join('/'))
for(const f of artifacts){
 if(/\.ts$|\.bak$/.test(f))throw Error('Unexpected source/history in output: '+f)
 if(f.startsWith('pages/')&&!plan.pages.some(page=>f.startsWith(page+'.')))throw Error('Unexpected page artifact '+f)
 if(target!=='combined'&&(f.startsWith('modules/'+(target==='customer'?'merchant':'customer')+'/')||f.startsWith('modules/integration/')))throw Error('Cross-role artifact '+f)
}
fs.writeFileSync(path.join(output,'build-manifest.json'),JSON.stringify({target,compile:'TypeScript to CommonJS JavaScript',wechatPlatformCompilation:'not performed',appid:project.appid,pages:app.pages,sources:[...files.keys()].map(relative),artifacts},null,2)+'\n')
checkOutput(target,phone?'phone-preview':target)
if(phone) {
  const emitted=fs.readFileSync(path.join(miniapp,'config/cloud.js'),'utf8')
  if(!emitted.includes(phone.apiBase)||!emitted.includes('CLOUD_ONLY = true'))throw Error('Missing cloud-only preview configuration')
  fs.writeFileSync(path.join(output,'phone-preview.json'),JSON.stringify({...phone,sourceMode:'cloud-only',deploymentVerified:false,wechatPhoneVerified:false},null,2)+'\n')
}
console.log(`${target}: compiled ${files.size} source modules, ${app.pages.length} pages, ${artifacts.length} artifacts -> ${relative(output)}`)
