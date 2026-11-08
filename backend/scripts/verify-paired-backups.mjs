// Offline verification of database + R2 backup pairing; does not read object bytes,
// connect to databases/storage, restore data, or modify original manifests.
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {verifyMetadata} from './backup-metadata.mjs'

export function verifyBackupPair(db,r2){
 const left=verifyMetadata(db),right=verifyMetadata(r2)
 if(left.legacy||right.legacy)throw Error('paired_backup_requires_v2_manifests')
 if(db.format!=='stall-db-backup-v1'||r2.format!=='stall-r2-backup-v1')
  throw Error('backup_format_mismatch')
 if(!db.pairedSetExplicit||!r2.pairedSetExplicit)
  throw Error('explicit_shared_backup_set_required')
 if(db.backupSetId!==r2.backupSetId||db.relatedObjectBackupSetId!==r2.backupSetId||
    r2.relatedDatabaseBackupSetId!==db.backupSetId)
  throw Error('backup_set_mismatch')
 if(db.backupId===r2.backupId)throw Error('duplicate_backup_id')
 if(db.includesR2Objects!==false||db.scope!=='postgresql_only')
  throw Error('database_backup_scope_invalid')
 if(typeof db.file!=='string'||!db.file.endsWith('.dump')||
  !Number.isSafeInteger(db.bytes)||db.bytes<=0||!Array.isArray(db.files)||
  db.files.length!==1||db.files[0].file!==db.file||db.files[0].bytes!==db.bytes||
  db.files[0].sha256!==db.sha256)
  throw Error('database_backup_manifest_invalid')
 if(!Number.isSafeInteger(r2.objectCount)||r2.objectCount<0||
  !Number.isSafeInteger(r2.bytes)||r2.bytes<0||
  !Array.isArray(r2.objects)||r2.objects.length!==r2.objectCount||
  !Array.isArray(r2.files)||r2.files.length!==r2.objectCount)
  throw Error('object_backup_manifest_invalid')
 const files=new Set(),keys=new Set()
 let sum=0
 for(let i=0;i<r2.objectCount;i++){
  const o=r2.objects[i],f=r2.files[i]
  if(!o||!f||typeof o.key!=='string'||!o.key||
   typeof o.file!=='string'||!/^\d{8}-[a-f0-9]{64}\.blob$/.test(o.file)||
   typeof o.sha256!=='string'||!/^[a-f0-9]{64}$/.test(o.sha256)||
   !Number.isSafeInteger(o.bytes)||o.bytes<0||files.has(o.file)||keys.has(o.key)||
   f.file!=='objects/'+o.file||f.bytes!==o.bytes||f.sha256!==o.sha256)
   throw Error('object_backup_manifest_invalid')
  files.add(o.file);keys.add(o.key);sum+=o.bytes
  if(!Number.isSafeInteger(sum))throw Error('object_backup_manifest_invalid')
 }
 if(sum!==r2.bytes)throw Error('object_backup_size_mismatch')
 const a=Date.parse(db.createdAt),b=Date.parse(r2.createdAt)
 return {audit:'paired_backup_manifests',pairValid:true,backupSetId:db.backupSetId,
  databaseBytes:db.bytes,objectCount:r2.objectCount,objectBytes:r2.bytes,
  minutesBetweenCompletions:Math.round(Math.abs(a-b)/60000),
  restoreVerified:false,
  limitations:['Manifest checks are NOT proof that backup bytes exist, match their hashes or can restore.',
   'Run verify-db-backup.mjs and verify-r2-backup.mjs separately on actual files.',
   'A shared BACKUP_SET_ID does NOT make PostgreSQL and R2 an atomic snapshot.',
   'Require a controlled write freeze, complete R2 enumeration and an isolated restore drill before merchant cutover.']}
}
async function main(){
 const [dbPath,r2Path,...rest]=process.argv.slice(2)
 if(!dbPath||!r2Path||rest.length)throw Error('usage_two_manifest_files')
 const load=async p=>{
  const bytes=await readFile(p)
  if(bytes.length>2000000)throw Error('manifest_too_large')
  return JSON.parse(bytes.toString('utf8'))
 }
 const r=verifyBackupPair(await load(dbPath),await load(r2Path))
 console.log(JSON.stringify(r,null,2))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error('BACKUP_PAIR_AUDIT_FAILED');process.exitCode=1})
}
