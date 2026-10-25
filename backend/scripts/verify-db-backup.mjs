import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { verifyMetadata } from './backup-metadata.mjs'

const file = process.argv[2]
if (!file || !file.endsWith('.dump')) throw new Error('Usage: node scripts/verify-db-backup.mjs /path/to/backup.dump')
const manifestFile = `${file}.manifest.json`
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
const identity=verifyMetadata(manifest)
if(identity.legacy)console.log('Legacy manifest: no linked database/object backup set or manifest digest.')
if (manifest.format !== 'stall-db-backup-v1' || manifest.file !== path.basename(file)) throw new Error('Invalid manifest')
const size = (await stat(file)).size
if (size !== manifest.bytes || size <= 0) throw new Error('Size mismatch')
const hasher = createHash('sha256')
for await (const chunk of createReadStream(file)) hasher.update(chunk)
if (hasher.digest('hex') !== manifest.sha256) throw new Error('SHA256 mismatch')
if(!identity.legacy&&(manifest.files.length!==1||manifest.files[0].file!==manifest.file||manifest.files[0].sha256!==manifest.sha256||manifest.files[0].bytes!==manifest.bytes))throw Error('Artifact list mismatch')
await new Promise((resolve, reject) => {
  const p = spawn('pg_restore', ['--list', file], { stdio: ['ignore','ignore','pipe'] })
  let error = ''
  p.stderr.on('data', b => { error += b.toString().slice(0, 2048) })
  p.on('error', reject)
  p.on('close', code => code === 0 ? resolve() : reject(new Error(`pg_restore list failed: ${error}`)))
})
console.log('Backup digest and PostgreSQL archive structure checked.')
console.log('A separate restore into an isolated test database is still required.')
