// Operator-only R2 image backup to protected local disk. Does not delete or edit R2.
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'

const required = ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET']
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`)
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
const client = new S3Client({
  region: 'auto', endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
})
const root = path.resolve(process.env.R2_BACKUP_DIR || './backups/r2')
await mkdir(root, { recursive: true, mode: 0o700 })
const run = `r2-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
const temp = path.join(root, `${run}.incomplete`)
const complete = path.join(root, run)
await mkdir(path.join(temp, 'objects'), { recursive: true, mode: 0o700 })
let token
let count = 0
let total = 0
const entries = []
try {
  do {
    const page = await client.send(new ListObjectsV2Command({Bucket:R2_BUCKET, ContinuationToken:token}))
    for (const obj of page.Contents || []) {
      if (!obj.Key) continue
      const name = `${String(count).padStart(8,'0')}-${createHash('sha256').update(obj.Key).digest('hex')}.blob`
      const dest = path.join(temp,'objects',name)
      const part = `${dest}.part`
      const response = await client.send(new GetObjectCommand({ Bucket:R2_BUCKET, Key:obj.Key, ...(obj.ETag ? {IfMatch:obj.ETag} : {}) }))
      if (!response.Body) throw new Error('R2 response missing object body')
      await pipeline(response.Body, createWriteStream(part, { flags: 'wx', mode: 0o600 }))
      const size = (await stat(part)).size
      if (typeof obj.Size === 'number' && size !== obj.Size) throw new Error(`Object length mismatch: ${count}`)
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(part)) hash.update(chunk)
      await rename(part,dest)
      entries.push({ key:obj.Key, file:name, bytes:size, sha256:hash.digest('hex'), etag:obj.ETag || '' })
      count++; total += size
    }
    token=page.IsTruncated ? page.NextContinuationToken : undefined
    if (page.IsTruncated && !token) throw new Error('Missing list continuation token')
  } while (token)
  const manifest = { format:'stall-r2-backup-v1', createdAt:new Date().toISOString(), bucket:R2_BUCKET,
    objectCount:count, bytes:total, objects:entries,
    note:'R2 object snapshot is not transactional with PostgreSQL. Back up both and verify relational references after recovery.' }
  await writeFile(path.join(temp,'manifest.json'), JSON.stringify(manifest,null,2)+'\n', {flag:'wx', mode:0o600})
  await rename(temp, complete)
  console.log(`R2 snapshot: ${complete} (${count} objects, ${total} bytes)`)
  console.log('Files are local only. Encrypt and copy to separately protected offsite storage.')
} catch (err) {
  // Preserve the incomplete directory for troubleshooting, never label it as valid.
  console.error(`Incomplete R2 backup retained: ${temp}`)
  throw err
}
