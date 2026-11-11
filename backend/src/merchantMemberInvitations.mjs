import { randomBytes, createHash } from 'node:crypto'
import { authenticate, permittedStore } from './auth.mjs'

const digest = value => createHash('sha256').update(value).digest('hex')
function send(res,status,body){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'})
  res.end(JSON.stringify(body))
}
async function body(req,max=512){
  if(Number(req.headers['content-length']||0)>max)throw Error('too_large')
  let raw=''
  for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>max)throw Error('too_large')}
  try{return JSON.parse(raw)}catch{throw Error('invalid_json')}
}
export async function merchantMemberInvitationsRoute(req,res,url,pool){
  const match=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/member-invitations(?:\/(redeem))?$/.exec(url.pathname)
  if(!match)return false
  if(req.method!=='POST'){send(res,405,{error:'method_not_allowed'});return true}
  const subject=await authenticate(pool,req)
  if(!subject){send(res,401,{error:'unauthorized'});return true}
  const slug=match[1],redeem=match[2]==='redeem'
  if(!redeem){
    const store=await permittedStore(pool,subject,slug)
    if(!store||store.role!=='owner'){send(res,403,{error:'owner_required'});return true}
    // Bounded outstanding invitations prevent unlimited growth.
    const outstanding=await pool.query(
      'SELECT count(*)::int AS n FROM merchant_member_invitations WHERE merchant_id=(SELECT merchant_id FROM stores WHERE id=$1) AND expires_at>now() AND redeemed_at IS NULL',[store.id])
    if(Number(outstanding.rows[0]?.n)>=5){send(res,429,{error:'too_many_active_invitations'});return true}
    const token=randomBytes(24).toString('base64url')
    const expiry=new Date(Date.now()+24*60*60*1000).toISOString()
    await pool.query(
      'INSERT INTO merchant_member_invitations(token_hash,merchant_id,created_by,role,expires_at) SELECT $1,merchant_id,$2,$3,$4 FROM stores WHERE id=$5',
      [digest(token),subject,'manager',expiry,store.id])
    send(res,201,{invitationCode:token,expiresAt:expiry,role:'manager',oneTime:true})
    return true
  }
  let payload
  try{payload=await body(req)}catch(e){send(res,e.message==='too_large'?413:400,{error:e.message});return true}
  const token=payload?.invitationCode
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(token)){send(res,400,{error:'invalid_invitation'});return true}
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    const invitation=await client.query(
      'SELECT i.merchant_id,i.role FROM merchant_member_invitations i JOIN stores s ON s.merchant_id=i.merchant_id WHERE i.token_hash=$1 AND s.slug=$2 AND i.redeemed_at IS NULL AND i.expires_at>now() FOR UPDATE OF i',
      [digest(token),slug])
    if(!invitation.rows.length){await client.query('ROLLBACK');send(res,400,{error:'invalid_or_expired_invitation'});return true}
    const {merchant_id,role}=invitation.rows[0]
    const membership=await client.query('SELECT role FROM merchant_members WHERE merchant_id=$1 AND external_subject=$2',[merchant_id,subject])
    if(membership.rows.length){await client.query('ROLLBACK');send(res,409,{error:'already_a_member'});return true}
    await client.query('INSERT INTO merchant_members(merchant_id,external_subject,role) VALUES($1,$2,$3)',[merchant_id,subject,role])
    await client.query('UPDATE merchant_member_invitations SET redeemed_by=$1,redeemed_at=now() WHERE token_hash=$2',[subject,digest(token)])
    await client.query('COMMIT')
    send(res,200,{ok:true,role})
    return true
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
  finally{client.release()}
}
