import {readFileSync} from 'node:fs'
export const reviewedDeployments=JSON.parse(readFileSync(new URL('../config/staging-deployments.json',import.meta.url),'utf8'))
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const identifier=/^[a-z_][a-z0-9_]{0,62}$/
export function validProfile(p){
 return p?.approved===true&&p.environment==='staging'&&typeof p.reviewedBy==='string'&&p.reviewedBy.trim().length>0&&p.reviewedBy.length<=100&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(p.reviewedAt||'')&&Number.isFinite(Date.parse(p.reviewedAt))&&UUID.test(p.deploymentId||'')&&UUID.test(p.instanceId||'')&&
 /^srv-[a-z0-9]+$/.test(p.renderServiceId||'')&&/^br-[a-z0-9-]+$/.test(p.branchId||'')&&
 /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(p.applicationHost||'')&&
 /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(p.migrationHost||'')&&!p.migrationHost.split('.')[0].endsWith('-pooler')&&
 identifier.test(p.database||'')&&[p.applicationRole,p.migratorRole,p.authorizationRole].every(r=>identifier.test(r||''))&&
 new Set([p.applicationRole,p.migratorRole,p.authorizationRole]).size===3&&/^[a-f0-9]{64}$/.test(p.pre021CatalogSha256||'')
}
export function approvedProfile(id,registry=reviewedDeployments){
 if(registry?.version!==1||!Array.isArray(registry.deployments))return null
 const found=registry.deployments.filter(p=>p.deploymentId===id)
 return found.length===1&&validProfile(found[0])?found[0]:null
}
export function parsedDatabase(raw,p,kind='application'){
 try{const u=new URL(raw);if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!==p[kind==='application'?'applicationHost':'migrationHost']||
  (u.port&&u.port!=='5432')||decodeURIComponent(u.pathname.slice(1))!==p.database||decodeURIComponent(u.username)!==p[kind==='application'?'applicationRole':'migratorRole']||!u.password||u.hash||
  [...u.searchParams.keys()].some(k=>k!=='sslmode')||u.searchParams.getAll('sslmode').length>1||u.searchParams.has('sslmode')&&u.searchParams.get('sslmode')!=='verify-full')return null
  // Explicit pg fields avoid libpq query options overriding TLS or connection identity.
  return {host:u.hostname,port:5432,database:p.database,user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:5000,query_timeout:30000}
 }catch{return null}
}
export function runtimeDeployment(env=process.env,registry=reviewedDeployments){
 const p=approvedProfile(env.STAGING_DEPLOYMENT_ID,registry)
 if(!p||env.APP_ENV!=='staging'||env.STAGING_SIMULATED_PAYMENTS!=='ENABLED_FOR_TESTING_ONLY'||env.RENDER!=='true'||
  env.RENDER_SERVICE_ID!==p.renderServiceId||env.STAGING_PAYMENT_INSTANCE_ID!==p.instanceId||Object.keys(env).some(k=>k.startsWith('PG')&&env[k]&&k!=='PG_SSL')||
  !parsedDatabase(env.DATABASE_URL,p))return null
 return p
}
export async function assertDatabaseIdentity(db,p){
 const r=await db.query(`SELECT deployment_id,instance_id,branch_id,database_name,environment FROM staging_control.deployment_identity
  WHERE singleton=true AND environment='staging' AND deployment_id=$1 AND instance_id=$2 AND branch_id=$3
  AND database_name=current_database() AND current_database()=$4`,[p.deploymentId,p.instanceId,p.branchId,p.database])
 if(r.rows.length!==1)throw Object.assign(Error('staging_database_identity_rejected'),{status:403,code:'STAGING_DB_IDENTITY_REJECTED'})
}
