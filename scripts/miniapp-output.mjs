import fs from 'node:fs'
import path from 'node:path'
import { ROOT,config,walk } from './miniapp-graph.mjs'

// Inspection only: no miniapp APIs or business functions are executed.
export function checkOutput(target){
 const plan=config.targets[target];if(!plan)throw Error('Unknown output target')
 const output=path.join(ROOT,'dist',target),root=path.join(output,'miniprogram')
 const manifest=JSON.parse(fs.readFileSync(path.join(output,'build-manifest.json'),'utf8'))
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'))
 if(manifest.target!==target||JSON.stringify(app.pages)!==JSON.stringify(plan.pages))throw Error('Output page manifest mismatch')
 for(const tab of app.tabBar?.list||[])if(!app.pages.includes(tab.pagePath))throw Error('Tab outside target')
 if(target==='merchant'&&app.tabBar)throw Error('Merchant must not contain customer TabBar')
 if(app.requiredBackgroundModes?.includes('location')||app.requiredPrivateInfos?.includes('startLocationUpdateBackground'))throw Error('Background tracking must not be enabled by default')
 if(target==='customer'&&(app.requiredPrivateInfos||[]).some(v=>['startLocationUpdate','onLocationChange'].includes(v)))throw Error('Customer must not request courier location permissions')
 const artifacts=walk(root).map(p=>path.relative(root,p).split(path.sep).join('/'))
 if(JSON.stringify([...artifacts].sort())!==JSON.stringify([...manifest.artifacts].sort()))throw Error('Output contains missing or undeclared artifacts')
 for(const name of artifacts){
  if(name.startsWith('pages/')&&!plan.pages.some(page=>name.startsWith(page+'.')))throw Error('Unexpected page '+name)
  if(target!=='combined'&&(name.startsWith('modules/'+(target==='customer'?'merchant':'customer')+'/')||name.startsWith('modules/integration/')))throw Error('Cross-role artifact '+name)
  if(target!=='combined'&&name.startsWith('utils/')&&name.endsWith('.js')){
   const owner=config.utils[path.basename(name,'.js')]
   if(![target,'shared'].includes(owner))throw Error('Cross-role utility artifact '+name)
  }
  if(!name.endsWith('.js'))continue
  const file=path.join(root,name),text=fs.readFileSync(file,'utf8')
  if(target==='customer'&&/wx\.(?:startLocationUpdate|onLocationChange|stopLocationUpdate|offLocationChange)\s*\(/.test(text))throw Error('Customer includes courier GPS collection: '+name)
  for(const match of text.matchAll(/\brequire\(["']([^"']+)["']\)/g)){
   if(!match[1].startsWith('.'))throw Error('External JS dependency '+match[1])
   const dependency=path.resolve(path.dirname(file),match[1])+'.js'
   if(!dependency.startsWith(root+path.sep)||!fs.existsSync(dependency))throw Error('Unresolved emitted dependency '+name+' -> '+match[1])
  }
 }
 for(const page of app.pages)for(const ext of ['.js','.json','.wxml','.wxss'])if(!fs.existsSync(path.join(root,page+ext)))throw Error('Missing page artifact '+page+ext)
 console.log(target+': emitted modules, page ownership and resource inventory checked')
}
