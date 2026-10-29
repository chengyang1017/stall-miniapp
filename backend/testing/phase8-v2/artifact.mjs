// Deterministic source allowlist. Does not copy/build/install anything on import.
import { readFile,readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { check } from './policy.mjs'
import {loadMigrations,approved021Names} from '../phase8/migrations.mjs'
import {pathToFileURL} from 'node:url'
export const hash=b=>createHash('sha256').update(b).digest('hex')
export const normalized=b=>Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'))
export const RUNTIME_FILES=Object.freeze(['backend/package.json','backend/package-lock.json',
  ...['policy','grants','artifact','sql','fixture','initialize','runner','business'].map(n=>'backend/testing/phase8-v2/'+n+'.mjs'),
  // Exact business dependency closure, not the server (which starts workers).
  ...['checkout','inventory','auth','wechatApplications','deliveryRules','productPublishing','orderWorkflow','customerPagination','merchantOrderQuery','imageLifecycle'].map(n=>'backend/src/'+n+'.mjs'),
  ...['policy.mjs','leases.mjs','migrations.mjs','schema.mjs','migration-manifest.json'].map(n=>'backend/testing/phase8/'+n)])
export const STAGING_RUNTIME_FILES=Object.freeze([...RUNTIME_FILES,
  ...['stagingPayments','stagingDeployment','stagingPermissions'].map(n=>'backend/src/'+n+'.mjs'),
  'backend/config/staging-deployments.json','backend/testing/staging/migration-plan.json',
  'backend/testing/staging/migration.mjs','backend/testing/phase8-v2/schema021.mjs','backend/testing/phase8-v2/payments021.mjs'])
export async function sourceManifest(root,{schemaProfile='baseline020'}={}) {
  const {join}=await import('node:path'),manifest=JSON.parse(await readFile(join(root,'backend/testing/phase8/migration-manifest.json'),'utf8'))
  // Actual manifest schema is verified by the existing loader as well.
  check(['baseline020','staging021'].includes(schemaProfile),'artifact_profile_rejected')
  const sqlDir=pathToFileURL(join(root,'backend/sql')+'/'),manifestUrl=pathToFileURL(join(root,'backend/testing/phase8/migration-manifest.json')),
    planUrl=pathToFileURL(join(root,'backend/testing/staging/migration-plan.json'))
  const migrations=(await readdir(join(root,'backend/sql'))).filter(n=>n.endsWith('.sql')).sort()
  if(schemaProfile==='baseline020'){
    check(migrations.length===20&&migrations[0].startsWith('001_')&&migrations.at(-1).startsWith('020_'),'artifact_migrations_rejected')
    await loadMigrations({sqlDir,manifestUrl})
  }else{
    await loadMigrations({sqlDir,manifestUrl,planUrl,sourceProfile:'workspace021-baseline020'})
    await approved021Names(sqlDir,manifest,planUrl)
  }
  const files=[]
  for(const path of [...(schemaProfile==='baseline020'?RUNTIME_FILES:STAGING_RUNTIME_FILES),...migrations.map(n=>'backend/sql/'+n)].sort())files.push({path,sha256:hash(normalized(await readFile(join(root,path))))})
  const pkg=JSON.parse(await readFile(join(root,'backend/package.json'),'utf8')),lock=JSON.parse(await readFile(join(root,'backend/package-lock.json'),'utf8'))
  check(JSON.stringify(Object.entries(pkg.dependencies).sort())===JSON.stringify(Object.entries(lock.packages[''].dependencies).sort())&&manifest,'artifact_lock_rejected')
  return schemaProfile==='baseline020'?{version:1,files}:{version:2,schemaProfile,files}
}
// Offline review accepts an explicit versioned package. Execution below remains v1.
export async function verifySourceArtifact(root,expectedHash) {
  const {join}=await import('node:path'),raw=await readFile(join(root,'bundle.json'))
  check(hash(raw)===expectedHash,'artifact_digest_rejected')
  const expected=JSON.parse(raw)
  check(expected.version===1&&!Object.hasOwn(expected,'schemaProfile')||expected.version===2&&expected.schemaProfile==='staging021','artifact_profile_rejected')
  const actual=await sourceManifest(root,{schemaProfile:expected.version===1?'baseline020':expected.schemaProfile})
  check(JSON.stringify(expected)===JSON.stringify(actual),'artifact_content_rejected')
  return actual
}
export async function verifyArtifact(root,expectedHash,{schemaProfile='baseline020'}={}) {
  const {join}=await import('node:path'),raw=await readFile(join(root,'bundle.json'))
  check(hash(raw)===expectedHash,'artifact_digest_rejected')
  const expected=JSON.parse(raw)
  // v2 packaging is reviewable offline; existing v1 runtime cannot consume it.
  check(schemaProfile==='baseline020'&&expected.version===1||schemaProfile==='staging021'&&expected.version===2&&expected.schemaProfile==='staging021','artifact_runtime_version_rejected')
  return verifySourceArtifact(root,expectedHash)
}
