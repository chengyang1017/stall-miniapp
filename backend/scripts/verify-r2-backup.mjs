import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const root = process.argv[2]
if (!root) throw new Error('Usage: node scripts/verify-r2-backup.mjs /path/to/r2-snapshot')
const manifest = JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'))
if (manifest.format !== 'stall-r2-backup-v1' || !Array.isArray(manifest.objects)) throw new Error('Invalid R2 manifest')
if (manifest.objectCount !== manifest.objects.length) throw new Error('Manifest object count mismatch')
let bytes = 0
const keys = new Set()
const names = new Set()
for (const item of manifest.objects) {
  if (typeof item.key !== 'string' || typeof item.file !== 'string' || !/^\d{8}-[a-f0-9]{64}\.blob$/.test(item.file) || names.has(item.file) || keys.has(item.key)) throw new Error('Invalid or duplicate manifest entry')
  names.add(item.file); keys.add(item.key)
  const file = path.join(root,'objects',item.file)
  const size=(await stat(file)).size
  if (size !== item.bytes) throw new Error(`Size mismatch: ${item.file}`)
  const hash=createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  if (hash.digest('hex') !== item.sha256) throw new Error(`SHA256 mismatch: ${item.file}`)
  bytes+=size
}
if (bytes !== manifest.bytes) throw new Error('Manifest byte total mismatch')
console.log(`Verified ${manifest.objectCount} local object copies (${bytes} bytes).`)
console.log('This does not prove source bucket completeness or that a restore would succeed; perform an isolated restore drill.')
