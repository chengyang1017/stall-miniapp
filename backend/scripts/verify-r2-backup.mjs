import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { verifyMetadata } from './backup-metadata.mjs'

const root = process.argv[2]
if (!root) throw new Error('Usage: node scripts/verify-r2-backup.mjs /path/to/r2-snapshot')
const manifest = JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'))
const identity=verifyMetadata(manifest)
if(identity.legacy)console.log('Legacy manifest: no linked database/object backup set or manifest digest.')
if (manifest.format !== 'stall-r2-backup-v1' || !Array.isArray(manifest.objects)) throw new Error('Invalid R2 manifest')
if (manifest.objectCount !== manifest.objects.length) throw new Error('Manifest object count mismatch')
let bytes = 0
let protectedReferences=0
const keys = new Set()
const names = new Set()
for (const item of manifest.objects) {
  if (typeof item.key !== 'string' || typeof item.file !== 'string' || !/^\d{8}-[a-f0-9]{64}\.blob$/.test(item.file) || names.has(item.file) || keys.has(item.key)) throw new Error('Invalid or duplicate manifest entry')
  names.add(item.file); keys.add(item.key)
  if(manifest.imageReferenceSchemaVersion!==undefined){
    if(manifest.imageReferenceSchemaVersion!==15)throw Error('Unsupported image-reference schema')
    const m=/^(?:stores\/([0-9a-f-]{36})\/products\/|delivery-proofs\/([0-9a-f-]{36})\/)/.exec(item.key),ref=item.imageReference
    if(m&&(!ref||ref.storeId!==(m[1]||m[2])||ref.kind!==(m[1]?'product':'proof')||typeof ref.registered!=='boolean'))throw Error('Image reference metadata mismatch')
    if(ref?.registered)protectedReferences++
  }
  const file = path.join(root,'objects',item.file)
  const size=(await stat(file)).size
  if (size !== item.bytes) throw new Error(`Size mismatch: ${item.file}`)
  const hash=createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  if (hash.digest('hex') !== item.sha256) throw new Error(`SHA256 mismatch: ${item.file}`)
  bytes+=size
}
if (bytes !== manifest.bytes) throw new Error('Manifest byte total mismatch')
if(manifest.imageReferenceSchemaVersion!==undefined&&protectedReferences!==manifest.protectedReferences)throw Error('Backup retention reference count mismatch')
if(!identity.legacy&&(manifest.files.length!==manifest.objects.length||manifest.files.some((f,i)=>f.file!=='objects/'+manifest.objects[i].file||f.bytes!==manifest.objects[i].bytes||f.sha256!==manifest.objects[i].sha256)))throw Error('Artifact list mismatch')
console.log(`Verified ${manifest.objectCount} local object copies (${bytes} bytes).`)
console.log('This does not prove source bucket completeness or that a restore would succeed; perform an isolated restore drill.')
