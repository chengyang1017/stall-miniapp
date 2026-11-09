// Offline COS transfer readiness. NO upload, copy, delete, DB or network calls.
// Reads protected R2 manifest JSON only; does not output storage keys or user data.
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {verifyMetadata} from './backup-metadata.mjs'

export function cosClassifyKey(key){
 if(typeof key!=='string'||!key||key.startsWith('/')||key.includes('\\')||
    key.split('/').some(x=>x==='..'||x==='.'||!x)||/[\u0000-\u001f]/.test(key))
  throw Error('unsafe_object_key')
 if(/^stores\/[0-9a-f-]{36}\/products\//.test(key))return 'product_public'
 if(/^delivery-proofs\/[0-9a-f-]{36}\//.test(key))return 'delivery_proof_private'
 if(/^review-images\/[0-9a-f-]{36}\//.test(key))return 'review_private'
 if(/^review-staging\/[0-9a-f-]{36}\//.test(key))return 'review_staging_private'
 if(/^customer-avatars\/[0-9a-f-]{36}\//.test(key))return 'avatar_private'
 return 'unknown_protect'
}
export function planCosTransfer(manifests,route){
 if(!Array.isArray(manifests)||!manifests.length||manifests.length>12||
   !route||typeof route!=='object'||Array.isArray(route))
  throw Error('invalid_cos_transfer_inputs')
 const classes=['product_public','delivery_proof_private','review_private',
  'review_staging_private','avatar_private']
 const counts=Object.fromEntries([...classes,'unknown_protect'].map(k=>[k,{objects:0,bytes:0}]))
 const sources=new Set(),identities=new Set(),allObjects=new Set()
 const assignments={}
 for(const kind of classes){
  const bucket=route[kind]
  if(typeof bucket!=='string'||!/^[-a-z0-9]{3,63}$/.test(bucket)||
    /(?:example|change|placeholder|dummy|test)/i.test(bucket))
   throw Error('cos_bucket_assignment_missing_or_placeholder')
  assignments[kind]=bucket
 }
 if(Object.keys(route).some(x=>!classes.includes(x)))throw Error('unexpected_cos_bucket_assignment')
 if(classes.filter(x=>x!=='product_public').some(x=>assignments[x]===assignments.product_public))
  throw Error('private_bucket_cannot_equal_public_bucket')
 if(assignments.review_private===assignments.delivery_proof_private||
    assignments.avatar_private===assignments.product_public)
  throw Error('sensitive_bucket_separation_required')
 let backupSetId
 for(const m of manifests){
  const verified=verifyMetadata(m)
  if(verified.legacy||m.format!=='stall-r2-backup-v1'||!m.pairedSetExplicit||
     !Array.isArray(m.objects)||!Array.isArray(m.files)||
     !Number.isSafeInteger(m.objectCount)||m.objectCount!==m.objects.length||
     m.files.length!==m.objects.length||!Number.isSafeInteger(m.bytes)||m.bytes<0||
     typeof m.bucket!=='string'||!m.bucket)
   throw Error('invalid_r2_manifest_for_cos')
  if(backupSetId===undefined)backupSetId=m.backupSetId
  if(backupSetId!==m.backupSetId||sources.has(m.bucket)||identities.has(m.backupId))
   throw Error('duplicate_or_unpaired_r2_manifest')
  sources.add(m.bucket);identities.add(m.backupId)
  let subtotal=0
  for(let i=0;i<m.objects.length;i++){
   const item=m.objects[i],file=m.files[i]
   if(!item||!file||typeof item.key!=='string'||typeof item.file!=='string'||
      !/^\d{8}-[a-f0-9]{64}\.blob$/.test(item.file)||
      !/^[a-f0-9]{64}$/.test(item.sha256)||!Number.isSafeInteger(item.bytes)||item.bytes<0||
      file.file!=='objects/'+item.file||file.bytes!==item.bytes||file.sha256!==item.sha256)
    throw Error('invalid_object_manifest_entry')
   const kind=cosClassifyKey(item.key)
   const unique=m.bucket+'\u0000'+item.key
   if(allObjects.has(unique))throw Error('duplicate_source_object')
   allObjects.add(unique)
   if(kind==='unknown_protect'&&item.key.length>1024)throw Error('unsafe_object_key')
   counts[kind].objects++
   counts[kind].bytes+=item.bytes
   subtotal+=item.bytes
   if(!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(counts[kind].bytes))
    throw Error('object_size_overflow')
  }
  if(subtotal!==m.bytes)throw Error('r2_manifest_bytes_mismatch')
 }
 const unresolved=counts.unknown_protect.objects
 return {operation:'offline_cos_transfer_readiness',backupSetId,
  sourceBucketCount:sources.size,objectCount:allObjects.size,counts,
  destinationBuckets:assignments,readyForUpload:false,
  blockedByUnknownKeys:unresolved>0,unknownKeyCount:unresolved,
  requirements:[
   'Verify all source R2 buckets (public, delivery proof, review, avatar) are included; a single manifest never proves full coverage.',
   'Independently run verify-r2-backup.mjs on each real backup folder before restoring any bytes.',
   'Do not place private proof, review, review-staging or avatars in a publicly readable bucket.',
   'Keep keys unchanged when copying into COS; storage_bucket columns or public image URLs may need reviewed updates on restored TencentDB.',
   'Verify SHA256 by downloading COS objects after transfer, not by trusting S3 ETag.',
   'Never copy unknown keys automatically or delete R2/Neon before verified rollback and merchant sign-off.'
  ]}
}
async function main(){
 const [mapPath,...manifestPaths]=process.argv.slice(2)
 if(!mapPath||!manifestPaths.length)throw Error('usage_map_then_manifests')
 const load=async p=>{
  const bytes=await readFile(p)
  if(bytes.length>10000000)throw Error('oversized_manifest')
  return JSON.parse(bytes.toString('utf8'))
 }
 console.log(JSON.stringify(planCosTransfer(await Promise.all(manifestPaths.map(load)),await load(mapPath)),null,2))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error('COS_TRANSFER_PLAN_BLOCKED');process.exitCode=1})
}
