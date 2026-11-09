// Offline, fail-closed review of a source inventory and the 37 SQL files.
// NEVER connects to DB/cloud, executes SQL, or grants deploy approval.
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {buildMigrationPolicyPlan} from './tencent-sql-policy-plan.mjs'

const restoredFirst=['023_customer_identity_groundwork.sql']
const mustRewrite=['024_customer_cloud_profile.sql','025_customer_avatar_style.sql',
 '026_customer_avatar_photo.sql','033_merchant_business_configuration_permissions.sql']
const designDecisions=['031_customer_avatar_private_bytes.sql','032_customer_account_sessions.sql']
const productionPayments=['034_wechat_live_prepays.sql','035_wechat_live_refunds.sql',
 '036_wechat_refund_reconcile.sql','037_wechat_abnormal_collection_reviews.sql']
export function inspectRestoredSource(source,policy){
 const fail=()=>{throw Error('source_inventory_not_approved_baseline')}
 if(!source||source.audit!=='read_only_migration_source'||!source.migration||
    !Array.isArray(source.migration.missing)||!Array.isArray(source.migration.issues)||
    !source.migration.cleanPrefix||source.migration.issues.length||
    source.migration.applied!==21||source.migration.expected!==37||
    !Array.isArray(source.tables)||!Array.isArray(source.extensions)||
    !Array.isArray(policy.migrations)||policy.migrations.length!==37||
    policy.canApplyToProduction!==false)fail()
 const expected=policy.migrations.slice(21).map(x=>x.filename)
 if(source.migration.missing.length!==expected.length||
   source.migration.missing.some((x,i)=>x!==expected[i]))fail()
 const sql=new Map(policy.migrations.map(x=>[x.filename,x]))
 if(sql.size!==37)fail()
 const groups=[
  {stage:'customer_identity',files:restoredFirst,review:'Verify account mapping with restored orders and legacy identities; approve schema and runtime grants.'},
  {stage:'rewrite_staging_grants',files:mustRewrite,review:'Create reviewed production-only replacements with isolated runtime and migration roles; do not run originals.'},
  {stage:'decide_avatar_and_sessions',files:designDecisions,review:'Choose COS-backed avatars versus database bytea; determine production customer session design and permissions.'},
  {stage:'live_wechat_pay_schema',files:productionPayments,review:'Test foreign keys and payment lifecycle on isolated restore; configure minimal grants and keep money switches off.'}
 ]
 for(const group of groups)for(const file of group.files){
  const entry=sql.get(file)
  if(!entry||!/^[a-f0-9]{64}$/.test(entry.sha256)||!entry.policy.startsWith('review_'))fail()
 }
 const excluded=policy.migrations.filter(x=>x.policy==='exclude_sandbox').map(x=>x.filename)
 if(excluded.join('|')!==['022_stripe_test_refund_jobs.sql','027_sandbox_payment_lifecycle.sql',
  '028_sandbox_payment_review_evidence.sql','029_sandbox_review_compensation.sql',
  '030_sandbox_review_refunded_status.sql'].join('|'))fail()
 const output=groups.map(x=>({...x,files:x.files.map(filename=>({
  filename,sha256:sql.get(filename).sha256,execution:'review_only_do_not_apply'}))}))
 return {operation:'offline_restored_source_migration_review',sourceApplied:21,
  sourceMissing:16,exclusions:excluded,groups:output,
  cutoverAllowed:false,sqlExecutionAuthorized:false,
  requiredBeforeAnyDDL:[
   'Prove source connection matches the approved Render deployment, not merely a named Neon branch.',
   'Capture consistent PostgreSQL and object backups with independent recovery verification.',
   'Restore into new isolated TencentDB and compare pre-migration row counts plus ledger with the actual source snapshot.',
   'Review original 021 staging schema already present in the restored source; preserve rather than rewrite its audit history.',
   'Approve a new production-only ledger/role/grant migration design for skipped numbered SQL; do not fabricate original migration hashes.',
   'Review identity/account and live payment dependencies, restore rollback plan, write freeze and merchant-approved maintenance window.'
  ]}
}
async function main(){
 const [file,...rest]=process.argv.slice(2)
 if(!file||rest.length)throw Error('usage_source_inventory_json')
 const bytes=await readFile(file)
 if(bytes.length>300000)throw Error('source_inventory_too_large')
 const src=JSON.parse(bytes.toString('utf8'))
 const plan=await buildMigrationPolicyPlan(fileURLToPath(new URL('../sql/',import.meta.url)))
 console.log(JSON.stringify(inspectRestoredSource(src,plan),null,2))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error('TENCENT_RESTORED_SOURCE_REVIEW_BLOCKED');process.exitCode=1})
}
