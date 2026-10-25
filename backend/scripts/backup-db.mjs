// Offline administrative backup. Run only in a trusted server environment.
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile, chmod } from 'node:fs/promises'
import path from 'node:path'
import { backupIdentity,sealMetadata } from './backup-metadata.mjs'

const db = process.env.DATABASE_URL
if (!db) throw new Error('DATABASE_URL is required')
const identity=backupIdentity()
const backupDir = path.resolve(process.env.BACKUP_DIR || './backups')
await mkdir(backupDir, { recursive: true, mode: 0o700 })
const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
const filename = `stall-${id}.dump`
const file = path.join(backupDir, filename)
const tmp = `${file}.part`
const run = (exe, args) => new Promise((resolve, reject) => {
  const proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
  proc.stdout.resume()
  proc.stderr.resume() // Never emit tool output containing connection strings or data.
  proc.on('error', reject)
  proc.on('close', code => code === 0 ? resolve() : reject(new Error(`${exe}_failed`)))
})
async function digest(p) {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(p)) h.update(chunk)
  return h.digest('hex')
}
try {
  // PGHOST/PGUSER/PGPASSWORD may be used instead of credentials in URL.
  await run('pg_dump', ['--dbname', db, '--format=custom', '--no-owner', '--no-privileges', '--file', tmp])
  await run('pg_restore', ['--list', tmp])
  if ((await stat(tmp)).size === 0) throw new Error('empty database dump')
  await rename(tmp, file)
  await chmod(file,0o600)
  const bytes=(await stat(file)).size,sha256=await digest(file)
  const metadata = sealMetadata({
    ...identity,status:'ready',
    format: 'stall-db-backup-v1', createdAt: new Date().toISOString(),
    file: filename, bytes, sha256,
    scope: 'postgresql_only', includesR2Objects: false,
    files:[{file:filename,role:'postgresql_custom_dump',bytes,sha256}],
    relatedObjectBackupSetId:identity.backupSetId,
    recoveryVerified:false,
    warning: 'Contains customer personal data; encrypt and restrict access. R2 images require separate backup. A shared BACKUP_SET_ID links runs but does not make them transactional.'
  })
  await writeFile(`${file}.manifest.json`, JSON.stringify(metadata, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  console.log(`Database backup validated: ${filename}`)
  console.log('R2 images are NOT included. Encrypt and upload to secure offsite backup storage.')
} catch (err) {
  if (existsSync(tmp)) await rm(tmp, { force: true })
  await writeFile(`${file}.failed.json`,JSON.stringify(sealMetadata({...identity,status:'failed',createdAt:new Date().toISOString(),failureCode:'database_backup_failed',files:[]})),{mode:0o600,flag:'wx'}).catch(()=>{})
  throw new Error('database_backup_failed; inspect protected failure metadata and operator environment')
}
