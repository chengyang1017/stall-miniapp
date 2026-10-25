import { randomUUID,createHash } from 'node:crypto'
import { authenticate,permittedStore } from './auth.mjs'
import { pageScope,pageQuery,pageResult,cursorTime } from './customerPagination.mjs'
import { reviewPolicy,reviewError as fail,reviewPurchase,inspectReviewContent } from './reviewPolicy.mjs'
import { issueReviewImage,completeReviewImage,checkReviewImages,signedReviewImage,verifySealedImage,expireUnboundReviewImage } from './reviewImages.mjs'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const publicValid=`r.withdrawn_at IS NULL AND r.moderation_status<>'hidden' AND p.moderation_status='approved'`
const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value))}
const fingerprint=b=>createHash('sha256').update(JSON.stringify(b)).digest('hex')
async function read(req){let n=0,parts=[];for await(const c of req){n+=c.length;if(n>8192)fail(413,'body_too_large');parts.push(c)}try{const b=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'invalid_body');return b}catch(e){if(e.status)throw e;fail(400,'invalid_json')}}
function fields(b,allowed){if(Object.keys(b).some(k=>!allowed.includes(k)))fail(400,'invalid_fields')}
function text(v,optional=false){if(typeof v!=='string'||[...v].length>500||!optional&&!v.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))fail(400,'invalid_text');return v.trim()}
function key(v){if(typeof v!=='string'||!uuid.test(v))fail(400,'invalid_id');return v}
async function moderator(db,subject){return !!subject&&(await db.query('SELECT 1 FROM product_review_moderators WHERE external_subject=$1',[subject])).rows.length>0}
async function event(db,r,subject,action,reason,revision=null){await db.query('INSERT INTO product_review_moderation_events(store_id,review_id,revision_id,actor_subject,action,reason) VALUES($1,$2,$3,$4,$5,$6)',[r.store_id,r.id,revision,subject,action,reason])}
async function rate(db,subject){await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['review-write:'+subject]);const n=(await db.query("SELECT count(*)::int AS n FROM product_review_revisions WHERE actor_subject=$1 AND created_at>clock_timestamp()-interval '1 day'",[subject])).rows[0].n;if(n>=reviewPolicy.maxRevisionsPerDay)fail(429,'review_daily_limit')}
async function duplicate(db,store,subject,clientKey,fp){const v=(await db.query('SELECT review_id,fingerprint FROM product_review_revisions WHERE store_id=$1 AND actor_subject=$2 AND client_key=$3',[store,subject,clientKey])).rows[0];if(v&&v.fingerprint!==fp)fail(409,'idempotency_payload_changed');return v}
function queryPage(params,scope,extra=[]){let p;try{p=pageQuery(params,['limit','cursor',...extra],10,scope)}catch(e){fail(400,e.message)}if(p.limit>reviewPolicy.maxPage)fail(400,'page_size_limit');return p}
function filters(q){const rating=q.get('rating')||'',product=q.get('productId')||'',status=q.get('status')||'',low=q.get('low')||'';if(rating&&!/^[1-5]$/.test(rating)||product&&!uuid.test(product)||status&&!['pending','approved','rejected','hidden'].includes(status)||low&&low!=='1')fail(400,'invalid_review_filter');return {rating:Number(rating)||null,product:product||null,status:status||null,low:low==='1'}}
async function listing(db,store,subject,mode,q,productId=null){
 const f=filters(q),scope=pageScope(['reviews',store,mode,subject||'',productId,f]),page=queryPage(q,scope,mode==='public'?['rating']:['rating','productId','status','low'])
 const privateView=mode!=='public',v=privateView?'c':'p'
 const rows=(await db.query(`SELECT ${cursorTime('r')} AS "cursorTime",r.id,r.product_id AS "productId",r.product_name AS "productName",r.created_at AS "createdAt",
 ${v}.rating,${v}.content,${v}.image_ids AS "imageIds",${v}.moderated_at AS "publishedAt",pp.content AS reply,pp.id AS "publicReplyRevisionId",
 ${privateView?`r.order_item_id AS "orderItemId",r.version,r.moderation_status AS "moderationStatus",r.withdrawn_at AS "withdrawnAt",r.current_revision_id AS "revisionId",r.edit_count AS "editCount",r.created_at>clock_timestamp()-interval '1 day'*$10 AND r.edit_count<$11 AND r.withdrawn_at IS NULL AS "canEdit",c.safety_result AS "safetyResult",rp.version AS "replyVersion",rp.current_revision_id AS "replyRevisionId",rc.content AS "replyDraft",rc.moderation_status AS "replyStatus",p.rating AS "publicRating",p.content AS "publicContent",` : 'p.id AS "revisionId",'}
 true AS "verifiedPurchase"
 FROM product_reviews r JOIN product_review_revisions c ON c.id=r.current_revision_id
 LEFT JOIN product_review_revisions p ON p.id=r.published_revision_id
 LEFT JOIN product_review_replies rp ON rp.review_id=r.id LEFT JOIN product_review_revisions pp ON pp.id=rp.published_revision_id AND pp.moderation_status='approved'
 LEFT JOIN product_review_revisions rc ON rc.id=rp.current_revision_id
 WHERE r.store_id=$1 AND ($2::text<>'mine' OR r.customer_subject=$3) AND ($2::text<>'public' OR (${publicValid}))
 AND ($4::uuid IS NULL OR r.product_id=$4) AND ($5::int IS NULL OR ${v}.rating=$5)
 AND ${f.low?`${v}.rating<=2`:'true'}
 AND ($6::text IS NULL OR r.moderation_status=$6 OR rc.moderation_status=$6)
 AND ($7::timestamptz IS NULL OR (r.created_at,r.id)<($7,$8::uuid)) ORDER BY r.created_at DESC,r.id DESC LIMIT $9`,[store,mode,subject||'',productId||f.product,f.rating,f.status,page.anchor?.[1]??null,page.anchor?.[2]??null,page.limit+1,...privateView?[reviewPolicy.editWindowDays,reviewPolicy.maxCustomerEdits]:[]])).rows
 return {...pageResult(rows,page.limit,scope),policy:{editWindowDays:reviewPolicy.editWindowDays,maxEdits:reviewPolicy.maxCustomerEdits}}
}
async function summary(db,store,productId=null,privateView=false){
 const rows=(await db.query(`SELECT p.rating,count(*)::int AS n FROM product_reviews r JOIN product_review_revisions p ON p.id=r.published_revision_id WHERE r.store_id=$1 AND ($2::uuid IS NULL OR r.product_id=$2) AND ${publicValid} GROUP BY p.rating`,[store,productId])).rows
 const distribution=[1,2,3,4,5].map(rating=>({rating,count:rows.find(r=>r.rating===rating)?.n||0})),count=distribution.reduce((a,b)=>a+b.count,0),total=distribution.reduce((a,b)=>a+b.rating*b.count,0)
 const states=privateView?(await db.query('SELECT moderation_status AS status,count(*)::int AS count FROM product_reviews WHERE store_id=$1 AND ($2::uuid IS NULL OR product_id=$2) GROUP BY moderation_status',[store,productId])).rows:undefined
 return {count,average:count?Number((total/count).toFixed(2)):null,distribution,...states?{states}:{}}
}
export async function productReviewRoute(req,res,url,pool){
 const m=/^\/v1\/(?:(merchant|platform)\/)?stores\/([a-z0-9][a-z0-9-]{1,62})\/(reviews(?:\/.*)?|review-images(?:\/.*)?|products\/[0-9a-f-]{36}\/reviews(?:\/summary)?)$/.exec(url.pathname)
 if(!m)return false
 let db
 try{
  if(!['GET','POST','PATCH'].includes(req.method))fail(405,'method_not_allowed')
  const subject=await authenticate(pool,req),role=m[1]||'customer',tail=m[3],q=url.searchParams
  const store=(await pool.query('SELECT id,is_active FROM stores WHERE slug=$1',[m[2]])).rows[0];if(!store)fail(404,'store_not_found')
  const isModerator=await moderator(pool,subject)
  let member=null
  if(role==='platform'){if(!subject)fail(401,'login_required');if(!isModerator)fail(403,'platform_review_role_required')}
  if(role==='merchant'){if(!subject)fail(401,'login_required');member=await permittedStore(pool,subject,m[2]);if(!member||!['owner','manager'].includes(member.role))fail(403,'forbidden')}
  const product=/^products\/([0-9a-f-]{36})\/reviews(\/summary)?$/.exec(tail)
  if(product){
   if(role!=='customer'||req.method!=='GET')fail(405,'method_not_allowed');key(product[1])
   if(!store.is_active)fail(404,'store_not_found')
   if(product[2]){if(q.size)fail(400,'invalid_summary_query');send(res,200,await summary(pool,store.id,product[1]));return true}
   send(res,200,await listing(pool,store.id,null,'public',q,product[1]));return true
  }
  if(!subject&&!(role==='customer'&&req.method==='GET'&&/^review-images\/[0-9a-f-]{36}$/.test(tail)))fail(401,'login_required')
  const b=req.method==='GET'?{}:await read(req)
  if(req.method!=='GET'&&q.size)fail(400,'unexpected_query')
  if(role==='platform'&&/^review-images\/[0-9a-f-]{36}\/expire$/.test(tail)&&req.method==='POST'){
   fields(b,['confirm']);if(b.confirm!==true)fail(400,'explicit_cleanup_confirmation_required');send(res,200,await expireUnboundReviewImage(pool,store.id,subject,key(tail.split('/')[1])));return true
  }
  db=await pool.connect();await db.query('BEGIN')
  if(req.method==='GET'&&tail==='reviews/eligibility'&&role==='customer'){
   if([...q.keys()].some(k=>k!=='orderItemId')||q.getAll('orderItemId').length!==1)fail(400,'invalid_eligibility_query')
   const purchase=await reviewPurchase(db,store.id,subject,key(q.get('orderItemId')))
   const existing=(await db.query('SELECT id FROM product_reviews WHERE order_item_id=$1',[purchase.order.item_id])).rows[0]
   await db.query('COMMIT');send(res,200,{eligible:purchase.eligible&&!existing,reason:existing?'该订单商品已有评价，请到我的评价查看或修改':purchase.reason,productName:purchase.order.product_name,existingReviewId:existing?.id||null,policy:{editWindowDays:reviewPolicy.editWindowDays,maxEdits:reviewPolicy.maxCustomerEdits}});return true
  }
  if(req.method==='GET'&&(tail==='reviews/mine'&&role==='customer'||tail==='reviews'&&role!=='customer')){
   await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
   const result=await listing(db,store.id,subject,role==='customer'?'mine':role,q)
   const stats=role==='merchant'?await summary(db,store.id,filters(q).product,true):null
   await db.query('COMMIT');send(res,200,{...result,...stats?{summary:stats}:{}});return true
  }
  if(req.method==='GET'&&role==='platform'&&['reviews/reports','review-images/orphans'].includes(tail)){
   const reportState=tail==='reviews/reports'?(q.get('status')||'open'):null
   if(reportState&&!['open','resolved','dismissed'].includes(reportState))fail(400,'invalid_report_status')
   const scope=pageScope([store.id,tail,subject,reportState]),page=queryPage(q,scope,reportState?['status']:[])
   const table=tail==='reviews/reports'?'product_review_reports':'product_review_images'
   const rows=(await db.query(`SELECT ${cursorTime('x')} AS "cursorTime",x.id,${tail==='reviews/reports'?'review_id AS "reviewId",revision_id AS "revisionId",reason,status,resolution,resolved_at AS "resolvedAt"':'upload_state AS "uploadState",created_at AS "createdAt"'} FROM ${table} x WHERE store_id=$1 AND ${tail==='reviews/reports'?"status=$5":"bound_review_id IS NULL AND upload_state<>'deleted' AND created_at<clock_timestamp()-interval '1 day'*$5"} AND ($2::timestamptz IS NULL OR (created_at,id)<($2,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,[store.id,page.anchor?.[1]??null,page.anchor?.[2]??null,page.limit+1,reportState||reviewPolicy.unboundImageDays])).rows
   await db.query('COMMIT');send(res,200,pageResult(rows,page.limit,scope));return true
  }
  const history=/^reviews\/([0-9a-f-]{36})\/revisions$/.exec(tail)
  if(req.method==='GET'&&role==='platform'&&history){
   const id=key(history[1]),scope=pageScope([store.id,id,'revision-history',subject]),page=queryPage(q,scope)
   if(!(await db.query('SELECT 1 FROM product_reviews WHERE store_id=$1 AND id=$2',[store.id,id])).rows.length)fail(404,'review_not_found')
   const rows=(await db.query(`SELECT ${cursorTime('v')} AS "cursorTime",v.id,kind,rating,content,image_ids AS "imageIds",moderation_status AS "moderationStatus",safety_result AS "safetyResult",created_at AS "createdAt",moderated_at AS "moderatedAt" FROM product_review_revisions v WHERE store_id=$1 AND review_id=$2 AND ($3::timestamptz IS NULL OR (created_at,id)<($3,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT $5`,[store.id,id,page.anchor?.[1]??null,page.anchor?.[2]??null,page.limit+1])).rows
   await db.query('COMMIT');send(res,200,pageResult(rows,page.limit,scope));return true
  }
  const image=/^review-images\/([0-9a-f-]{36})(\/complete)?$/.exec(tail)
  if(image&&req.method==='GET'&&!image[2]){
   if(q.size)fail(400,'invalid_image_query')
   const row=(await db.query('SELECT * FROM product_review_images WHERE store_id=$1 AND id=$2 AND upload_state=$3',[store.id,key(image[1]),'verified'])).rows[0]
   if(!row)fail(404,'image_not_found')
   const pub=store.is_active&&row.bound_review_id&&(await db.query(`SELECT 1 FROM product_reviews r JOIN product_review_revisions p ON p.id=r.published_revision_id WHERE r.id=$1 AND r.store_id=$3 AND ${publicValid} AND $2::uuid=ANY(p.image_ids)`,[row.bound_review_id,row.id,store.id])).rows.length
   if(!pub&&row.customer_subject!==subject&&!isModerator&&!(member&&row.bound_review_id))fail(403,'private_review_image')
   const result=await signedReviewImage(row);await db.query('COMMIT');send(res,200,result);return true
  }
  if(role==='customer'&&req.method==='POST'&&(tail==='review-images'||image?.[2])){
   let result
   if(image){fields(b,[]);result=await completeReviewImage(db,store.id,subject,key(image[1]))}
   else{fields(b,['orderItemId','clientKey','contentType','sizeBytes']);key(b.orderItemId);key(b.clientKey);result=await issueReviewImage(db,store.id,subject,b)}
   await db.query('COMMIT');send(res,200,result);return true
  }
  const item=/^reviews\/([0-9a-f-]{36})(?:\/(withdraw|report|reply|moderate))?$/.exec(tail)
  if(role==='customer'&&tail==='reviews'&&req.method==='POST'||item&&!item[2]&&role==='customer'&&['PATCH','POST'].includes(req.method)||item?.[2]==='reply'&&role==='merchant'&&['POST','PATCH'].includes(req.method)){
   const kind=item?.[2]==='reply'?'reply':'review',create=!item
   fields(b,kind==='reply'?['content','clientKey','expectedVersion']:create?['orderItemId','rating','content','imageIds','clientKey']:['rating','content','imageIds','clientKey','expectedVersion'])
   key(b.clientKey);if(create)key(b.orderItemId)
   const content=text(b.content,kind==='review'),rating=kind==='review'?b.rating:null,ids=kind==='review'?b.imageIds:[]
   if(kind==='review'&&(!Number.isInteger(rating)||rating<1||rating>5||!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!uuid.test(id))))fail(400,'invalid_rating_or_images')
   const fp=fingerprint({kind,reviewId:item?.[1]||null,orderItemId:b.orderItemId||null,rating,content,ids,expectedVersion:b.expectedVersion??null})
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['review-write:'+subject])
   const previous=await duplicate(db,store.id,subject,b.clientKey,fp)
   if(previous){await db.query('COMMIT');send(res,200,{reviewId:previous.review_id,reused:true});return true}
   await rate(db,subject)
   let r
   if(create){
    const purchase=await reviewPurchase(db,store.id,subject,b.orderItemId);if(!purchase.eligible)fail(409,purchase.reason)
    if((await db.query('SELECT 1 FROM product_reviews WHERE order_item_id=$1',[b.orderItemId])).rows.length)fail(409,'order_item_already_reviewed')
    const o=purchase.order;r=(await db.query('INSERT INTO product_reviews(store_id,product_id,product_name,order_id,order_item_id,customer_subject,purchase_receipt_ref) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[store.id,o.product_id,o.product_name,o.id,o.item_id,subject,purchase.receiptRef])).rows[0]
   }else{
    r=(await db.query('SELECT *,clock_timestamp() AS server_now FROM product_reviews WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,key(item[1])])).rows[0];if(!r)fail(404,'review_not_found')
    if(r.withdrawn_at)fail(409,'review_withdrawn')
    if(kind==='review'){
     if(r.customer_subject!==subject)fail(403,'forbidden')
     if(!Number.isInteger(b.expectedVersion)||b.expectedVersion!==r.version)fail(409,'review_changed_refresh')
     if(r.edit_count>=reviewPolicy.maxCustomerEdits||new Date(r.server_now)-new Date(r.created_at)>reviewPolicy.editWindowDays*86400000)fail(409,'review_edit_window_closed')
    }else{
     const rp=(await db.query('SELECT * FROM product_review_replies WHERE review_id=$1',[r.id])).rows[0]
     if(!Number.isInteger(b.expectedVersion)||b.expectedVersion!==(rp?.version||0))fail(409,'reply_changed_refresh')
    }
   }
   if(kind==='review')await checkReviewImages(db,store.id,subject,r.order_item_id,ids,r.id)
   const safety=await inspectReviewContent({kind,content,rating,imageIds:ids,storeId:store.id,reviewId:r.id})
   const revision=(await db.query(`INSERT INTO product_review_revisions(store_id,review_id,kind,actor_subject,client_key,fingerprint,rating,content,image_ids,safety_result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING id`,[store.id,r.id,kind,subject,b.clientKey,fp,rating,content,ids,JSON.stringify(safety)])).rows[0]
   if(kind==='review'){
    await db.query("UPDATE product_reviews SET current_revision_id=$2,moderation_status=CASE WHEN moderation_status='hidden' THEN 'hidden' ELSE 'pending' END,edit_count=edit_count+$3,version=version+1,updated_at=clock_timestamp() WHERE id=$1",[r.id,revision.id,create?0:1])
    if(ids.length)await db.query('UPDATE product_review_images SET bound_review_id=$1 WHERE id=ANY($2::uuid[])',[r.id,ids])
   }else{
    await db.query('INSERT INTO product_review_replies(store_id,review_id,current_revision_id) VALUES($1,$2,$3) ON CONFLICT(review_id) DO UPDATE SET current_revision_id=$3,version=product_review_replies.version+1',[store.id,r.id,revision.id]);await db.query('UPDATE product_reviews SET version=version+1,updated_at=clock_timestamp() WHERE id=$1',[r.id])
   }
   await event(db,r,subject,create?'create':kind==='reply'?'reply_revision':'customer_revision','submitted_pending',revision.id)
   await db.query('COMMIT');send(res,200,{reviewId:r.id,revisionId:revision.id,moderationStatus:'pending'});return true
  }
  if(item&&req.method==='POST'){
   const r=(await db.query('SELECT * FROM product_reviews WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,key(item[1])])).rows[0];if(!r)fail(404,'review_not_found')
   if(item[2]==='withdraw'&&role==='customer'){
    fields(b,[]);if(r.customer_subject!==subject)fail(403,'forbidden')
    if(!r.withdrawn_at){await db.query('UPDATE product_reviews SET withdrawn_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE id=$1',[r.id]);await event(db,r,subject,'withdraw','customer_withdrawal')}
   }else if(item[2]==='report'&&role!=='platform'){
    fields(b,['reason','revisionId']);const reason=text(b.reason),revision=key(b.revisionId)
    const pub=(await db.query('SELECT id,moderation_status FROM product_review_revisions WHERE review_id=$1 AND id=$2',[r.id,revision])).rows[0]
    const replyPublic=(await db.query('SELECT published_revision_id FROM product_review_replies WHERE review_id=$1',[r.id])).rows[0]?.published_revision_id
    if(!pub||role==='customer'&&(pub.moderation_status!=='approved'||r.published_revision_id!==revision&&replyPublic!==revision||r.withdrawn_at||r.moderation_status==='hidden'))fail(404,'report_target_not_visible')
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['review-report:'+subject])
    const existing=(await db.query('SELECT reason FROM product_review_reports WHERE review_id=$1 AND revision_id=$2 AND reporter_subject=$3',[r.id,revision,subject])).rows[0]
    if(existing&&existing.reason!==reason)fail(409,'report_already_submitted_original_reason_retained')
    if(!existing){const n=(await db.query("SELECT count(*)::int AS n FROM product_review_reports WHERE reporter_subject=$1 AND created_at>clock_timestamp()-interval '1 day'",[subject])).rows[0].n;if(n>=20)fail(429,'report_limit');await db.query('INSERT INTO product_review_reports(store_id,review_id,revision_id,reporter_subject,reason) VALUES($1,$2,$3,$4,$5)',[store.id,r.id,revision,subject,reason])}
   }else if(item[2]==='moderate'&&role==='platform'){
    if(await permittedStore(db,subject,m[2]))fail(403,'cannot_moderate_own_store')
    fields(b,['revisionId','decision','reason','expectedVersion']);const reason=text(b.reason),decision=b.decision
    if(!['approved','rejected','hidden'].includes(decision)||b.expectedVersion!==r.version)fail(409,'moderation_changed_refresh')
    const v=(await db.query('SELECT * FROM product_review_revisions WHERE review_id=$1 AND id=$2 FOR UPDATE',[r.id,key(b.revisionId)])).rows[0];if(!v)fail(404,'revision_not_found')
    const rp=(await db.query('SELECT * FROM product_review_replies WHERE review_id=$1',[r.id])).rows[0]
    if(v.id!==(v.kind==='review'?r.current_revision_id:rp?.current_revision_id))fail(409,'revision_changed_refresh')
    if(v.actor_subject===subject)fail(403,'cannot_moderate_own_content')
    if(decision==='approved'){
     const images=(await db.query('SELECT * FROM product_review_images WHERE id=ANY($1::uuid[])',[v.image_ids])).rows
     if(images.length!==v.image_ids.length)fail(409,'moderation_images_missing')
     for(const image of images){if(image.store_id!==r.store_id||image.bound_review_id!==r.id||image.upload_state!=='verified')fail(409,'moderation_image_reference_invalid');await verifySealedImage(image)}
    }
    await db.query('UPDATE product_review_revisions SET moderation_status=$2,moderated_at=clock_timestamp() WHERE id=$1',[v.id,decision])
    if(v.kind==='review')await db.query('UPDATE product_reviews SET moderation_status=$2,published_revision_id=CASE WHEN $2=$4 THEN $3::uuid ELSE published_revision_id END,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[r.id,decision,v.id,'approved'])
    else{await db.query('UPDATE product_review_replies SET published_revision_id=CASE WHEN $2=$4 THEN $3::uuid WHEN $2=$5 THEN NULL ELSE published_revision_id END,version=version+1 WHERE review_id=$1',[r.id,decision,v.id,'approved','hidden']);await db.query('UPDATE product_reviews SET version=version+1 WHERE id=$1',[r.id])}
    await event(db,r,subject,'manual_'+decision,reason,v.id)
   }else fail(405,'method_not_allowed')
   await db.query('COMMIT');send(res,200,{ok:true});return true
  }
  const report=/^reviews\/reports\/([0-9a-f-]{36})\/resolve$/.exec(tail)
  if(role==='platform'&&report&&req.method==='POST'){
   if(await permittedStore(db,subject,m[2]))fail(403,'cannot_resolve_own_store_report')
   fields(b,['status','reason']);if(!['resolved','dismissed'].includes(b.status))fail(400,'invalid_resolution')
   const reason=text(b.reason),row=(await db.query('UPDATE product_review_reports SET status=$3,resolution=$4,resolved_at=clock_timestamp() WHERE store_id=$1 AND id=$2 AND status=$5 RETURNING review_id,revision_id',[store.id,key(report[1]),b.status,reason,'open'])).rows[0]
   if(!row)fail(409,'report_already_handled');await event(db,{id:row.review_id,store_id:store.id},subject,'report_'+b.status,reason,row.revision_id)
   await db.query('COMMIT');send(res,200,{ok:true});return true
  }
  fail(405,'method_not_allowed')
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});if(e.status||e.code==='23505'){send(res,e.status||409,{error:e.status?e.message:'review_or_request_already_exists'});return true}throw e}finally{db?.release()}
}
