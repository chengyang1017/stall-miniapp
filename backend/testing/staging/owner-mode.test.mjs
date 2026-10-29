import test from 'node:test'
import assert from 'node:assert/strict'
import {run021} from './migration.mjs'
import {migrationTarget} from '../../scripts/migrate-staging.mjs'

const profile={branchId:'br-nameless-block-b57fm06l',database:'neondb',migratorRole:'stall_payment_migrator_limited',applicationRole:'stall_payment_app_limited',authorizationRole:'stall_payment_authorizer_limited'}
const unsafeProfile={...profile,branchId:'br-royal-dust-b5hin5oi'}
test('DBA owner mode refuses the primary branch before querying',async()=>{
 let called=false
 const client={query(){called=true;throw Error('must_not_connect')}}
 await assert.rejects(run021(client,{},unsafeProfile,{ownerMode:true,expectedOwner:'neondb_owner'}),/staging_dba_owner_mode_target_rejected/)
 assert.equal(called,false)
})
test('DBA owner mode refuses incorrect owner before querying',async()=>{
 let called=false
 const client={query(){called=true;throw Error('must_not_connect')}}
 await assert.rejects(run021(client,{},profile,{ownerMode:true,expectedOwner:'stall_payment_migrator_limited'}),/staging_dba_owner_mode_target_rejected/)
 assert.equal(called,false)
})
test('DBA owner mode rejects high privilege payment roles before querying',async()=>{
 let called=false
 const client={query(){called=true;throw Error('must_not_connect')}}
 await assert.rejects(run021(client,{}, {...profile,applicationRole:'stall_payment_app'}, {ownerMode:true,expectedOwner:'neondb_owner'}),/staging_dba_owner_mode_target_rejected/)
 assert.equal(called,false)
})
test('CLI rejects missing deployment approval',()=>{
 assert.throws(()=>migrationTarget({APP_ENV:'staging',STAGING_MIGRATION_AUTHORIZE:'APPLY_021_STAGING_ONLY',STAGING_MIGRATION_DBA_MODE:'EXPLICIT_ISOLATED_OWNER'}),/staging_migration_authorization_rejected/)
})
test('CLI rejects invalid DBA flag before database connection',()=>{
 assert.throws(()=>migrationTarget({APP_ENV:'staging',STAGING_MIGRATION_DBA_MODE:'INVALID'}),/staging_migration_authorization_rejected/)
})
