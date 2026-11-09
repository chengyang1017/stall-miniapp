import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {sealMetadata} from '../scripts/backup-metadata.mjs'
import {restoreCosSnapshots,restoreVerifiedObject,validateCosRestoreTarget} from '../scripts/tencent-cos-isolated-restore.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex')
const id='11111111-2222-4333-8444-555555555555'
const key='stores/'+id+'/products/a.jpg',bytes=Buffer.from('known-photo-bytes'),name='00000000-'+sha(key)+'.blob'
const route={product_public:'merchant-prod-1251000000',delivery_proof_private:'merchant-proofs-1251000000',
 review_private:'merchant-reviews-1251000000',review_staging_private:'merchant-reviews-1251000000',
 avatar_private:'merchant-avatars-1251000000'}
const env={TENCENT_COS_REGION:'ap-guangzhou',TENCENT_COS_ENDPOINT:'https://cos.ap-guangzhou.myqcloud.com',
 TENCENT_COS_ACCESS_KEY_ID:'fake-id',TENCENT_COS_SECRET_ACCESS_KEY:'fake-key'}
async function fixture(){
 const folder=await mkdtemp(path.join(os.tmpdir(),'cos-restore-test-'))
 await mkdir(path.join(folder,'objects'))
 await writeFile(path.join(folder,'objects',name),bytes)
 const setId=randomUUID()
 const object={key,file:name,bytes:bytes.length,sha256:sha(bytes),contentType:'image/jpeg'}
 const manifest=sealMetadata({metadataVersion:2,status:'ready',backupId:randomUUID(),
  backupSetId:setId,pairedSetExplicit:true,startedAt:'2026-11-09T00:00:00Z',
  createdAt:'2026-11-09T00:01:00Z',format:'stall-r2-backup-v1',bucket:'r2-source',
  objectCount:1,bytes:bytes.length,objects:[object],
  files:[{file:'objects/'+name,sha256:sha(bytes),bytes:bytes.length}]})
 await writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest))
 return {folder,setId,object,cleanup:()=>rm(folder,{recursive:true,force:true})}
}
class HeadObjectCommand{constructor(input){this.input=input}}
class PutObjectCommand{constructor(input){this.input=input}}
class GetObjectCommand{constructor(input){this.input=input}}
const commands={HeadObjectCommand,PutObjectCommand,GetObjectCommand}
function mockClient({alreadyExists=false,corruptReadback=false}={}){
 const calls=[]
 return {calls,async send(cmd){
  calls.push(cmd)
  if(cmd instanceof HeadObjectCommand){
   if(alreadyExists)return {}
   throw Object.assign(Error('not found'),{$metadata:{httpStatusCode:404}})
  }
  if(cmd instanceof PutObjectCommand)return {}
  if(cmd instanceof GetObjectCommand)return {Body:{async transformToByteArray(){
   return corruptReadback?Buffer.from('altered'):bytes
  }}}
  throw Error('unexpected command')
 }}
}
test('offline plan does not access COS, even when supplied a client',async()=>{
 const f=await fixture()
 try{
  const client=mockClient()
  const out=await restoreCosSnapshots({folders:[f.folder],route,env,client,commands})
  assert.equal(out.mode,'offline_plan')
  assert.equal(out.writePerformed,false)
  assert.equal(client.calls.length,0)
 }finally{await f.cleanup()}
})
test('apply requires explicit batch authorization and verified Tencent endpoint',async()=>{
 const f=await fixture()
 try{
  const client=mockClient()
  await assert.rejects(()=>restoreCosSnapshots({folders:[f.folder],route,env,apply:true,client,commands}),/cos_restore_explicit_authorization_required/)
  assert.equal(client.calls.length,0)
  const allowed={...env,TENCENT_COS_RESTORE_AUTHORIZE:'APPLY_TO_ISOLATED_EMPTY_BUCKETS',
   TENCENT_COS_EXPECTED_BACKUP_SET_ID:f.setId}
  const out=await restoreCosSnapshots({folders:[f.folder],route,env:allowed,apply:true,client,commands})
  assert.equal(out.verifiedObjects,1)
  assert.equal(out.writePerformed,true)
  assert.equal(client.calls.length,3)
  assert.equal(client.calls[1].input.IfNoneMatch,'*')
  assert.equal(client.calls[1].input.CacheControl,'public, max-age=3600')
 }finally{await f.cleanup()}
})
test('preexisting destination and wrong digest prevent passing verification',async()=>{
 const obj={key,bytes,sha256:sha(bytes),kind:'product_public',contentType:'image/jpeg'}
 await assert.rejects(()=>restoreVerifiedObject(mockClient({alreadyExists:true}),commands,obj,'bucket'),/cos_restore_target_already_exists/)
 await assert.rejects(()=>restoreVerifiedObject(mockClient({corruptReadback:true}),commands,obj,'bucket'),/cos_restore_digest_mismatch/)
})
test('corrupted local bytes are rejected before any COS operation',async()=>{
 const f=await fixture()
 try{
  await writeFile(path.join(f.folder,'objects',name),'wrong')
  const client=mockClient()
  const authorized={...env,TENCENT_COS_RESTORE_AUTHORIZE:'APPLY_TO_ISOLATED_EMPTY_BUCKETS',
   TENCENT_COS_EXPECTED_BACKUP_SET_ID:f.setId}
  await assert.rejects(()=>restoreCosSnapshots({folders:[f.folder],route,env:authorized,apply:true,client,commands}),/cos_restore_stopped_verify_destination_before_retry/)
  assert.equal(client.calls.length,0)
 }finally{await f.cleanup()}
})
test('reject arbitrary endpoints and wrong region or missing credentials',()=>{
 assert.throws(()=>validateCosRestoreTarget({...env,TENCENT_COS_ENDPOINT:'https://attacker.example.com'}),/cos_target_endpoint_invalid/)
 assert.throws(()=>validateCosRestoreTarget({...env,TENCENT_COS_REGION:'ap-shanghai'}),/cos_target_endpoint_invalid/)
 assert.throws(()=>validateCosRestoreTarget({...env,TENCENT_COS_SECRET_ACCESS_KEY:''}),/cos_target_credentials_missing/)
})
