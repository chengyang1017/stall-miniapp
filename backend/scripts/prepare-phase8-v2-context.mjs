// Local artifact preparation only, never invoked by safety tests or on import.
import { mkdir,readFile,writeFile,lstat } from 'node:fs/promises'
import { resolve,join,isAbsolute } from 'node:path'
import { fileURLToPath,pathToFileURL } from 'node:url'
import { sourceManifest,normalized,hash } from '../testing/phase8-v2/artifact.mjs'
import { check } from '../testing/phase8-v2/policy.mjs'
export async function prepare(env) {
  check(env.PHASE8_V2_BUILD_CONTEXT_AUTHORIZE==='PREPARE_NEW_CONTEXT_ONLY','context_not_authorized')
  const root=fileURLToPath(new URL('../../',import.meta.url)),target=env.PHASE8_V2_BUILD_CONTEXT
  check(typeof target==='string'&&isAbsolute(target)&&!resolve(target).toLowerCase().startsWith(resolve(root).toLowerCase())&&!target.toLowerCase().includes('stallphase8-test-'),'context_path_rejected')
  const schemaProfile=env.PHASE8_V2_BUILD_SCHEMA||'baseline020'
  check(['baseline020','staging021'].includes(schemaProfile),'context_schema_rejected')
  const manifest=await sourceManifest(root,{schemaProfile})
  await mkdir(target) // exclusive: existing directory is never reused or cleared
  for(const f of manifest.files){const src=join(root,f.path);const s=await lstat(src);check(s.isFile()&&!s.isSymbolicLink(),'context_source_rejected');const dest=join(target,'payload',f.path);await mkdir(resolve(dest,'..'),{recursive:true});await writeFile(dest,normalized(await readFile(src)),{flag:'wx'})}
  const raw=Buffer.from(JSON.stringify(manifest));await writeFile(join(target,'payload','bundle.json'),raw,{flag:'wx'})
  await writeFile(join(target,'Dockerfile'),await readFile(new URL('../testing/phase8-v2/Dockerfile.runner',import.meta.url)),{flag:'wx'})
  await writeFile(join(target,'.dockerignore'),'**\n!Dockerfile\n!payload/\n!payload/**\n!npm-cache/\n!npm-cache/**\n',{flag:'wx'})
  return {bundleSha256:hash(raw),files:manifest.files.length,dependenciesPrepared:false,imageBuilt:false}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.length===2)console.log('Offline only. No artifact directory created.');else if(process.argv.length===3&&process.argv[2]==='--prepare')try{console.log(JSON.stringify(await prepare(process.env)))}catch{console.error('phase8_v2_context_failed');process.exitCode=1}else{console.error('phase8_v2_arguments_rejected');process.exitCode=1}}
