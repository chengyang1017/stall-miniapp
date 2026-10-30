// Explicitly enrolled loopback test targets only; never a connection fallback.
import assert from 'node:assert/strict'
export function localTestTarget(env){
 const id=env.STALL_STAGING_PG_TEST_INSTANCE_ID
 assert.match(id||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
 const database='stall_payment_it_'+id.replaceAll('-','')
 const configs=['MIGRATOR','APP','AUTHORIZER'].map(role=>{
  let u;try{u=new URL(env['STALL_STAGING_PG_TEST_'+role+'_URL'])}catch{throw Error('isolated_test_url_required')}
  assert.ok(['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','[::1]'].includes(u.hostname),'loopback only')
  assert.equal(decodeURIComponent(u.pathname.slice(1)),database,'dedicated UUID database only')
  assert.equal(u.search,'','no libpq query options');assert.equal(u.hash,'');assert.match(decodeURIComponent(u.username),/^[a-z_][a-z0-9_]{0,62}$/);assert.ok(u.password)
  return {host:u.hostname.replace(/^\[|\]$/g,''),port:Number(u.port||5432),database,user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),ssl:false,connectionTimeoutMillis:3000,query_timeout:10000,max:6}
 })
 assert.equal(new Set(configs.map(c=>[c.host,c.port,c.database].join(':'))).size,1)
 assert.equal(new Set(configs.map(c=>c.user)).size,3)
 assert.ok(!Object.keys(env).some(k=>k.startsWith('PG')&&env[k]),'libpq override refused')
 return {id,database,configs}
}
