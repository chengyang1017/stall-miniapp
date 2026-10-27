// Deterministic source allowlist. Does not copy/build/install anything on import.
import { readFile,readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { check } from './policy.mjs'
export const hash=b=>createHash('sha256').update(b).digest('hex')
export const normalized=b=>Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'))
export const RUNTIME_FILES=Object.freeze(['backend/package.json','backend/package-lock.json',
  ...['policy','grants','artifact','sql','fixture','initialize','runner','business'].map(n=>'backend/testing/phase8-v2/'+n+'.mjs'),
  // Exact business dependency closure, not the server (which starts workers).
  ...['checkout','inventory','auth','wechatApplications','deliveryRules','productPublishing','orderWorkflow','customerPagination','merchantOrderQuery','imageLifecycle'].map(n=>'backend/src/'+n+'.mjs'),
  ...['policy.mjs','leases.mjs','migrations.mjs','schema.mjs','migration-manifest.json'].map(n=>'backend/testing/phase8/'+n)])
export async function sourceManifest(root) {
  const {join}=await import('node:path'),manifest=JSON.parse(await readFile(join(root,'backend/testing/phase8/migration-manifest.json'),'utf8'))
  // Actual manifest schema is verified by the existing loader as well.
  const migrations=(await readdir(join(root,'backend/sql'))).filter(n=>/^\d{3}_.+\.sql$/.test(n)).sort()
  check(migrations.length===20&&migrations[0].startsWith('001_')&&migrations.at(-1).startsWith('020_'),'artifact_migrations_rejected')
  const files=[]
  for(const path of [...RUNTIME_FILES,...migrations.map(n=>'backend/sql/'+n)].sort())files.push({path,sha256:hash(normalized(await readFile(join(root,path))))})
  const pkg=JSON.parse(await readFile(join(root,'backend/package.json'),'utf8')),lock=JSON.parse(await readFile(join(root,'backend/package-lock.json'),'utf8'))
  check(JSON.stringify(Object.entries(pkg.dependencies).sort())===JSON.stringify(Object.entries(lock.packages[''].dependencies).sort())&&manifest,'artifact_lock_rejected')
  return {version:1,files}
}
export async function verifyArtifact(root,expectedHash) {
  const {join}=await import('node:path'),raw=await readFile(join(root,'bundle.json'))
  check(hash(raw)===expectedHash,'artifact_digest_rejected')
  const expected=JSON.parse(raw),actual=await sourceManifest(root)
  check(JSON.stringify(expected)===JSON.stringify(actual),'artifact_content_rejected')
  return actual
}
