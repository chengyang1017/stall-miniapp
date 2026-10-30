// Offline real source/hash/serialization checks. Never Docker or PostgreSQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {pathToFileURL,fileURLToPath} from 'node:url'
import {loadMigrations} from '../testing/phase8/migrations.mjs'
import {sourceManifest,verifyArtifact,verifySourceArtifact,hash} from '../testing/phase8-v2/artifact.mjs'
import {resourceFingerprintV2,canonicalResource} from '../testing/phase8-v2/recovery.mjs'
const root=fileURLToPath(new URL('../../',import.meta.url))
const versioned=()=>sourceManifest(root,{schemaProfile:'staging021'})
const rejected=code=>e=>e.phase8Code===code
async function workspace(){
 const temp=await mkdtemp(join(tmpdir(),'stall-v2-boundary-'))
 for(const {path}of (await versioned()).files){const dest=join(temp,path);await mkdir(dirname(dest),{recursive:true});await copyFile(join(root,path),dest)}
 return temp // retained temp fixtures contain source only, no credentials
}
const options=temp=>({sqlDir:pathToFileURL(join(temp,'backend/sql')+'/'),manifestUrl:pathToFileURL(join(temp,'backend/testing/phase8/migration-manifest.json')),planUrl:pathToFileURL(join(temp,'backend/testing/staging/migration-plan.json')),sourceProfile:'workspace021-baseline020'})
test('strict execution default still rejects workspace 021',async()=>{
 await assert.rejects(()=>loadMigrations(),rejected('phase8_migration_list_rejected'))
 await assert.rejects(()=>sourceManifest(root),rejected('phase8_v2_artifact_migrations_rejected'))
})
test('explicit workspace projection preserves exact historical 20 and manifest hash',async()=>{
 const result=await loadMigrations({sourceProfile:'workspace021-baseline020'})
 const original=JSON.parse(await readFile(join(root,'backend/testing/phase8/migration-manifest.json')))
 assert.equal(result.files.length,20);assert.equal(result.manifestHash,hash(JSON.stringify(original)))
 assert.deepEqual(result.files.map(({filename,sha256,transaction})=>({filename,sha256,transaction})),original.files)
})
test('legacy 020 artifact assertions remain exact on an exact 020 source tree',async()=>{
 const temp=await workspace()
 // Build a different temporary baseline source tree, never remove a repo SQL.
 const baseline=await mkdtemp(join(tmpdir(),'stall-v2-baseline-'))
 const {RUNTIME_FILES}=await import('../testing/phase8-v2/artifact.mjs')
 const paths=[...RUNTIME_FILES,...(await loadMigrations({sourceProfile:'workspace021-baseline020'})).files.map(f=>'backend/sql/'+f.filename)]
 for(const path of paths){const dest=join(baseline,path);await mkdir(dirname(dest),{recursive:true});await copyFile(join(temp,path),dest)}
 const manifest=await sourceManifest(baseline)
 assert.equal(manifest.version,1);assert.equal(manifest.files.length,45)
 assert.equal(manifest.files.filter(f=>f.path.startsWith('backend/sql/')).length,20)
 assert.ok(manifest.files.every(f=>!/(server\.mjs|\.env|host\.mjs|docker\.mjs|controller\.mjs|live-db)/.test(f.path)))
 const bytes=JSON.stringify(manifest);await writeFile(join(baseline,'bundle.json'),bytes)
 assert.deepEqual(await verifyArtifact(baseline,hash(bytes)),manifest)
})
for(const file of ['001_init.sql','021_staging_payment.sql'])test('projection refuses tampering '+file,async()=>{
 const temp=await workspace();await writeFile(join(temp,'backend/sql',file),'BEGIN; CREATE TABLE tampered(id int); COMMIT;')
 await assert.rejects(()=>loadMigrations(options(temp)),rejected('phase8_migration_hash_changed'))
})
test('projection refuses an extra migration',async()=>{
 const temp=await workspace();await writeFile(join(temp,'backend/sql/022_unapproved.sql'),'BEGIN; COMMIT;')
 await assert.rejects(()=>loadMigrations(options(temp)),rejected('phase8_extension_manifest_rejected'))
})
test('projection refuses a mismatched extension manifest even with valid SQL',async()=>{
 const temp=await workspace(),p=join(temp,'backend/testing/staging/migration-plan.json'),plan=JSON.parse(await readFile(p))
 plan.files[0].sha256='0'.repeat(64);await writeFile(p,JSON.stringify(plan))
 await assert.rejects(()=>loadMigrations(options(temp)),rejected('phase8_extension_manifest_rejected'))
})
test('021 artifact closes every relative runtime import and deployment config dependency',async()=>{
 const manifest=await versioned(),names=new Set(manifest.files.map(f=>f.path))
 for(const {path}of manifest.files.filter(f=>f.path.endsWith('.mjs'))){
  const text=await readFile(join(root,path),'utf8')
  for(const match of text.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"]+)\1/g)){
   const relative=fileURLToPath(new URL(match[2],pathToFileURL(join(root,path)))).slice(root.length).replaceAll('\\','/').replace(/^\//,'')
   assert(names.has(relative),path+' missing '+relative)
  }
 }
 assert(names.has('backend/config/staging-deployments.json'))
})
test('v1 runtime explicitly rejects v2 artifact, never initializes 021 implicitly',async()=>{
 const temp=await workspace(),bytes=JSON.stringify(await versioned());await writeFile(join(temp,'bundle.json'),bytes)
 await assert.rejects(()=>verifyArtifact(temp,hash(bytes)),rejected('phase8_v2_artifact_runtime_version_rejected'))
})
test('offline v2 verification detects changed business source and bundle digest',async()=>{
 const temp=await workspace(),manifest=await versioned(),bytes=JSON.stringify(manifest)
 await writeFile(join(temp,'bundle.json'),bytes)
 assert.deepEqual(await verifySourceArtifact(temp,hash(bytes)),manifest)
 await assert.rejects(()=>verifySourceArtifact(temp,'0'.repeat(64)),rejected('phase8_v2_artifact_digest_rejected'))
 await writeFile(join(temp,'backend/src/stagingPayments.mjs'),'// altered\n')
 await assert.rejects(()=>verifySourceArtifact(temp,hash(bytes)),rejected('phase8_v2_artifact_content_rejected'))
})
test('unknown source and artifact profiles are refused',async()=>{
 await assert.rejects(()=>loadMigrations({sourceProfile:'latest'}),rejected('phase8_source_profile_rejected'))
 await assert.rejects(()=>sourceManifest(root,{schemaProfile:'latest'}),rejected('phase8_v2_artifact_profile_rejected'))
})
const db={Id:'id',Created:'time',Image:'image',Config:{Env:['A=1','B=2'],Cmd:['postgres','-c','x']},HostConfig:{ReadonlyRootfs:true},Mounts:[{Destination:'/b',Source:'two',RW:false},{Destination:'/a',Source:'one',RW:false}]}
const volume={Name:'v',Driver:'local',Scope:'local',CreatedAt:'time',Options:{},Labels:{b:'2',a:'1'}}
const fingerprint=d=>resourceFingerprintV2(d,volume).sha256
test('new fingerprint treats object key and mount ordering as representation only',()=>{
 const other={...db,Config:{Cmd:db.Config.Cmd,Env:db.Config.Env},Mounts:[...db.Mounts].reverse()}
 assert.equal(fingerprint(db),fingerprint(other));assert.equal(fingerprint(db),fingerprint(db))
})
for(const field of ['Env','Cmd'])test('new fingerprint preserves semantic array order '+field,()=>{
 const other=structuredClone(db);other.Config[field].reverse();assert.notEqual(fingerprint(db),fingerprint(other))
})
for(const field of ['Source','RW'])test('new fingerprint detects changed mount '+field,()=>{
 const other=structuredClone(db);other.Mounts[0][field]=field==='RW'?true:'different';assert.notEqual(fingerprint(db),fingerprint(other))
})
test('new fingerprint rejects duplicate destinations and lossy JSON values',()=>{
 assert.throws(()=>fingerprint({...db,Mounts:[db.Mounts[0],db.Mounts[0]]}),rejected('phase8_v2_fingerprint_mounts_rejected'))
 for(const value of [undefined,NaN,Infinity,new Date(),{missing:undefined},Array(2)])assert.throws(()=>canonicalResource(value),rejected('phase8_v2_fingerprint_value_rejected'))
 assert.notDeepEqual(canonicalResource({a:null}),canonicalResource({}))
})
test('legacy recovery still compares original raw digest and cannot borrow new fingerprint',async()=>{
 const text=await readFile(new URL('../testing/phase8-v2/recovery.mjs',import.meta.url),'utf8')
 const legacy=text.slice(text.indexOf('export function recoveryReceipt'))
 assert.match(legacy,/hash\(JSON.stringify\(containerSpec\(db\)\)\)===a.containerSpecSha256/)
 assert.doesNotMatch(legacy,/resourceFingerprintV2/)
})
