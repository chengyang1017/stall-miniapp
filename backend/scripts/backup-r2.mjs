// Operator-only R2 image backup to protected local disk. Does not delete or edit R2.
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { backupIdentity,sealMetadata } from './backup-metadata.mjs'
import { Pool } from 'pg'

const required = ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','DATABASE_URL']
const identity=backupIdentity()
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
const retentionPool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,query_timeout:8000,ssl:process.env.PG_SSL==='true'?{rejectUnauthorized:true}:undefined})
let protectedReferences=0
async function protectObject(key){
 const m=/^(?:stores\/([0-9a-f-]{36})\/products\/|delivery-proofs\/([0-9a-f-]{36})\/)/.exec(key)
 if(!m)return null
 const store=m[1]||m[2],kind=m[1]?'product':'proof',db=await retentionPool.connect()
 try{await db.query('BEGIN');const exists=(await db.query('SELECT id FROM stores WHERE id=$1',[store])).rows.length;if(!exists){await db.query('ROLLBACK');return {storeId:store,kind,registered:false}}
  await db.query(`INSERT INTO stored_images(store_id,object_key,kind,source,upload_state,storage_bucket,retention_hold) VALUES($1,$2,$3,'discovered','unknown',$4,true) ON CONFLICT(object_key) DO NOTHING`,[store,key,kind,R2_BUCKET])
  const image=(await db.query('SELECT storage_bucket FROM stored_images WHERE store_id=$1 AND object_key=$2 FOR UPDATE',[store,key])).rows[0]
  if(!image||image.storage_bucket&&image.storage_bucket!==R2_BUCKET)throw Error('backup_registry_bucket_mismatch')
  await db.query('SELECT pin_image_reference($1,$2,\'backup\',$3)',[store,key,identity.backupSetId]);await db.query('COMMIT');protectedReferences++
  return {storeId:store,kind,registered:true}
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
}
try {
  do {
    const page = await client.send(new ListObjectsV2Command({Bucket:R2_BUCKET, ContinuationToken:token}))
    for (const obj of page.Contents || []) {
      if (!obj.Key) continue
      // Pin before reading: cleanup cannot race a database-recorded backup reference.
      const imageReference=await protectObject(obj.Key)
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
      entries.push({ key:obj.Key, file:name, bytes:size, sha256:hash.digest('hex'), etag:obj.ETag || '',versionId:response.VersionId||null,lastModified:response.LastModified?.toISOString()||null,contentType:response.ContentType||null,imageReference })
      count++; total += size
    }
    token=page.IsTruncated ? page.NextContinuationToken : undefined
    if (page.IsTruncated && !token) throw new Error('Missing list continuation token')
  } while (token)
  const manifest = sealMetadata({ ...identity,status:'ready',format:'stall-r2-backup-v1', createdAt:new Date().toISOString(), bucket:R2_BUCKET,
    objectCount:count, bytes:total, objects:entries,imageReferenceSchemaVersion:15,protectedReferences,
    files:entries.map(x=>({file:'objects/'+x.file,bytes:x.bytes,sha256:x.sha256})),relatedDatabaseBackupSetId:identity.backupSetId,recoveryVerified:false,
    note:'R2 object snapshot is not transactional with PostgreSQL or across the bucket listing. A shared BACKUP_SET_ID links runs only. Back up both and verify relational references after recovery.' })
  await writeFile(path.join(temp,'manifest.json'), JSON.stringify(manifest,null,2)+'\n', {flag:'wx', mode:0o600})
  await rename(temp, complete)
  console.log(`R2 snapshot: ${complete} (${count} objects, ${total} bytes)`)
  console.log('Files are local only. Encrypt and copy to separately protected offsite storage.')
} catch (err) {
  // Preserve the incomplete directory for troubleshooting, never label it as valid.
  await writeFile(path.join(temp,'failure.json'),JSON.stringify(sealMetadata({...identity,status:'failed',createdAt:new Date().toISOString(),failureCode:'object_backup_failed',objectCount:count,bytes:total,files:entries.map(x=>({file:'objects/'+x.file,bytes:x.bytes,sha256:x.sha256}))})),{flag:'wx',mode:0o600}).catch(()=>{})
  console.error(`Incomplete R2 backup retained: ${temp}`)
  throw new Error('object_backup_failed; incomplete snapshot is not a valid backup')
}finally{await retentionPool.end()}
