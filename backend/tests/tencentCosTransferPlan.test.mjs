import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {sealMetadata} from '../scripts/backup-metadata.mjs'
import {planCosTransfer,cosClassifyKey} from '../scripts/tencent-cos-transfer-plan.mjs'
const hash=s=>createHash('sha256').update(s).digest('hex')
const id='11111111-2222-4333-8444-555555555555'
const route=()=>({
 product_public:'shop-prod-public-1250000000',
 delivery_proof_private:'shop-prod-proofs-1250000000',
 review_private:'shop-prod-reviews-1250000000',
 review_staging_private:'shop-prod-reviews-1250000000',
 avatar_private:'shop-prod-avatars-1250000000'
})
const create=(keys,bucket='r2-products',setId=randomUUID())=>{
 const objects=keys.map((key,i)=>({key,file:String(i).padStart(8,'0')+'-'+hash(key)+'.blob',bytes:i+2,sha256:hash('bytes'+i)}))
 return sealMetadata({metadataVersion:2,status:'ready',backupId:randomUUID(),
  backupSetId:setId,pairedSetExplicit:true,startedAt:'2026-11-09T00:00:00Z',
  createdAt:'2026-11-09T00:01:00Z',format:'stall-r2-backup-v1',bucket,
  objectCount:objects.length,bytes:objects.reduce((s,x)=>s+x.bytes,0),objects,
  files:objects.map(x=>({file:'objects/'+x.file,sha256:x.sha256,bytes:x.bytes}))})
}
test('classifies actual application object key prefixes and protects unknown keys',()=>{
 assert.equal(cosClassifyKey('stores/'+id+'/products/a.jpg'),'product_public')
 assert.equal(cosClassifyKey('delivery-proofs/'+id+'/order/a.jpg'),'delivery_proof_private')
 assert.equal(cosClassifyKey('review-staging/'+id+'/a.png'),'review_staging_private')
 assert.equal(cosClassifyKey('review-images/'+id+'/a.png'),'review_private')
 assert.equal(cosClassifyKey('customer-avatars/'+id+'/a.jpg'),'avatar_private')
 assert.equal(cosClassifyKey('unmapped/a.jpg'),'unknown_protect')
 assert.throws(()=>cosClassifyKey('../secret'),/unsafe_object_key/)
})
test('multi-bucket paired manifests return counts only, no keys or private data',()=>{
 const setId=randomUUID()
 const a=create(['stores/'+id+'/products/a.jpg'],'r2-public',setId)
 const b=create(['delivery-proofs/'+id+'/order/a.jpg','review-images/'+id+'/a.png'],'r2-private',setId)
 const out=planCosTransfer([a,b],route())
 assert.equal(out.objectCount,3)
 assert.equal(out.counts.product_public.objects,1)
 assert.equal(out.counts.delivery_proof_private.objects,1)
 assert.equal(out.counts.review_private.objects,1)
 assert.equal(out.readyForUpload,false)
 assert.doesNotMatch(JSON.stringify(out),/delivery-proofs\/|review-images\/|stores\//)
})
test('unknown objects are protected and flagged before transfer',()=>{
 const out=planCosTransfer([create(['unknown/private/key'])],route())
 assert.equal(out.blockedByUnknownKeys,true)
 assert.equal(out.unknownKeyCount,1)
})
test('rejects public/private bucket mixing, missing mapping and mismatched runs',()=>{
 const a=create(['stores/'+id+'/products/a.jpg'])
 const wrong=route();wrong.delivery_proof_private=wrong.product_public
 assert.throws(()=>planCosTransfer([a],wrong),/private_bucket_cannot_equal_public_bucket/)
 const missing=route();delete missing.avatar_private
 assert.throws(()=>planCosTransfer([a],missing),/cos_bucket_assignment_missing/)
 assert.throws(()=>planCosTransfer([a,create(['review-images/'+id+'/a.png'])],route()),/duplicate_or_unpaired_r2_manifest/)
})
test('rejects tampered and duplicate storage manifest entries',()=>{
 const a=create(['stores/'+id+'/products/a.jpg'])
 assert.throws(()=>planCosTransfer([{...a,bytes:100}],route()),/Manifest integrity mismatch/)
 const duplicate=create(['stores/'+id+'/products/a.jpg','stores/'+id+'/products/a.jpg'])
 assert.throws(()=>planCosTransfer([duplicate],route()),/duplicate_source_object/)
})
