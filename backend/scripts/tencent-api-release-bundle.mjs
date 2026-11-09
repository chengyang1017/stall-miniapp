// Build an allowlisted, verifiable backend runtime directory for Tencent CVM.
// No credentials, migrations, tests or frontend are included; no cloud actions.
import {readFile,readdir,mkdir,writeFile,rename,rm,lstat,open} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const sourceRoot=fileURLToPath(new URL('../',import.meta.url))
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
const allowedRoot=['package.json','package-lock.json']
export function inspectRuntimeImports(files){
 const filenames=new Set(files.map(x=>x.name))
 for(const entry of files){
  const source=entry.bytes.toString('utf8')
  // Static imports, exports, and literal dynamic imports are inspected. Any
  // unreviewed nonliteral dynamic import in a runtime file blocks release.
  const imports=[...source.matchAll(/\b(?:import|export)\s*(?:[^'";\n]*?\s+from\s*)?['"]([^'"]+)['"]/g),
   ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
  for(const match of imports){
   const spec=match[1]
   if(!spec.startsWith('.'))continue
   const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(entry.name),spec))
   if(!filenames.has(resolved))throw Error('runtime_relative_import_missing')
  }
  if(/\bimport\s*\(\s*(?!['"])/.test(source))throw Error('runtime_nonliteral_dynamic_import_requires_review')
 }
}
export async function readReleaseInputs(root=sourceRoot){
 const files=[]
 for(const name of allowedRoot){
  const stat=await lstat(path.join(root,name))
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('unsafe_release_source')
  files.push({name:'backend/'+name,bytes:await readFile(path.join(root,name))})
 }
 const list=(await readdir(path.join(root,'src'),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))
 for(const entry of list){
  if(!entry.isFile()||!entry.name.endsWith('.mjs'))continue
  const full=path.join(root,'src',entry.name),stat=await lstat(full)
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('unsafe_release_source')
  files.push({name:'backend/src/'+entry.name,bytes:await readFile(full)})
 }
 if(!files.some(x=>x.name==='backend/src/server.mjs'))throw Error('server_entry_missing')
 const pkg=JSON.parse(files.find(x=>x.name==='backend/package.json').bytes.toString('utf8'))
 const lock=JSON.parse(files.find(x=>x.name==='backend/package-lock.json').bytes.toString('utf8'))
 if(!pkg.private||!pkg.dependencies||lock.lockfileVersion<2||lock.packages?.['']?.name!==pkg.name||
    JSON.stringify(lock.packages[''].dependencies||{})!==JSON.stringify(pkg.dependencies))
  throw Error('runtime_lockfile_dependency_mismatch')
 inspectRuntimeImports(files)
 return files
}
export function buildReleaseManifest(files,commit){
 if(commit!==null&&!/^[a-f0-9]{40}$/.test(commit))throw Error('invalid_release_commit')
 const sorted=[...files].sort((a,b)=>a.name.localeCompare(b.name,'en'))
 return {format:'stall-api-tencent-release-v1',commit,
  releaseReadyForProduction:false,
  files:sorted.map(x=>({path:x.name,bytes:x.bytes.length,sha256:digest(x.bytes)})),
  note:'Runtime file integrity only. Does not certify database, storage, payments or production readiness.'}
}
export async function createRelease(output,{root=sourceRoot,commit=null}={}){
 const destination=path.resolve(output)
 if(destination===path.resolve(root)||destination.startsWith(path.resolve(root)+path.sep))
  throw Error('release_output_must_be_outside_backend_source')
 const inputs=await readReleaseInputs(root)
 const manifest=buildReleaseManifest(inputs,commit)
 const temp=destination+'.incomplete-'+randomUUID()
 try{
  await mkdir(temp,{recursive:false,mode:0o700})
  for(const file of inputs){
   const target=path.join(temp,...file.name.split('/'))
   await mkdir(path.dirname(target),{recursive:true,mode:0o700})
   await writeFile(target,file.bytes,{flag:'wx',mode:0o600})
  }
  await writeFile(path.join(temp,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600})
  // rename never overwrites existing directory on supported platforms if nonempty,
  // but refuse any prior destination explicitly before producing a release.
  try{await lstat(destination);throw Error('release_destination_exists')}
  catch(e){if(e.code!=='ENOENT')throw e}
  await rename(temp,destination)
  return manifest
 }catch(e){await rm(temp,{recursive:true,force:true});throw e}
}
export async function verifyRelease(directory){
 const root=path.resolve(directory),manifest=JSON.parse(await readFile(path.join(root,'release-manifest.json'),'utf8'))
 if(manifest.format!=='stall-api-tencent-release-v1'||!Array.isArray(manifest.files)||
   manifest.releaseReadyForProduction!==false)throw Error('invalid_release_manifest')
 const expected=new Set()
 for(const entry of manifest.files){
  if(typeof entry.path!=='string'||!/^backend\/(?:package(?:-lock)?\.json|src\/[a-zA-Z0-9_-]+\.mjs)$/.test(entry.path)||
    expected.has(entry.path)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||
    !/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('invalid_release_manifest_entry')
  expected.add(entry.path)
  const file=path.join(root,...entry.path.split('/'))
  const stat=await lstat(file)
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('unexpected_release_file_type')
  const bytes=await readFile(file)
  if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)
   throw Error('release_file_integrity_failed')
 }
 const list=async(folder,relative='')=>{
  const entries=await readdir(folder,{withFileTypes:true})
  for(const entry of entries){
   const rel=relative?relative+'/'+entry.name:entry.name
   if(entry.isDirectory())await list(path.join(folder,entry.name),rel)
   else if(!entry.isFile()||rel!=='release-manifest.json'&&!expected.has(rel))
    throw Error('unexpected_release_file')
  }
 }
 await list(root)
 return {verified:true,files:expected.size,commit:manifest.commit,
  productionApproved:false}
}
async function main(){
 const [mode,dir,...rest]=process.argv.slice(2)
 if(rest.length||!dir||!['--build','--verify'].includes(mode))throw Error('usage_build_or_verify_and_directory')
 if(mode==='--verify')console.log(JSON.stringify(await verifyRelease(dir),null,2))
 else{
  const m=await createRelease(dir,{commit:process.env.RELEASE_COMMIT_SHA||null})
  console.log(JSON.stringify({created:true,files:m.files.length,commit:m.commit,productionApproved:false},null,2))
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error('TENCENT_RELEASE_BUNDLE_FAILED');process.exitCode=1})
}
