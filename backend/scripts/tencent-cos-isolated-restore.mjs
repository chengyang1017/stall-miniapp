// Operator-only isolated COS restore. DEFAULT IS PLAN. --apply requires explicit
// authorization + independently verified backups; never overwrites or deletes objects.
// No object keys, personal data, credentials, or signed URLs in log messages.
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {planCosTransfer,cosClassifyKey} from './tencent-cos-transfer-plan.mjs'

export function validateCosRestoreTarget(env){
 const region=env.TENCENT_COS_REGION
 const endpoint=env.TENCENT_COS_ENDPOINT
 if(!/^[-a-z0-9]{3,32}$/.test(region||'')||!endpoint)throw Error('cos_target_configuration_required')
 let url
 try{url=new URL(endpoint)}catch{throw Error('cos_target_endpoint_invalid')}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||
    url.pathname!=='/'&&url.pathname!==''||
    url.hostname!==('cos.'+region+'.myqcloud.com'))
  throw Error('cos_target_endpoint_invalid')
 if(!env.TENCENT_COS_ACCESS_KEY_ID||!env.TENCENT_COS_SECRET_ACCESS_KEY)
  throw Error('cos_target_credentials_missing')
 return {endpoint:url.origin,region}
}
const sha256=b=>createHash('sha256').update(b).digest('hex')
export async function validateLocalRestorableFiles(manifest,folder,{maxFileBytes=8*1024*1024}={}){
 const items=[]
 for(const obj of manifest.objects){
  // The planner has validated this filename. Only trusted local snapshot paths.
  const file=path.join(folder,'objects',obj.file)
  const bytes=await readFile(file)
  if(bytes.length>maxFileBytes||bytes.length!==obj.bytes||sha256(bytes)!==obj.sha256)
   throw Error('local_cos_restore_bytes_invalid')
  items.push({key:obj.key,bytes,sha256:obj.sha256,
   kind:cosClassifyKey(obj.key),contentType:obj.contentType})
 }
 return items
}
export function restoreContentType(kind,type){
 const allowed=new Set(['image/jpeg','image/png','image/webp'])
 if(!allowed.has(type))throw Error('cos_restore_unsupported_mime_type')
 if(kind==='unknown_protect')throw Error('unknown_object_routing_blocked')
 return type
}
export async function restoreVerifiedObject(client,commands,object,bucket){
 // An existing target is NEVER silently accepted or overwritten. Explicit
 // If-None-Match protects against a write race; unsupported COS implementations fail closed.
 const {HeadObjectCommand,PutObjectCommand,GetObjectCommand}=commands
 try{
  await client.send(new HeadObjectCommand({Bucket:bucket,Key:object.key}))
  throw Error('cos_restore_target_already_exists')
 }catch(e){
  if(e.message==='cos_restore_target_already_exists')throw e
  if(e.$metadata?.httpStatusCode!==404&&e.name!=='NotFound'&&e.name!=='NoSuchKey')
   throw Error('cos_restore_target_precheck_failed')
 }
 try{
  await client.send(new PutObjectCommand({Bucket:bucket,Key:object.key,
   Body:object.bytes,ContentLength:object.bytes.length,
   ContentType:restoreContentType(object.kind,object.contentType),
   CacheControl:object.kind==='product_public'?'public, max-age=3600':'private, no-store',
   IfNoneMatch:'*'}))
 }catch{throw Error('cos_restore_conditional_put_failed')}
 let stream
 try{stream=await client.send(new GetObjectCommand({Bucket:bucket,Key:object.key}))}
 catch{throw Error('cos_restore_readback_failed')}
 if(!stream?.Body)throw Error('cos_restore_readback_failed')
 const downloaded=Buffer.from(await stream.Body.transformToByteArray())
 if(downloaded.length!==object.bytes.length||sha256(downloaded)!==object.sha256)
  throw Error('cos_restore_digest_mismatch')
 return {verified:true,bytes:downloaded.length}
}
export async function restoreCosSnapshots({folders,route,env,apply=false,client=null,commands=null}){
 if(!Array.isArray(folders)||folders.length===0||folders.length>12)
  throw Error('cos_backup_folders_required')
 const parsed=await Promise.all(folders.map(async folder=>{
  const data=await readFile(path.join(folder,'manifest.json'))
  if(data.length>10000000)throw Error('oversized_manifest')
  return JSON.parse(data.toString('utf8'))
 }))
 const plan=planCosTransfer(parsed,route)
 if(plan.blockedByUnknownKeys)throw Error('unknown_object_routing_blocked')
 // Even separate source buckets can contain identical keys that collide
 // after routing into the same COS destination; never silently overwrite.
 const destKeys=new Set()
 for(const manifest of parsed)for(const item of manifest.objects){
  const key=route[cosClassifyKey(item.key)]+'\\0'+item.key
  if(destKeys.has(key))throw Error('duplicate_cos_destination_key')
  destKeys.add(key)
 }
 const preview={mode:apply?'isolated_cos_restore':'offline_plan',objectCount:plan.objectCount,
  counts:plan.counts,destinationBuckets:plan.destinationBuckets,writePerformed:false,
  note:'Plan does not verify backup bytes. Restore requires verified files, isolated empty COS buckets and explicit approval.'}
 if(!apply)return preview
 if(env.TENCENT_COS_RESTORE_AUTHORIZE!=='APPLY_TO_ISOLATED_EMPTY_BUCKETS'||
    env.TENCENT_COS_EXPECTED_BACKUP_SET_ID!==plan.backupSetId)
  throw Error('cos_restore_explicit_authorization_required')
 const target=validateCosRestoreTarget(env)
 // Do not use an arbitrary injectable production endpoint.
 let sdk=commands
 let cosClient=client
 if(!sdk){sdk=await import('@aws-sdk/client-s3')}
 if(!cosClient)cosClient=new sdk.S3Client({endpoint:target.endpoint,region:target.region,
  credentials:{accessKeyId:env.TENCENT_COS_ACCESS_KEY_ID,
   secretAccessKey:env.TENCENT_COS_SECRET_ACCESS_KEY},
  maxAttempts:1}) 
 let verified=0
 try{
  for(let i=0;i<parsed.length;i++){
   const items=await validateLocalRestorableFiles(parsed[i],folders[i])
   for(const object of items){
    const bucket=route[object.kind]
    await restoreVerifiedObject(cosClient,sdk,object,bucket)
    verified++
   }
  }
 }catch{throw Error('cos_restore_stopped_verify_destination_before_retry')}
 finally{if(!client)cosClient.destroy?.()}
 return {...preview,writePerformed:true,verifiedObjects:verified,
  note:'Every attempted object was read back and SHA256 verified; separately verify DB references, COS bucket access policy and full source coverage.'}
}
async function main(){
 const args=process.argv.slice(2),apply=args[0]==='--apply'
 const inputs=apply?args.slice(1):args
 if(!inputs[0]||inputs.length<2)throw Error('usage_map_json_then_backup_folders')
 if(args.some((x,i)=>x==='--apply'&&i!==0))throw Error('invalid_restore_arguments')
 const route=JSON.parse(await readFile(inputs[0],'utf8'))
 const out=await restoreCosSnapshots({folders:inputs.slice(1),route,env:process.env,apply})
 console.log(JSON.stringify(out,null,2))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error('COS_RESTORE_FAILED_CHECK_PRIVATE_OPERATOR_LOGS');process.exitCode=1})
}
