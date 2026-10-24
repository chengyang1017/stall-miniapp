// Offline administrative backup. Run only in a trusted server environment.
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const db = process.env.DATABASE_URL
if (!db) throw new Error('DATABASE_URL is required')
const backupDir = path.resolve(process.env.BACKUP_DIR || './backups')
await mkdir(backupDir, { recursive: true, mode: 0o700 })
const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
const filename = `stall-${id}.dump`
const file = path.join(backupDir, filename)
const tmp = `${file}.part`
const run = (exe, args) => new Promise((resolve, reject) => {
  const proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
  let stderr = ''
  proc.stdout.resume()
  proc.stderr.on('data', chunk => { stderr += chunk.toString().slice(0, 4096) })
  proc.on('error', reject)
  proc.on('close', code => code === 0 ? resolve() : reject(new Error(`${exe} exited ${code}: ${stderr.replace(/postgres(?:ql)?:\/\/\S+/gi,'[connection redacted]')}`)))
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
  const metadata = {
    format: 'stall-db-backup-v1', createdAt: new Date().toISOString(),
    file: filename, bytes: (await stat(file)).size, sha256: await digest(file),
    scope: 'postgresql_only', includesR2Objects: false,
    warning: 'Contains customer personal data; encrypt and restrict access. R2 images require separate backup.'
  }
  await writeFile(`${file}.manifest.json`, JSON.stringify(metadata, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  console.log(`Database backup validated: ${filename}`)
  console.log('R2 images are NOT included. Encrypt and upload to secure offsite backup storage.')
} catch (err) {
  if (existsSync(tmp)) await rm(tmp, { force: true })
  throw err
}
