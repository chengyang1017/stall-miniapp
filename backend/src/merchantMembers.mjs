import { createHash } from 'node:crypto'
import { authenticate, permittedStore } from './auth.mjs'

const hash=v=>createHash('sha256').update(v).digest('hex')
function send(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
export async function merchantMembersRoute(req,res,url,pool){
  const m=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/members(?:\/([a-f0-9]{64}))?$/.exec(url.pathname)
  if(!m)return false
  if(!(req.method==='GET'&&!m[2]||req.method==='DELETE'&&!!m[2])){send(res,405,{error:'method_not_allowed'});return true}
  const subject=await authenticate(pool,req)
  if(!subject){send(res,401,{error:'unauthorized'});return true}
  const store=await permittedStore(pool,subject,m[1])
  if(!store||store.role!=='owner'){send(res,403,{error:'owner_required'});return true}
  const result=await pool.query('SELECT mm.external_subject,mm.role FROM merchant_members mm JOIN stores s ON s.merchant_id=mm.merchant_id WHERE s.id=$1 ORDER BY CASE mm.role WHEN \'owner\' THEN 0 WHEN \'manager\' THEN 1 ELSE 2 END,mm.external_subject LIMIT 200',[store.id])
  const members=result.rows.map(row=>({memberKey:hash(row.external_subject),label:(row.external_subject===subject?'我（店主）':'微信成员 · '+hash(row.external_subject).slice(0,6).toUpperCase()),role:row.role,isSelf:row.external_subject===subject}))
  if(req.method==='GET'){send(res,200,{members});return true}
  const target=result.rows.find(row=>hash(row.external_subject)===m[2])
  if(!target){send(res,404,{error:'member_not_found'});return true}
  if(target.role==='owner'||target.external_subject===subject){send(res,403,{error:'cannot_remove_owner'});return true}
  const removed=await pool.query(
    'DELETE FROM merchant_members mm USING stores s WHERE s.merchant_id=mm.merchant_id AND s.id=$1 AND mm.external_subject=$2 AND mm.role IN (\'manager\',\'staff\') RETURNING mm.external_subject',[store.id,target.external_subject])
  if(!removed.rowCount){send(res,409,{error:'member_changed'});return true}
  send(res,200,{ok:true})
  return true
}
