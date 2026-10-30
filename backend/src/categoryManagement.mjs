import { categoryIconsSupported,validCategoryIconKey } from './categoryIcons.mjs'
import { createHash } from 'node:crypto'
export const categoryRevision=rows=>{const hasIcons=rows.some(c=>c.iconKey!=null);return createHash('sha256').update(JSON.stringify(rows.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(c=>hasIcons?[c.id,c.name,c.sortOrder,c.iconKey??null]:[c.id,c.name,c.sortOrder]))).digest('hex')}
export async function categoryWrite(req,res,pool,store,id,body,send){
 const db=await pool.connect(),fail=(code,status=400)=>{throw Object.assign(Error(code),{status})}
 let phase='begin'
 try{
  await db.query('BEGIN');phase='set_timeout';await db.query("SET LOCAL statement_timeout='5s'");phase='lock_store';await db.query('SELECT id FROM stores WHERE id=$1 FOR NO KEY UPDATE',[store.id])
  phase='icon_capability';const categoryIcons=await categoryIconsSupported(db)
  phase='read_categories';const rows=(await db.query(`SELECT id,name,sort_order AS "sortOrder",to_jsonb(categories)->>'icon_key' AS "iconKey" FROM categories WHERE store_id=$1 ORDER BY id LIMIT 1001`,[store.id])).rows
  if(rows.length>1000)fail('category_limit',413)
  if(body.expectedRevision!==undefined&&body.expectedRevision!==categoryRevision(rows))fail('categories_changed_refresh',409)
  if(id==='order'&&req.method==='PATCH'){
   if(Object.keys(body).some(k=>!['ids','expectedRevision'].includes(k))||typeof body.expectedRevision!=='string'||!Array.isArray(body.ids)||body.ids.length!==rows.length||new Set(body.ids).size!==rows.length||body.ids.some(v=>typeof v!=='string'||!rows.some(r=>r.id===v)))fail('invalid_category_order')
   phase='update_category_order';await db.query('UPDATE categories c SET sort_order=x.ordinality::integer-1 FROM unnest($2::uuid[]) WITH ORDINALITY AS x(id,ordinality) WHERE c.store_id=$1 AND c.id=x.id',[store.id,body.ids])
  }else if(req.method==='DELETE'&&id){
   if(Object.keys(body).some(k=>k!=='expectedRevision'))fail('invalid_category_delete')
   if(!(await db.query('DELETE FROM categories WHERE store_id=$1 AND id=$2',[store.id,id])).rowCount)fail('category_not_found',404)
  }else if(req.method==='POST'&&!id||req.method==='PATCH'&&id&&id!=='order'){
   if(Object.keys(body).some(k=>!['name','sortOrder','expectedRevision','iconKey'].includes(k))||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100||/[\u0000-\u001f\u007f]/.test(body.name))fail('invalid_category')
   const hasIcon=Object.hasOwn(body,'iconKey')
   if(hasIcon&&!validCategoryIconKey(body.iconKey))fail('invalid_category_icon')
   if(hasIcon&&!categoryIcons)fail('category_icons_not_available',503)
   const name=body.name.trim(),sort=body.sortOrder??rows.length
   if(!Number.isInteger(sort)||Math.abs(sort)>100000)fail('invalid_category_order')
   if(rows.some(r=>r.id!==id&&r.name===name))fail('category_name_exists',409)
   if(req.method==='POST'){if(rows.length>=1000)fail('category_limit',413);if(hasIcon)await db.query('INSERT INTO categories(store_id,name,sort_order,icon_key) VALUES($1,$2,$3,$4)',[store.id,name,sort,body.iconKey]);else await db.query('INSERT INTO categories(store_id,name,sort_order) VALUES($1,$2,$3)',[store.id,name,sort])}
   else if(!(hasIcon?await db.query('UPDATE categories SET name=$3,icon_key=$4 WHERE store_id=$1 AND id=$2',[store.id,id,name,body.iconKey]):await db.query('UPDATE categories SET name=$3 WHERE store_id=$1 AND id=$2',[store.id,id,name])).rowCount)fail('category_not_found',404)
  }else fail('method_not_allowed',405)
  phase='read_result';const result=(await db.query(`SELECT id,name,sort_order AS "sortOrder",to_jsonb(categories)->>'icon_key' AS "iconKey" FROM categories WHERE store_id=$1 ORDER BY sort_order,name,id`,[store.id])).rows
  phase='commit';await db.query('COMMIT');send(res,200,{ok:true,categoryIconsSupported:categoryIcons,revision:categoryRevision(result),items:result,...req.method==='POST'||req.method==='PATCH'&&id!=='order'?{category:result.find(r=>req.method==='POST'?r.name===body.name.trim():r.id===id)}:{}})
 }catch(e){await db.query('ROLLBACK').catch(()=>{});if(e.code==='42501'){let dbRole=null;try{const role=await db.query('SELECT current_user AS role');dbRole=role.rows[0]?.role||null}catch{};console.error('Category permission diagnostic',JSON.stringify({phase,dbRole:typeof dbRole==='string'&&/^[A-Za-z_][A-Za-z_0-9]{0,62}$/.test(dbRole)?dbRole:null,code:'42501'}))}if(e.code==='23503')send(res,409,{error:'category_has_products'});else if(e.status)send(res,e.status,{error:e.message});else throw e}finally{db.release()}
}
