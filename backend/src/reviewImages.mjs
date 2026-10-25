import { randomUUID } from 'node:crypto'
import { PutObjectCommand,CopyObjectCommand,GetObjectCommand,DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { imageStorageClient,headImage } from './imageLifecycle.mjs'
import { reviewError as fail,reviewPurchase,reviewPolicy } from './reviewPolicy.mjs'
const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
export function reviewBucket(){const b=process.env.S3_REVIEW_BUCKET;if(process.env.REVIEW_STORAGE_PRIVATE_CONFIRMED!=='true'||!b||b===process.env.S3_BUCKET||b===process.env.S3_PROOF_BUCKET)fail(503,'review_private_bucket_not_confirmed');return b}
// A presigned PUT has no body during signing: avoid signing an optional checksum
// of an empty payload. Length/type, magic, frozen bytes and ETag remain checked.
function storage(){const s=imageStorageClient({presignedUpload:true});if(!s)fail(503,'review_storage_unavailable');return s}
export async function issueReviewImage(db,store,subject,b){
 const bucket=reviewBucket(),s3=storage()
 const purchase=await reviewPurchase(db,store,subject,b.orderItemId);if(!purchase.eligible)fail(409,purchase.reason)
 if(!Object.hasOwn(types,b.contentType)||!Number.isSafeInteger(b.sizeBytes)||b.sizeBytes<1||b.sizeBytes>reviewPolicy.maxImageBytes)fail(400,'invalid_review_image')
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['review-upload:'+subject])
 let row=(await db.query('SELECT * FROM product_review_images WHERE store_id=$1 AND customer_subject=$2 AND client_key=$3 FOR UPDATE',[store,subject,b.clientKey])).rows[0]
 if(row&&(row.order_item_id!==b.orderItemId||row.content_type!==b.contentType||row.size_bytes!==b.sizeBytes||!['issued','verified'].includes(row.upload_state)||row.upload_state==='issued'&&Date.now()-new Date(row.created_at)>86400000))fail(409,'image_request_changed_or_expired')
 if(row?.upload_state==='verified'){await verifySealedImage(row);return {imageId:row.id,verified:true}}
 if(!row){
  const count=await db.query("SELECT count(*)::int AS n FROM product_review_images WHERE customer_subject=$1 AND (created_at>clock_timestamp()-interval '1 day' OR bound_review_id IS NULL AND upload_state NOT IN ('expired','deleted'))",[subject])
  if(count.rows[0].n>=20)fail(429,'review_upload_quota')
  const id=randomUUID(),ext=types[b.contentType]
  row=(await db.query(`INSERT INTO product_review_images(id,store_id,customer_subject,order_item_id,client_key,storage_bucket,staging_key,object_key,content_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[id,store,subject,b.orderItemId,b.clientKey,bucket,`review-staging/${store}/${id}.${ext}`,`review-images/${store}/${id}.${ext}`,b.contentType,b.sizeBytes])).rows[0]
 }
 return {imageId:row.id,uploadUrl:await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:row.staging_key,ContentType:row.content_type,ContentLength:row.size_bytes}),{expiresIn:300,signableHeaders:new Set(['content-type','content-length'])}),contentType:row.content_type,sizeBytes:row.size_bytes}
}
export async function completeReviewImage(db,store,subject,id){
 const image=(await db.query('SELECT * FROM product_review_images WHERE store_id=$1 AND customer_subject=$2 AND id=$3 FOR UPDATE',[store,subject,id])).rows[0]
 if(!image)fail(404,'image_not_found')
 if(image.upload_state==='verified')return {imageId:image.id,verified:true}
 if(image.upload_state!=='issued'||Date.now()-new Date(image.created_at)>86400000)fail(409,'image_upload_expired')
 if(image.storage_bucket!==reviewBucket())fail(503,'image_bucket_changed')
 const h=await headImage(image.staging_key,image.storage_bucket)
 if(h.state!=='exists'||h.bytes!==image.size_bytes||h.contentType!==image.content_type||!h.etag)fail(409,'image_upload_not_verified')
 const raw=await storage().send(new GetObjectCommand({Bucket:image.storage_bucket,Key:image.staging_key,Range:'bytes=0-31',IfMatch:h.etag}),{abortSignal:AbortSignal.timeout(6000)})
 const bytes=Buffer.from(await raw.Body.transformToByteArray())
 const valid=image.content_type==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from([255,216,255])):image.content_type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'
 if(!valid)fail(400,'review_image_signature_invalid')
 // Freeze bytes at a server-only key. A still-valid PUT URL can only alter staging.
 await storage().send(new CopyObjectCommand({Bucket:image.storage_bucket,Key:image.object_key,CopySource:image.storage_bucket+'/'+image.staging_key.split('/').map(encodeURIComponent).join('/'),CopySourceIfMatch:h.etag,ContentType:image.content_type,MetadataDirective:'REPLACE',CacheControl:'private, no-store'}),{abortSignal:AbortSignal.timeout(6000)})
 const final=await headImage(image.object_key,image.storage_bucket)
 if(final.state!=='exists'||final.bytes!==image.size_bytes||final.contentType!==image.content_type||!final.etag)fail(503,'image_freeze_unconfirmed')
 await db.query("UPDATE product_review_images SET upload_state='verified',etag=$2,verified_at=clock_timestamp() WHERE id=$1",[id,final.etag])
 return {imageId:id,verified:true}
}
export async function checkReviewImages(db,store,subject,itemId,ids,reviewId){
 if(!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length)fail(400,'invalid_image_ids')
 for(const id of [...ids].sort()){
  const row=(await db.query('SELECT * FROM product_review_images WHERE id=$1 AND store_id=$2 AND customer_subject=$3 AND order_item_id=$4 FOR UPDATE',[id,store,subject,itemId])).rows[0]
  if(!row||row.upload_state!=='verified'||row.bound_review_id&&row.bound_review_id!==reviewId||!row.bound_review_id&&Date.now()-new Date(row.created_at)>86400000)fail(409,'review_image_unavailable')
  await verifySealedImage(row)
 }
}
export async function verifySealedImage(row){
 if(row.storage_bucket!==reviewBucket())fail(503,'image_bucket_changed')
 const h=await headImage(row.object_key,row.storage_bucket)
 if(h.state!=='exists'||h.etag!==row.etag||h.bytes!==row.size_bytes||h.contentType!==row.content_type)fail(409,'sealed_image_changed_or_unavailable')
}
export async function signedReviewImage(row){await verifySealedImage(row);return {url:await getSignedUrl(storage(),new GetObjectCommand({Bucket:row.storage_bucket,Key:row.object_key,ResponseCacheControl:'private, no-store'}),{expiresIn:60}),expiresInSeconds:60}}

// Explicit platform operation only. Lock/expire first so attachment cannot race
// deletion. No automatic R2 cleanup runs at server startup.
export async function expireUnboundReviewImage(pool,store,subject,id){
 const db=await pool.connect();let row
 try{
  await db.query('BEGIN');row=(await db.query("SELECT * FROM product_review_images WHERE id=$1 AND store_id=$2 AND bound_review_id IS NULL AND created_at<clock_timestamp()-interval '1 day'*$3 FOR UPDATE",[id,store,reviewPolicy.unboundImageDays])).rows[0]
  if(!row)fail(409,'image_not_orphan_or_protected')
  if(row.storage_bucket!==reviewBucket())fail(503,'image_bucket_changed')
  await db.query("UPDATE product_review_images SET upload_state='expired' WHERE id=$1 AND upload_state<>'deleted'",[id])
  await db.query('INSERT INTO product_review_image_cleanup_events(image_id,actor_subject,result) VALUES($1,$2,$3)',[id,subject,'expire_requested'])
  await db.query('COMMIT')
  let result='deleted'
  try{
   const h=await headImage(row.object_key,row.storage_bucket)
   if(h.state==='unknown'||h.state==='exists'&&(!row.etag||row.etag!==h.etag))fail(409,'orphan_object_uncertain')
   if(row.upload_state!=='deleted')for(const key of [row.staging_key,row.object_key])await storage().send(new DeleteObjectCommand({Bucket:row.storage_bucket,Key:key}),{abortSignal:AbortSignal.timeout(6000)})
   await db.query("UPDATE product_review_images SET upload_state='deleted' WHERE id=$1 AND bound_review_id IS NULL",[id])
  }catch{result='retained_or_retry_required'}
  await db.query('INSERT INTO product_review_image_cleanup_events(image_id,actor_subject,result) VALUES($1,$2,$3)',[id,subject,result]);return {result}
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
}
