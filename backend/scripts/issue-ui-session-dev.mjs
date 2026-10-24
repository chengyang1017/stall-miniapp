// Development-only. No network endpoint or production auth bypass.
import { randomBytes, createHash } from 'node:crypto'
import pg from 'pg'
const raw=process.env.DATABASE_URL || ''
let url
try { url=new URL(raw) } catch { throw new Error('Set DATABASE_URL for localhost stall_dev') }
if(process.env.CONFIRM_DEV_UI_SESSION!=='YES' || !['localhost','127.0.0.1'].includes(url.hostname) || url.pathname!=='/stall_dev')
  throw new Error('Refusing to operate outside local stall_dev database')
const pool=new pg.Pool({connectionString:raw,ssl:false})
const slug='stall-demo'
const subject=`dev:ui:${randomBytes(12).toString('hex')}`
const token=randomBytes(32).toString('base64url')
const digest=createHash('sha256').update(token).digest('hex')
try {
  const {rows}=await pool.query('SELECT id,merchant_id FROM stores WHERE slug=$1 AND is_active=true',[slug])
  if(rows.length!==1) throw new Error('Missing active stall-demo test store')
  await pool.query('BEGIN')
  try {
    await pool.query('INSERT INTO merchant_members(merchant_id,external_subject,role) VALUES($1,$2,$3)',[rows[0].merchant_id,subject,'owner'])
    await pool.query("INSERT INTO auth_sessions(token_hash,external_subject,expires_at) VALUES($1,$2,now()+interval '15 minutes')",[digest,subject])
    await pool.query('COMMIT')
  } catch(error) { await pool.query('ROLLBACK'); throw error }
  console.log('Temporary 15-minute local test owner session for stall-demo. Do NOT share this token:')
  console.log(token)
  console.log('Paste it only into the WeChat Developer Tools local test field. Never commit or upload it.')
} finally { await pool.end() }
