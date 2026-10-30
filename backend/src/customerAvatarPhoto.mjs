import {PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3'
import {imageStorageClient} from './imageLifecycle.mjs'
import {authenticate} from './auth.mjs'
const MAX=512*1024
const respond=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(obj))}
function imageKind(buffer){
 if(buffer.length>=4&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff&&buffer[buffer.length-2]===0xff&&buffer[buffer.length-1]===0xd9)return 'image/jpeg'
 if(buffer.length>=24&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&buffer.toString('ascii',12,16)==='IHDR')return 'image/png'
 return null
}
export async function customerAvatarPhotoRoute(req,res,url,pool){
 if(url.pathname!=='/v1/customer/avatar-photo'||!['GET','PUT','DELETE'].includes(req.method))return false
 if(process.env.PAYMENT_DB_ENV!=='isolated-test'||process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED!=='true') {respond(res,404,{error:'not_found'});return true}
 const subject=await authenticate(pool,req)
 if(!subject){respond(res,401,{error:'unauthorized'});return true}
 const found=await pool.query("SELECT a.id,a.avatar_photo_key FROM customer_accounts a JOIN customer_login_identities i ON i.account_id=a.id WHERE i.provider='wechat' AND i.provider_subject=$1",[subject])
 const account=found.rows[0]
 if(!account){respond(res,404,{error:'profile_not_found'});return true}
 const bucket=process.env.S3_AVATAR_BUCKET
 const client=bucket?imageStorageClient():null
 if(!client){respond(res,503,{error:'private_avatar_storage_not_configured'});return true}
 if(req.method==='DELETE'){
  await pool.query('UPDATE customer_accounts SET avatar_photo_key=NULL,updated_at=now() WHERE id=$1',[account.id])
  respond(res,200,{ok:true});return true
 }
 if(req.method==='GET'){
  if(!account.avatar_photo_key){respond(res,404,{error:'no_avatar_photo'});return true}
  try{
   const result=await client.send(new GetObjectCommand({Bucket:bucket,Key:account.avatar_photo_key}),{abortSignal:AbortSignal.timeout(9000)})
   const bytes=Buffer.from(await result.Body.transformToByteArray())
   if(bytes.length>MAX||!imageKind(bytes)){respond(res,502,{error:'stored_avatar_invalid'});return true}
   respond(res,200,{mimeType:imageKind(bytes),dataBase64:bytes.toString('base64')});return true
  }catch(_){respond(res,503,{error:'avatar_read_unavailable'});return true}
 }
 let raw='',size=0
 for await(const chunk of req){size+=chunk.length;if(size>750000){respond(res,413,{error:'too_large'});return true}raw+=chunk.toString('utf8')}
 let input
 try{input=JSON.parse(raw)}catch(_){respond(res,400,{error:'invalid_json'});return true}
 if(!input||typeof input.dataBase64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.dataBase64)){respond(res,400,{error:'invalid_image'});return true}
 const bytes=Buffer.from(input.dataBase64,'base64')
 const kind=imageKind(bytes)
 if(!kind||bytes.length<100||bytes.length>MAX){respond(res,400,{error:'invalid_image'});return true}
 const extension=kind==='image/jpeg'?'jpg':'png'
 const key='customer-avatars/'+account.id+'/'+Date.now()+'-'+Math.random().toString(16).slice(2,14)+'.'+extension
 try{
  await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:kind,CacheControl:'private, no-store'}),{abortSignal:AbortSignal.timeout(12000)})
  await pool.query('UPDATE customer_accounts SET avatar_photo_key=$1,updated_at=now() WHERE id=$2',[key,account.id])
  respond(res,200,{ok:true})
 }catch(_){respond(res,503,{error:'avatar_storage_unavailable'})}
 return true
}
