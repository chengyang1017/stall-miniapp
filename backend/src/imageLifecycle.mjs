import { S3Client,HeadObjectCommand } from '@aws-sdk/client-s3'
export const PRODUCT_KEY=/^stores\/([0-9a-f-]{36})\/products\/[0-9a-f-]{36}\.(jpg|png|webp)$/
export function imageStorageClient(){
 const {S3_ENDPOINT:endpoint,S3_ACCESS_KEY_ID:accessKeyId,S3_SECRET_ACCESS_KEY:secretAccessKey}=process.env
 if(!endpoint||!accessKeyId||!secretAccessKey)return null
 return new S3Client({region:process.env.S3_REGION||'auto',endpoint,credentials:{accessKeyId,secretAccessKey},maxAttempts:1})
}
export function privateProofBucket(){
 // An operator must verify bucket/public-gateway policies; code cannot revoke old public URLs.
 if(process.env.PROOF_STORAGE_PRIVATE_CONFIRMED!=='true')return null
 return process.env.S3_PROOF_BUCKET||process.env.S3_BUCKET||null
}
export async function headImage(key,bucket=process.env.S3_BUCKET){
 const s3=imageStorageClient();if(!s3||!bucket)return {state:'unknown',reason:'storage_not_configured'}
 try{const h=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(6000)});return {state:'exists',etag:h.ETag||null,bytes:Number(h.ContentLength||0),contentType:String(h.ContentType||'').split(';')[0],modifiedAt:h.LastModified?.toISOString()||null}}
 catch(e){if(e.name==='NotFound'||e.$metadata?.httpStatusCode===404)return {state:'missing'};return {state:'unknown',reason:'storage_check_failed'}}
}
export async function registerImage(pool,store,key,kind,bucket,size,type,clientKey=null){
 const prefix=key.slice(0,key.lastIndexOf('/')+1)
 const r=await pool.query(`INSERT INTO stored_images(store_id,object_key,kind,source,storage_bucket,expected_bytes,content_type,upload_request_key) VALUES($1,$2,$3,'upload',$4,$5,$6,$7)
 ON CONFLICT(store_id,kind,upload_request_key) DO UPDATE SET protect_until=clock_timestamp()+interval '7 days'
 WHERE stored_images.expected_bytes=excluded.expected_bytes AND stored_images.content_type=excluded.content_type AND stored_images.storage_bucket=excluded.storage_bucket
 AND stored_images.object_key LIKE $8||'%' AND NOT stored_images.ever_referenced AND stored_images.upload_state NOT IN ('deleting','deleted')
 RETURNING id,object_key`,[store,key,kind,bucket,size,type,clientKey,prefix])
 if(!r.rows.length)throw Object.assign(Error('upload_request_conflict_or_already_referenced'),{status:409})
 return {id:r.rows[0].id,key:r.rows[0].object_key}
}
export async function verifyProductImage(pool,store,key){
 if(key===null)return true
 if(typeof key!=='string'||!PRODUCT_KEY.test(key)||!key.startsWith('stores/'+store+'/products/'))return false
 const image=(await pool.query('SELECT * FROM stored_images WHERE store_id=$1 AND object_key=$2 AND kind=\'product\'',[store,key])).rows[0]
 if(!image||['deleting','deleted'].includes(image.upload_state)||image.source==='discovered')return false
 const bucket=image.storage_bucket||process.env.S3_BUCKET,h=await headImage(key,bucket)
 if(h.state!=='exists'){
  await pool.query(`UPDATE stored_images SET last_checked_at=clock_timestamp(),upload_state=$3 WHERE store_id=$1 AND object_key=$2 AND upload_state NOT IN ('deleting','deleted')`,[store,key,h.state==='missing'?'missing':'unknown']);if(h.state==='unknown')throw Object.assign(Error('image_storage_check_unavailable'),{status:503});return false
 }
 if(h.bytes<1||h.bytes>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(h.contentType)||image.expected_bytes!=null&&image.expected_bytes!==h.bytes||image.source==='upload'&&image.content_type!==h.contentType)return false
 const r=await pool.query(`UPDATE stored_images SET upload_state='verified',storage_bucket=$3,etag=$4,actual_bytes=$5,object_modified_at=$6,last_checked_at=clock_timestamp() WHERE store_id=$1 AND object_key=$2 AND upload_state NOT IN ('deleting','deleted') RETURNING id`,[store,key,bucket,h.etag,h.bytes,h.modifiedAt]);return !!r.rows.length
}
export async function imageReferences(db,store,key){
 const r=await db.query(`SELECT
 (SELECT count(*)::int FROM products WHERE store_id=$1 AND image_object_key=$2) AS products,
 (SELECT count(*)::int FROM product_drafts WHERE store_id=$1 AND payload->>'imageObjectKey'=$2) AS drafts,
 (SELECT count(*)::int FROM orders WHERE store_id=$1 AND delivery_proof_key=$2) AS proofs,
 (SELECT count(*)::int FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.store_id=$1 AND i.image_object_key_snapshot=$2) AS "orderSnapshots",
 (SELECT count(*)::int FROM image_reference_history WHERE store_id=$1 AND object_key=$2) AS history`,[store,key]);return r.rows[0]
}
export function candidateReason(image,refs,h,now=Date.now()){
 if(image.kind!=='product'||!PRODUCT_KEY.test(image.object_key))return 'proof_or_invalid_key_protected'
 if(image.ever_referenced||image.retention_hold||Object.values(refs).some(n=>Number(n)>0))return 'business_history_archive_or_backup_protected'
 if(image.source!=='upload')return 'legacy_history_unknown_protected'
 if(['deleting','deleted'].includes(image.upload_state))return 'deletion_state_locked'
 if(new Date(image.protect_until).getTime()>now)return 'upload_grace_period'
 if(h.state!=='exists'||!h.etag||!h.modifiedAt)return h.state==='missing'?'upload_interrupted_no_object':'object_state_unknown'
 if(new Date(h.modifiedAt).getTime()>now-7*86400000)return 'object_recently_modified'
 if(!['image/jpeg','image/png','image/webp'].includes(h.contentType)||h.bytes<1||h.bytes>5*1024*1024)return 'unexpected_object_protected'
 return 'unassociated_upload_after_grace'
}
