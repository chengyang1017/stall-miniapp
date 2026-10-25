import { authenticate,permittedStore } from './auth.mjs'
import { ListObjectsV2Command,DeleteObjectCommand } from '@aws-sdk/client-s3'
import { PRODUCT_KEY,imageStorageClient,headImage,imageReferences,candidateReason } from './imageLifecycle.mjs'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const fail=(code,status=400)=>{throw Object.assign(Error(code),{status})}
const reply=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
async function read(req){let n=0,parts=[];for await(const c of req){n+=c.length;if(n>4096)fail('body_too_large',413);parts.push(c)}try{const v=JSON.parse(Buffer.concat(parts).toString());if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v}catch{fail('invalid_json')}}
const operator=subject=>(process.env.IMAGE_CLEANUP_OPERATOR_SUBJECTS||'').split(',').map(s=>s.trim()).filter(Boolean).includes(subject)
async function audit(db,store,subject,action,result,plan=null,image=null){await db.query('INSERT INTO image_cleanup_audit(store_id,actor_subject,action,result,plan_id,image_id) VALUES($1,$2,$3,$4,$5,$6)',[store,subject,action,result,plan,image])}
async function throttle(db,store,subject,action){
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['images:'+store+':'+action])
 const n=(await db.query("SELECT count(*)::int AS n FROM image_cleanup_audit WHERE store_id=$1 AND action=$2 AND result='requested' AND created_at>clock_timestamp()-interval '1 hour'",[store,action])).rows[0].n
 if(n>=30)fail('image_request_rate_limited',429)
 await audit(db,store,subject,action,'requested')
}
async function inspect(db,store,image){
 const refs=await imageReferences(db,store,image.object_key),h=await headImage(image.object_key,image.storage_bucket||process.env.S3_BUCKET)
 const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now.getTime(),reason=candidateReason(image,refs,h,now)
 const state=h.state==='missing'?'missing':h.state==='exists'&&h.bytes>0&&h.bytes<=5*1024*1024&&['image/jpeg','image/png','image/webp'].includes(h.contentType)&&(image.expected_bytes==null||image.expected_bytes===h.bytes)?'verified':'unknown'
 await db.query(`UPDATE stored_images SET candidate_reason=$3,candidate_identified_at=clock_timestamp(),last_checked_at=clock_timestamp(),etag=CASE WHEN $4::text IS NOT NULL THEN $4 ELSE etag END,actual_bytes=coalesce($5,actual_bytes),object_modified_at=coalesce($6,object_modified_at),upload_state=CASE WHEN upload_state IN ('deleting','deleted') THEN upload_state ELSE $7 END WHERE store_id=$1 AND id=$2`,[store,image.id,reason,h.etag||null,h.bytes??null,h.modifiedAt||null,state])
 return {id:image.id,key:image.object_key,references:refs,objectState:h.state,reason,eligible:reason==='unassociated_upload_after_grace',etag:h.etag||null}
}
export async function imageManagementRoute(req,res,url,pool){
 const m=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/(images(?:\/(scan|check|[0-9a-f-]{36})(?:\/(references))?)?|image-cleanup\/plans(?:\/([0-9a-f-]{36})(?:\/(approve|execute))?)?)$/.exec(url.pathname)
 if(!m)return false
 let db
 try{
  const subject=await authenticate(pool,req);if(!subject)fail('login_required',401)
  const store=await permittedStore(pool,subject,m[1]);if(!store)fail('forbidden',403)
  const images=m[2].startsWith('images'),id=images?m[3]:m[5],action=images?m[4]:m[6]
  if(id&&!['scan','check'].includes(id)&&!uuid.test(id))fail('invalid_identifier')
  if((images?req.method==='POST':true)&&store.role!=='owner')fail('owner_required',403)
  if(images&&req.method==='GET'&&!['owner','manager'].includes(store.role))fail('forbidden',403)
  const q=url.searchParams
  if([...q.keys()].some(k=>!['before'].includes(k)||q.getAll(k).length!==1)||req.method!=='GET'&&url.search||action&&req.method==='GET'&&action!=='references')fail('invalid_query')
  const body=req.method==='POST'?await read(req):{}
  db=await pool.connect()
  if(images&&req.method==='GET'&&id&&action==='references'){
   if(!uuid.test(id)||url.search)fail('invalid_image')
   const img=(await db.query("SELECT id,object_key,kind,upload_state,source,ever_referenced,retention_hold,protect_until,last_checked_at FROM stored_images WHERE store_id=$1 AND id=$2 AND kind='product'",[store.id,id])).rows[0];if(!img)fail('image_not_found',404)
   reply(res,200,{image:img,references:await imageReferences(db,store.id,img.object_key),note:'历史、归档及备份引用永久保留；不读取或删除凭证。'});return true
  }
  if(images&&req.method==='GET'&&!id){
   const before=q.get('before');if(before&&!uuid.test(before))fail('invalid_cursor')
   const rows=(await db.query(`SELECT id,object_key,upload_state,source,created_at,protect_until,last_checked_at,ever_referenced,retention_hold,candidate_reason,candidate_identified_at FROM stored_images WHERE store_id=$1 AND kind='product' AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 21`,[store.id,before||null])).rows
   reply(res,200,{images:rows.slice(0,20),hasMore:rows.length>20,nextCursor:rows.length>20?rows[19].id:null});return true
  }
  if(images&&req.method==='POST'&&id==='scan'){
   if(Object.keys(body).some(k=>k!=='cursor')||body.cursor!==undefined&&(typeof body.cursor!=='string'||body.cursor.length>2048))fail('invalid_scan')
   const s3=imageStorageClient(),bucket=process.env.S3_BUCKET;if(!s3||!bucket)fail('storage_not_configured',503)
   await db.query('BEGIN');await throttle(db,store.id,subject,'scan');await db.query('COMMIT')
   const result=await s3.send(new ListObjectsV2Command({Bucket:bucket,Prefix:`stores/${store.id}/products/`,MaxKeys:20,ContinuationToken:body.cursor||undefined}),{abortSignal:AbortSignal.timeout(10000)})
   const checked=[]
   const discovered=[]
   for(const obj of result.Contents||[]){if(!PRODUCT_KEY.test(obj.Key||'')||!obj.Key.startsWith(`stores/${store.id}/products/`))continue
    await db.query(`INSERT INTO stored_images(store_id,object_key,kind,source,upload_state,storage_bucket,retention_hold) VALUES($1,$2,'product','discovered','unknown',$3,true) ON CONFLICT(object_key) DO NOTHING`,[store.id,obj.Key,bucket])
    const image=(await db.query('SELECT * FROM stored_images WHERE store_id=$1 AND object_key=$2',[store.id,obj.Key])).rows[0]
    if(image)discovered.push(image)
   }
   for(let start=0;start<discovered.length;start+=4)checked.push(...await Promise.all(discovered.slice(start,start+4).map(image=>inspect(db,store.id,image))))
   reply(res,200,{checked,nextCursor:result.IsTruncated?result.NextContinuationToken||null:null,hasMore:!!result.IsTruncated,note:'只识别和记录，不删除；旧对象历史不明时永久保护。'});return true
  }
  if(images&&req.method==='POST'&&id==='check'){
   if(Object.keys(body).some(k=>k!=='ids')||!Array.isArray(body.ids)||!body.ids.length||body.ids.length>20||new Set(body.ids).size!==body.ids.length||!body.ids.every(v=>typeof v==='string'&&uuid.test(v)))fail('invalid_image_ids')
   await db.query('BEGIN');await throttle(db,store.id,subject,'check');await db.query('COMMIT')
   const checked=[]
   const images=(await db.query("SELECT * FROM stored_images WHERE store_id=$1 AND id=ANY($2::uuid[]) AND kind='product' ORDER BY id",[store.id,body.ids])).rows
   if(images.length!==body.ids.length)fail('image_not_found',404)
   for(let start=0;start<images.length;start+=4)checked.push(...await Promise.all(images.slice(start,start+4).map(image=>inspect(db,store.id,image))))
   reply(res,200,{checked});return true
  }
  if(!images&&req.method==='GET'){
   if(url.search)fail('invalid_query')
   const plans=(await db.query('SELECT id,status,created_at,expires_at,created_by= $2 AS "createdByMe",approved_by IS NOT NULL AS approved FROM image_cleanup_plans WHERE store_id=$1 AND ($3::uuid IS NULL OR id=$3) ORDER BY created_at DESC,id DESC LIMIT 20',[store.id,subject,id||null])).rows
   if(id&&!plans.length)fail('plan_not_found',404)
   const items=id?(await db.query('SELECT i.image_id,i.expected_etag,i.identified_at,i.reason,i.result,i.completed_at FROM image_cleanup_items i JOIN image_cleanup_plans p ON p.id=i.plan_id WHERE p.store_id=$1 AND p.id=$2 ORDER BY i.image_id',[store.id,id])).rows:[]
   reply(res,200,{plans,items,merchantDeletionAvailable:false,note:'商家端没有执行删除入口；平台删除还须独立审批与运维开关。'});return true
  }
  if(!images&&req.method==='POST'&&!id){
   if(Object.keys(body).some(k=>!['ids','clientKey'].includes(k))||!uuid.test(body.clientKey||'')||!Array.isArray(body.ids)||!body.ids.length||body.ids.length>5||new Set(body.ids).size!==body.ids.length||!body.ids.every(v=>typeof v==='string'&&uuid.test(v)))fail('invalid_plan')
   const ids=body.ids.slice().sort();await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='8s'")
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['image-plan:'+store.id])
   const previous=(await db.query('SELECT id,request_ids=$3::jsonb AS same FROM image_cleanup_plans WHERE store_id=$1 AND client_key=$2',[store.id,body.clientKey,JSON.stringify(ids)])).rows[0]
   if(previous){if(!previous.same)fail('idempotency_conflict',409);await db.query('COMMIT');reply(res,200,{planId:previous.id,reused:true});return true}
   await throttle(db,store.id,subject,'plan')
   const plan=(await db.query('INSERT INTO image_cleanup_plans(store_id,client_key,created_by,request_ids) VALUES($1,$2,$3,$4::jsonb) RETURNING id',[store.id,body.clientKey,subject,JSON.stringify(ids)])).rows[0]
   const checked=[]
   for(const imageId of ids){const img=(await db.query('SELECT * FROM stored_images WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,imageId])).rows[0];if(!img)fail('image_not_found',404)
    const c=await inspect(db,store.id,img);checked.push(c);if(c.eligible)await db.query('INSERT INTO image_cleanup_items(plan_id,image_id,expected_etag,reason) VALUES($1,$2,$3,$4)',[plan.id,img.id,c.etag,c.reason])
   }
   if(!checked.some(c=>c.eligible))fail('no_safe_candidates',409)
   await db.query('COMMIT');reply(res,200,{planId:plan.id,checked,deleted:0});return true
  }
  if(!images&&req.method==='POST'&&id&&['approve','execute'].includes(action)){
   if(!uuid.test(id)||Object.keys(body).some(k=>k!=='confirmation')||body.confirmation!==id)fail('invalid_confirmation')
   if(!operator(subject))fail('platform_operator_required',403)
   await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='8s'")
   await throttle(db,store.id,subject,action)
   const plan=(await db.query('SELECT *,expires_at>clock_timestamp() AS valid FROM image_cleanup_plans WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,id])).rows[0]
   if(!plan)fail('plan_not_found',404)
   if(!plan.valid)fail('plan_expired',409)
   if(plan.created_by===subject)fail('independent_operator_approval_required',403)
   if(action==='approve'){
    if(!['planned','approved'].includes(plan.status))fail('plan_already_started',409)
    if(plan.approved_by&&plan.approved_by!==subject)fail('approved_by_other_operator',409)
    await db.query("UPDATE image_cleanup_plans SET status='approved',approved_by=$3 WHERE store_id=$1 AND id=$2",[store.id,id,subject]);await audit(db,store.id,subject,'approve','approved',id);await db.query('COMMIT');reply(res,200,{approved:true,deleted:0});return true
   }
   if(!plan.approved_by)fail('plan_not_approved',409)
   // Disabled by default. Operators must establish conditional-delete support and backup coverage.
   if(process.env.IMAGE_CLEANUP_EXECUTION_ENABLED!=='true'||process.env.IMAGE_CONDITIONAL_DELETE_VERIFIED!=='true'||process.env.IMAGE_BACKUP_INVENTORY_CONFIRMED!=='true'){
    await audit(db,store.id,subject,'execute','blocked_by_operator_gates',id);await db.query('COMMIT');fail('cleanup_execution_disabled',423)
   }
   if(plan.status==='finished'){await db.query('COMMIT');const r=(await db.query('SELECT image_id,result FROM image_cleanup_items WHERE plan_id=$1 ORDER BY image_id',[id])).rows;reply(res,200,{results:r,reused:true});return true}
   if(plan.status==='running')fail('execution_in_progress_or_requires_review',409)
   await db.query("UPDATE image_cleanup_plans SET status='running' WHERE store_id=$1 AND id=$2",[store.id,id]);await audit(db,store.id,subject,'execute','started',id);await db.query('COMMIT')
   const items=(await db.query('SELECT * FROM image_cleanup_items WHERE plan_id=$1 ORDER BY image_id',[id])).rows,results=[]
   for(const item of items){let result='blocked_reference_or_state',quarantined=false
    try{
     await db.query('BEGIN');const img=(await db.query('SELECT * FROM stored_images WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,item.image_id])).rows[0]
     const c=img?await inspect(db,store.id,img):null
     const valid=(await db.query("SELECT id FROM image_cleanup_plans WHERE store_id=$1 AND id=$2 AND status='running' AND approved_by IS NOT NULL AND expires_at>clock_timestamp()",[store.id,id])).rows.length
     if(!valid||!img||!c?.eligible||c.etag!==item.expected_etag||img.storage_bucket!==process.env.S3_BUCKET){await db.query('ROLLBACK')}
     else{
      await db.query("UPDATE stored_images SET upload_state='deleting' WHERE store_id=$1 AND id=$2",[store.id,img.id]);await db.query("UPDATE image_cleanup_items SET result='deleting' WHERE plan_id=$1 AND image_id=$2",[id,img.id]);await db.query('COMMIT')
      quarantined=true
      // DB triggers refuse all new references while deleting. Never accepts a client object key.
      const s3=imageStorageClient();if(!s3)throw Error('storage_unavailable')
      await s3.send(new DeleteObjectCommand({Bucket:img.storage_bucket,Key:img.object_key,IfMatch:item.expected_etag}),{abortSignal:AbortSignal.timeout(6000)})
      const h=await headImage(img.object_key,img.storage_bucket)
      if(h.state!=='missing')throw Error('deletion_unconfirmed')
      await db.query("UPDATE stored_images SET upload_state='deleted',last_checked_at=clock_timestamp() WHERE store_id=$1 AND id=$2 AND upload_state='deleting'",[store.id,img.id]);result='deleted'
     }
    }catch{await db.query('ROLLBACK').catch(()=>{});result=quarantined?'uncertain_locked_requires_operator_review':'check_failed_object_retained'}
    await db.query('UPDATE image_cleanup_items SET result=$3,completed_at=clock_timestamp() WHERE plan_id=$1 AND image_id=$2',[id,item.image_id,result]);await audit(db,store.id,subject,'delete_result',result,id,item.image_id);results.push({imageId:item.image_id,result})
   }
   await db.query("UPDATE image_cleanup_plans SET status='finished' WHERE store_id=$1 AND id=$2",[store.id,id]);reply(res,200,{results,deleted:results.filter(r=>r.result==='deleted').length,notDeleted:results.filter(r=>r.result!=='deleted').length});return true
  }
  fail('method_not_allowed',405)
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});reply(res,e.status||503,{error:e.status?e.message:'image_management_unavailable'})}finally{db?.release()}
 return true
}
