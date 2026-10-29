// Default --plan performs filesystem reads only. No backend/worker import or startup.
import {loadPlan,run021} from '../testing/staging/migration.mjs'
import {approvedProfile,parsedDatabase} from '../src/stagingDeployment.mjs'
import {permissionPlan} from '../src/stagingPermissions.mjs'
export function migrationTarget(env){
 const p=approvedProfile(env.STAGING_DEPLOYMENT_ID)
 if(!p||env.APP_ENV!=='staging'||env.STAGING_MIGRATION_AUTHORIZE!=='APPLY_021_STAGING_ONLY'||env.STAGING_MIGRATION_EXCLUSIVE!=='CONFIRMED_NO_OTHER_DDL'||env.STAGING_MIGRATION_EXPECTED_BRANCH_ID!==p.branchId||Object.keys(env).some(k=>k.startsWith('PG')&&env[k]))throw Error('staging_migration_authorization_rejected')
 const connection=parsedDatabase(env.STAGING_MIGRATION_DATABASE_URL,p,'migration');if(!connection)throw Error('staging_migration_target_rejected')
 return {profile:p,connection}
}
export async function main(args=process.argv.slice(2),env=process.env){
 if(args.length>1||args.length&&!['--plan','--apply'].includes(args[0]))throw Error('use_plan_or_apply_only')
 const plan=await loadPlan()
 if(args[0]!=='--apply'){const p=approvedProfile(env.STAGING_DEPLOYMENT_ID);console.log(JSON.stringify({mode:'offline-plan',operation:'021-only-after-attested-001-020',manifestSha256:plan.manifestSha256,files:plan.files.map(({filename,sha256})=>({filename,sha256})),deploymentApproved:!!p,permissionPlan:p?permissionPlan(p):null,databaseConnected:false}));return}
 if(env.STAGING_MIGRATION_PLAN_SHA256!==plan.manifestSha256)throw Error('staging_migration_plan_approval_required')
 const {profile,connection}=migrationTarget(env) // BEFORE pg import/connect.
 const {Pool}=await import('pg');const pool=new Pool({...connection,max:1})
 try{const c=await pool.connect();const result=await run021(c,plan,profile);console.log(JSON.stringify({...result,permissions:'verified in the same migration transaction',permissionPlan:permissionPlan(profile)}))}finally{await pool.end()}
}
if(import.meta.url===new URL(process.argv[1]||'', 'file:///').href||process.argv[1]?.replaceAll('\\','/').endsWith('/scripts/migrate-staging.mjs'))main().catch(e=>{console.error('Staging migration refused/failed:',e.code||e.message);process.exitCode=1})
