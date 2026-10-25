import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export const SOURCE=path.join(ROOT,'miniprogram')
export const config=JSON.parse(fs.readFileSync(path.join(ROOT,'apps/build-targets.json'),'utf8'))
export const relative=p=>path.relative(ROOT,p).split(path.sep).join('/')
export function walk(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(folder,e.name)):[path.join(folder,e.name)])}
export function ownership(file){
 const name=relative(file)
 if(name.startsWith('miniprogram/modules/shared/'))return 'shared'
 if(name.startsWith('miniprogram/modules/features/'))return 'feature'
 for(const role of ['customer','merchant'])if(name.startsWith(`miniprogram/modules/${role}/`)||name===`apps/${role}/app.ts`)return role
 if(name.startsWith('miniprogram/modules/integration/')||name==='miniprogram/app.ts')return 'combined'
 if(name.startsWith('miniprogram/config/'))return 'shared'
 if(name.startsWith('miniprogram/utils/')){const owner=config.utils[path.basename(name,'.ts')];if(!owner)throw Error('Unclassified utility: '+name);return owner}
 if(name.startsWith('miniprogram/pages/')){const page=name.split('/').slice(1,4).join('/').replace(/\.[^.]+$/,'');const owner=config.pages[page];if(!owner)throw Error('Unclassified page: '+name);return owner}
 throw Error('Unclassified source: '+name)
}
// Static imports/re-exports, including type edges. Dynamic loading is rejected,
// rather than skipped to make the graph appear isolated.
export function dependencies(file){
 const text=fs.readFileSync(file,'utf8'),result=[]
 if(/\bimport\s*\(|\brequire\s*\(/.test(text))throw Error('Dynamic import/require needs an explicit build contract: '+relative(file))
 const pattern=/\b(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|\*[^;\n]*?|[\w$]+)\s+from\s*(['"])([^'"]+)\1|\bimport\s*(['"])([^'"]+)\3/g
 for(const m of text.matchAll(pattern)){
  const spec=m[2]||m[4]
  if(!spec.startsWith('.'))throw Error('External miniapp import not configured: '+spec+' in '+relative(file))
  const base=path.resolve(path.dirname(file),spec)
  const target=[base+'.ts',path.join(base,'index.ts')].find(p=>fs.existsSync(p))
  if(!target||!relative(target).startsWith('miniprogram/'))throw Error('Missing/outside-root source: '+spec+' in '+relative(file))
  result.push({start:m.index,end:m.index+m[0].length,text:m[0],spec,target})
 }
 return result
}
function allowed(from,to){
 if(from==='combined')return true
 if(from==='shared')return to==='shared'
 if(from==='feature')return to==='feature'||to==='shared'
 return to===from||to==='shared'||to==='feature'
}
// Combined alone may host the declared navigation adapter. Independent builds
// resolve it to their role-owned implementation before checking any edge.
function hostAdapter(target,file){return target==='combined'&&relative(file)==='miniprogram/modules/integration/singleAppHost.ts'}
export function graph(target){
 const plan=config.targets[target];if(!plan)throw Error('Unknown build target: '+target)
 const aliases=new Map(Object.entries(plan.aliases).map(([a,b])=>[path.join(ROOT,a),path.join(ROOT,b)]))
 const resolve=file=>aliases.get(file)||file,files=new Map()
 const visit=file=>{
  file=resolve(file);if(files.has(file))return
  const owner=ownership(file)
  if(target!=='combined'&&![target,'shared','feature'].includes(owner))throw Error(target+' includes forbidden source '+relative(file))
  files.set(file,[])
  const deps=dependencies(file).map(d=>({...d,target:resolve(d.target)}))
  for(const d of deps){if(!allowed(owner,ownership(d.target))&&!hostAdapter(target,d.target))throw Error(`Dependency violation: ${relative(file)} -> ${relative(d.target)}`);visit(d.target)}
  files.set(file,deps)
  const sidecar=file.replace(/\.ts$/,'.json')
  if(fs.existsSync(sidecar))for(const value of Object.values(JSON.parse(fs.readFileSync(sidecar,'utf8')).usingComponents||{})){
   if(typeof value!=='string'||value.startsWith('plugin:'))throw Error('External component needs explicit configuration')
   const base=value.startsWith('/')?path.join(SOURCE,value.slice(1)):path.resolve(path.dirname(file),value)
   const component=base+'.ts'
   if(!allowed(owner,ownership(component)))throw Error('Component crosses role boundary: '+relative(component))
   visit(component)
  }
 }
 for(const page of plan.pages){if(!config.pages[page])throw Error('Unclassified page: '+page);visit(path.join(SOURCE,page+'.ts'))}
 visit(path.join(ROOT,plan.bootstrap))
 // Dependency cycles are errors, including cycles hidden behind compatibility exports.
 const active=new Set(),done=new Set(),chain=[]
 const cycle=file=>{if(active.has(file))throw Error('Dependency cycle: '+chain.concat(file).map(relative).join(' -> '));if(done.has(file))return;active.add(file);chain.push(file);for(const d of files.get(file))cycle(d.target);chain.pop();active.delete(file);done.add(file)}
 for(const f of files.keys())cycle(f)
 return {plan,files,aliases}
}
export function checkInventory(){
 const app=JSON.parse(fs.readFileSync(path.join(SOURCE,'app.json'),'utf8'))
 if(JSON.stringify(app.pages)!==JSON.stringify(config.targets.combined.pages))throw Error('Combined page manifest must match the default app.json')
 for(const page of app.pages)if(!config.pages[page])throw Error('New page needs ownership: '+page)
 for(const file of walk(path.join(SOURCE,'pages')).filter(p=>p.endsWith('.ts')))ownership(file)
 for(const file of walk(path.join(SOURCE,'utils')).filter(p=>p.endsWith('.ts')))ownership(file)
 for(const file of walk(path.join(SOURCE,'modules')).filter(p=>p.endsWith('.ts'))){const owner=ownership(file);for(const dep of dependencies(file))if(!allowed(owner,ownership(dep.target)))throw Error(`Source boundary violation: ${relative(file)} -> ${relative(dep.target)}`)}
}
