// Offline TencentDB migration classification gate. No connections, DDL or changes.
// A plan is NOT permission to apply SQL to any real production database.
import {readdir,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

export const SQL_POLICY=Object.freeze({
  '021_staging_payment.sql':'preserve_existing_staging_ledger_only',
  '022_stripe_test_refund_jobs.sql':'exclude_sandbox',
  '023_customer_identity_groundwork.sql':'review_customer_identity',
  '024_customer_cloud_profile.sql':'review_staging_grants',
  '025_customer_avatar_style.sql':'review_staging_grants',
  '026_customer_avatar_photo.sql':'review_staging_grants',
  '027_sandbox_payment_lifecycle.sql':'exclude_sandbox',
  '028_sandbox_payment_review_evidence.sql':'exclude_sandbox',
  '029_sandbox_review_compensation.sql':'exclude_sandbox',
  '030_sandbox_review_refunded_status.sql':'exclude_sandbox',
  '031_customer_avatar_private_bytes.sql':'review_staging_only_avatar_design',
  '032_customer_account_sessions.sql':'review_staging_only_session_design',
  '033_merchant_business_configuration_permissions.sql':'review_staging_grants',
  '034_wechat_live_prepays.sql':'review_live_payment',
  '035_wechat_live_refunds.sql':'review_live_payment',
  '036_wechat_refund_reconcile.sql':'review_live_payment',
  '037_wechat_abnormal_collection_reviews.sql':'review_live_payment'
})
export function classifySqlMigrations(names){
 if(!Array.isArray(names)||names.length!==37||new Set(names).size!==37)
  throw Error('migration_inventory_not_exactly_001_037')
 const expected=Object.keys(SQL_POLICY)
 for(let i=1;i<=37;i++){
  const prefix=String(i).padStart(3,'0')+'_'
  if(names.filter(n=>typeof n==='string'&&n.startsWith(prefix)&&/^\d{3}_[a-z0-9_]+\.sql$/.test(n)).length!==1)
   throw Error('migration_number_or_filename_mismatch')
 }
 const marked=names.filter(n=>Number(n.slice(0,3))>=21)
 if(marked.some(n=>!Object.hasOwn(SQL_POLICY,n))||expected.some(n=>!names.includes(n)))
  throw Error('production_migration_policy_requires_review')
 return [...names].sort().map(filename=>({
  filename,policy:Number(filename.slice(0,3))<=20?'source_history_001_020':SQL_POLICY[filename]
 }))
}
export async function buildMigrationPolicyPlan(dir){
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql'))
 const entries=classifySqlMigrations(names)
 const migrations=[]
 for(const item of entries){
  const bytes=await readFile(path.join(dir,item.filename))
  if(bytes.length===0)throw Error('empty_sql_file')
  migrations.push({...item,sha256:createHash('sha256').update(bytes).digest('hex')})
 }
 return {mode:'offline_classification_only',migrations,canApplyToProduction:false,
  summary:{
   historical:entries.filter(x=>x.policy==='source_history_001_020').length,
   preserveExisting:entries.filter(x=>x.policy==='preserve_existing_staging_ledger_only').length,
   sandboxExcluded:entries.filter(x=>x.policy==='exclude_sandbox').length,
   individualReviewRequired:entries.filter(x=>x.policy.startsWith('review_')).length
  },
  constraints:[
   'Source Neon production has 001-021 already applied; preserve its ledger and data.',
   'Do not run 022 or 027-030 on production: Stripe/Sandbox only.',
   'Do not blindly run 023-026, 031-033, or 034-037; review SQL, role grants and migration dependencies.',
   'Review/replace staging-only role GRANTs before any production approval.',
   'No production SQL runner or automatic migration is authorized by this report.'
  ]}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const base=fileURLToPath(new URL('../sql/',import.meta.url))
 buildMigrationPolicyPlan(base).then(p=>console.log(JSON.stringify(p,null,2)))
  .catch(()=>{console.error('SQL_POLICY_REVIEW_REQUIRED');process.exitCode=1})
}
