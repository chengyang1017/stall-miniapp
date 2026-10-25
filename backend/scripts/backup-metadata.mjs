// Shared source helpers only; importing this module does not perform a backup.
import { createHash,randomUUID } from 'node:crypto'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function backupIdentity(){
 const supplied=process.env.BACKUP_SET_ID
 if(supplied&&!uuid.test(supplied))throw Error('BACKUP_SET_ID must be a UUID shared by the database and object backup runs')
 return {metadataVersion:2,backupId:randomUUID(),backupSetId:supplied||randomUUID(),pairedSetExplicit:!!supplied,startedAt:new Date().toISOString(),status:'running',schemaVersion:null,expectedApplicationSchemaVersion:18,schemaVersionNote:'Actual migration ledger is inside the database dump; not inspected by this metadata helper.'}
}
export function sealMetadata(value){const v={...value};delete v.manifestSha256;return {...v,manifestSha256:createHash('sha256').update(JSON.stringify(v)).digest('hex')}}
export function verifyMetadata(value){
 // Old v1 manifests remain readable, but lack paired-run identity and manifest integrity.
 if(value.metadataVersion===undefined){if(process.env.BACKUP_SET_ID)throw Error('Legacy manifest cannot verify the requested backup set');return {legacy:true}}
 if(value.metadataVersion!==2||value.status!=='ready'||!uuid.test(value.backupId)||!uuid.test(value.backupSetId)||!Number.isFinite(Date.parse(value.startedAt))||!Number.isFinite(Date.parse(value.createdAt))||!Array.isArray(value.files))throw Error('Invalid backup metadata')
 if(process.env.BACKUP_SET_ID&&value.backupSetId!==process.env.BACKUP_SET_ID)throw Error('Backup set mismatch')
 if(sealMetadata(value).manifestSha256!==value.manifestSha256)throw Error('Manifest integrity mismatch')
 return {legacy:false,backupSetId:value.backupSetId}
}
