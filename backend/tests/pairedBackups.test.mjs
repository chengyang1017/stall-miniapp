import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {sealMetadata} from '../scripts/backup-metadata.mjs'
import {verifyBackupPair} from '../scripts/verify-paired-backups.mjs'
const h=s=>createHash('sha256').update(s).digest('hex')
function fixtures(){
 const backupSetId=randomUUID(),now='2026-11-08T00:00:00.000Z',key='stores/a/products/b',file='00000000-'+h(key)+'.blob',sha256=h('object')
 const common={metadataVersion:2,backupSetId,pairedSetExplicit:true,startedAt:now,status:'ready',createdAt:now}
 const db=sealMetadata({...common,backupId:randomUUID(),format:'stall-db-backup-v1',
   file:'backup.dump',bytes:100,sha256:h('db'),scope:'postgresql_only',includesR2Objects:false,
   files:[{file:'backup.dump',bytes:100,sha256:h('db')}],relatedObjectBackupSetId:backupSetId})
 const r2=sealMetadata({...common,backupId:randomUUID(),format:'stall-r2-backup-v1',
   bucket:'example',objectCount:1,bytes:7,objects:[{key,file,sha256,bytes:7}],
   files:[{file:'objects/'+file,sha256,bytes:7}],relatedDatabaseBackupSetId:backupSetId})
 return {db,r2}
}
test('same explicitly assigned backup set passes offline manifest pairing',()=>{
 const {db,r2}=fixtures();const out=verifyBackupPair(db,r2)
 assert.equal(out.pairValid,true)
 assert.equal(out.objectCount,1)
 assert.equal(out.restoreVerified,false)
 assert.doesNotMatch(JSON.stringify(out),/stores\/a\/products|backup\.dump/)
})
test('different backup sets and one-sided links fail closed',()=>{
 const {db,r2}=fixtures()
 assert.throws(()=>verifyBackupPair(db,sealMetadata({...r2,backupSetId:randomUUID()})),/backup_set_mismatch/)
 assert.throws(()=>verifyBackupPair(db,sealMetadata({...r2,relatedDatabaseBackupSetId:randomUUID()})),/backup_set_mismatch/)
})
test('unpaired, corrupt or legacy manifests are rejected',()=>{
 const {db,r2}=fixtures()
 assert.throws(()=>verifyBackupPair(sealMetadata({...db,pairedSetExplicit:false}),r2),/explicit_shared_backup_set_required/)
 assert.throws(()=>verifyBackupPair({...db,bytes:10},r2),/Manifest integrity mismatch/)
 assert.throws(()=>verifyBackupPair({format:db.format},r2),/paired_backup_requires_v2_manifests/)
})
test('manifest file count, size and hashes must agree with object manifest',()=>{
 const {db,r2}=fixtures()
 assert.throws(()=>verifyBackupPair(db,sealMetadata({...r2,bytes:8})),/object_backup_size_mismatch/)
 assert.throws(()=>verifyBackupPair(db,sealMetadata({...r2,objectCount:2})),/object_backup_manifest_invalid/)
 assert.throws(()=>verifyBackupPair(db,sealMetadata({...r2,files:[{...r2.files[0],sha256:h('different')}]})),/object_backup_manifest_invalid/)
})
