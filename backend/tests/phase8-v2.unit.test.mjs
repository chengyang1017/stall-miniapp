// OFFLINE ONLY. Real V2 functions; synthetic Docker and pg replies are NOT PostgreSQL evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,unlink,rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { V2,configuration,images,topology,runnerIdentity,receipt,absent,sameSource } from '../testing/phase8-v2/policy.mjs'
import { grant,consume,pgOptions } from '../testing/phase8-v2/grants.mjs'
import { createDatabase,run } from '../testing/phase8-v2/controller.mjs'
import { privateRoot } from '../testing/phase8-v2/host.mjs'
import { docker } from '../testing/phase8-v2/docker.mjs'
import { runJob,claimOnce } from '../testing/phase8-v2/runner.mjs'
import { bootstrapRows,verifySQL,IDENTITY,MARKER,BOOTSTRAP,ROLES } from '../testing/phase8-v2/sql.mjs'
import { fixture } from '../testing/phase8-v2/fixture.mjs'
import { initialize } from '../testing/phase8-v2/initialize.mjs'
import { sourceManifest } from '../testing/phase8-v2/artifact.mjs'
import { fileURLToPath } from 'node:url'
import { pg,node,environment,config,rec,resources,runner,sources,paths,token,now,hostFake,instance,runnerId } from './helpers/phase8-v2-fixtures.mjs'
const code=c=>e=>e?.phase8Code===c
const throws=(f,c)=>assert.throws(f,code(c))

test('V2 pure profile and approved canonical images retain exact identities',()=>{
  const c=config();assert.equal(c.profile,'internal-runner-v1');assert.equal(c.images.database.reference,'postgres@'+pg.digest);assert.equal(c.images.runner.reference,V2.runnerRepository+'@'+node.digest)
})
for(const [label,change,expected]of [
 ['profile',{PHASE8_V2_PROFILE:'legacy'},'profile_rejected'],['authorization',{PHASE8_V2_AUTHORIZE:''},'not_authorized'],['host exclusivity',{PHASE8_V2_HOST_EXCLUSIVE:''},'not_authorized'],
 ['action',{PHASE8_V2_ACTION:'create-db'},'action_not_authorized'],['old B0 UUID',{PHASE8_V2_INSTANCE:'43805bf5-1391-4d3f-b8ce-e3bfa9448d48'},'instance_rejected'],
 ['URL override',{DATABASE_URL:'SYNTHETIC_UNTRUSTED'},'connection_override_rejected'],['libpq override',{PGHOST:'SYNTHETIC_UNTRUSTED'},'connection_override_rejected'],['purpose',{PHASE8_V2_PURPOSE:'shell'},'purpose_rejected']
])test('V2 rejects '+label+' before create/run mutation',async()=>{const io=hostFake();await assert.rejects(()=>run({...environment(),...change},io),code('phase8_v2_'+expected));assert.deepEqual(io.calls,[])})
for(const [label,patch]of [['unapproved',{approved:false}],['repository',{repository:'node:latest'}],['digest',{digest:'sha256:bad'}],['ID',{imageId:'sha256:bad'}],['reviewer',{reviewedBy:''}],['timestamp',{reviewedAt:null}],['bundle',{bundleSha256:''}],['base',{baseReference:'node:22'}]])test('V2 rejects runner image '+label,()=>throws(()=>images(pg,{...node,...patch}),'phase8_v2_image_not_approved'))
test('V2 rejects unapproved PostgreSQL image independently',()=>throws(()=>images({...pg,approved:false},node),'phase8_image_not_approved'))
test('V2 synthetic pending approval blocks mutation regardless of live review state',async()=>{const io=hostFake();io.approvals=async()=>[pg,{...node,approved:false}];await assert.rejects(()=>run(environment(),io),code('phase8_v2_image_not_approved'));assert.deepEqual(io.calls,[])})
test('V2 real runner review record is policy-consistent without freezing its approval state',async()=>{const approval=JSON.parse(await readFile(new URL('../testing/phase8-v2/runner-image-approval.json',import.meta.url)));assert.equal(typeof approval.approved,'boolean');if(approval.approved)assert.doesNotThrow(()=>images(pg,approval));else throws(()=>images(pg,approval),'phase8_v2_image_not_approved')})

test('V2 accepts dedicated isolated topology without host ports',()=>assert.doesNotThrow(()=>topology(...resources(),config(),rec(),sources())))
for(const [label,change,expected]of [
 ['container ID',r=>r[0].Id='0'.repeat(64),'resource_identity_rejected'],['image ID',r=>r[0].Image='sha256:'+'0'.repeat(64),'container_rejected'],
 ['extra member',r=>r[2].Containers['0'.repeat(64)]={},'network_members_rejected'],['extra adapter',r=>r[0].NetworkSettings.Networks.other={},'network_mode_rejected'],
 ['host network',r=>r[0].HostConfig.NetworkMode='host','network_mode_rejected'],['published port',r=>r[0].HostConfig.PortBindings={'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'55433'}]},'host_port_rejected'],
 ['runtime publish',r=>r[0].NetworkSettings.Ports={'5432/tcp':[{HostIp:'0.0.0.0',HostPort:'5432'}]},'host_port_rejected'],['PublishAllPorts',r=>r[0].HostConfig.PublishAllPorts=true,'host_port_rejected'],
 ['IPv6',r=>r[2].EnableIPv6=true,'network_rejected'],['NAT mode',r=>r[2].Options['com.docker.network.bridge.gateway_mode_ipv4']='nat','network_rejected'],
 ['external network',r=>r[2].Internal=false,'network_rejected'],['socket mount',r=>r[0].Mounts.push({Destination:'/var/run/docker.sock',Type:'bind',Source:'/var/run/docker.sock',RW:false}),'mount_rejected'],
 ['privileged',r=>r[0].HostConfig.Privileged=true,'privilege_rejected'],['shared IPC',r=>r[0].HostConfig.IpcMode='container:other','privilege_rejected'],['host userns',r=>r[0].HostConfig.UsernsMode='host','privilege_rejected'],['device request',r=>r[0].HostConfig.DeviceRequests=[{}],'privilege_rejected'],['old B0 volume',r=>r[1].Name='stall-phase8-data','volume_rejected'],
 ['wrong nonce',r=>r[2].Labels['stall.phase8.launch']='0'.repeat(64),'network_rejected'],['libpq environment',r=>r[0].Config.Env.push('PGHOST=unexpected'),'database_environment_rejected']
])test('V2 topology rejects '+label,()=>{const r=resources();change(r);throws(()=>topology(...r,config(),rec(),sources()),'phase8_v2_'+expected)})
test('V2 never treats failed legacy or V2 receipts as verified',()=>{for(const r of [{...rec(),status:'failed'},{...rec(),version:1,project:'stall-phase8-b0'}])throws(()=>receipt(r,config()),'phase8_v2_receipt_rejected')})
test('V2 recognizes equivalent Windows Desktop paths without allowing a different source',()=>{assert.equal(sameSource('C:\\Users\\USER\\a','/run/desktop/mnt/host/c/Users/USER/a'),true);assert.equal(sameSource('/a','/b'),false)})
test('V2 private root cannot point at legacy secrets or a shared directory',()=>{const home=path.resolve('SYNTHETIC-HOME');throws(()=>privateRoot(path.join(home,'StallPhase8-Test-'+instance),instance,home),'phase8_v2_private_root_rejected');assert.equal(privateRoot(path.join(home,'StallPhase8-R2-'+instance),instance,home),path.join(home,'StallPhase8-R2-'+instance))})

test('V2 runner attestation accepts exact nonroot least-privilege metadata',()=>assert.doesNotThrow(()=>runnerIdentity(runner(),config(),rec(),paths)))
for(const [label,change,expected]of [
 ['root',r=>r.Config.User='0','runner_hardening_rejected'],['writable root',r=>r.HostConfig.ReadonlyRootfs=false,'runner_hardening_rejected'],
 ['capability',r=>r.HostConfig.CapAdd=['NET_ADMIN'],'privilege_rejected'],['missing cap drop',r=>r.HostConfig.CapDrop=[],'runner_hardening_rejected'],
 ['privilege escalation',r=>r.HostConfig.SecurityOpt=[],'runner_hardening_rejected'],['Docker socket',r=>r.Mounts.push({Source:'/var/run/docker.sock',Destination:'/var/run/docker.sock',Type:'bind',RW:true}),'runner_mount_rejected'],
 ['credential mixing',r=>r.Mounts[2].Source='/synthetic/r2/secrets/app.secret','runner_mount_rejected'],['shell command',r=>r.Config.Cmd=['sh'],'runner_command_rejected'],
 ['environment URL',r=>r.Config.Env.push('DATABASE_URL=synthetic'),'runner_environment_rejected'],['old Node version',r=>r.Config.Env[1]='NODE_VERSION=18.20.0','runner_node_version_rejected'],['duplicate Node version',r=>r.Config.Env.push('NODE_VERSION=22.0.0'),'runner_node_version_rejected'],['extra network',r=>r.NetworkSettings.Networks.bridge={},'network_mode_rejected']
])test('V2 runner rejects '+label,()=>{const r=runner();change(r);throws(()=>runnerIdentity(r,config(),rec(),paths),'phase8_v2_'+expected)})

test('V2 grant binds purpose, expiry, fixed target and immutable identities',()=>{const g=token();assert.equal(grant(g,now),g);const opts=pgOptions(g,'a'.repeat(64));assert.equal(opts.host,g.host);assert.equal(opts.max,6);assert.equal(opts.connectionString,undefined);assert.match(opts.options,/read_only=on/);assert.equal(opts.user,'stall_test_observer')})
for(const [label,patch,expected]of [
 ['profile',{profile:'legacy'},'grant_rejected'],['runner identity',{runnerId:'bad'},'grant_rejected'],['role',{role:'app'},'grant_purpose_rejected'],['scope',{scope:'shell'},'grant_purpose_rejected'],
 ['expired',{expiresAt:now-1},'grant_expired'],['future',{issuedAt:now+1},'grant_expired'],['unbounded',{deadlineAt:now+999999},'grant_expired'],
 ['production URL',{url:'postgresql://synthetic.invalid'},'grant_target_rejected'],['loopback',{host:'127.0.0.1'},'grant_target_rejected'],['port',{port:55432},'grant_target_rejected'],['command',{command:'sh'},'grant_target_rejected'],['empty command',{command:''},'grant_target_rejected'],['unknown scope property',{jobFile:'other.mjs'},'grant_rejected']
])test('V2 invalid grant '+label+' rejects before claim',async()=>{let claimed=false;await assert.rejects(()=>consume({...token(),...patch},{now:()=>now,hostname:()=>runnerId.slice(0,12),claim:async()=>{claimed=true}}),code('phase8_v2_'+expected));assert.equal(claimed,false)})
test('V2 wrong self hostname cannot consume a grant',async()=>{let called=false;await assert.rejects(()=>consume(token(),{now:()=>now,hostname:()=> 'wrong',claim:async()=>{called=true}}),code('phase8_v2_runner_self_identity_rejected'));assert.equal(called,false)})
test('V2 grant consumption persists and rejects replay using actual exclusive file IO',async()=>{const dir=await mkdtemp(path.join(tmpdir(),'phase8-v2-offline-'));try{await claimOnce(dir);await assert.rejects(()=>claimOnce(dir),code('phase8_v2_grant_already_consumed'));assert.equal(await readFile(path.join(dir,'consumed'),'utf8'),'consumed\n')}finally{await unlink(path.join(dir,'consumed'));await rmdir(dir)}})

test('V2 create orchestration validates before each mutation and never migrates',async()=>{const io=hostFake();const result=await createDatabase({...environment(),PHASE8_V2_ACTION:'create-db'},io);assert.equal(result.status,'created_verified');assert.equal(result.ready,false);assert.deepEqual(io.calls.filter(s=>s.startsWith('create:')),['create:volume','create:network','create:database']);assert.ok(io.calls.indexOf('images')<io.calls.indexOf('create:volume'));assert.equal(io.calls.some(s=>/migrat|stop|delete/.test(s)),false)})
test('V2 unauthorized create refuses before Docker/FS mutation',async()=>{const io=hostFake();await assert.rejects(()=>createDatabase({},io),code('phase8_v2_profile_rejected'));assert.deepEqual(io.calls,[])})
test('V2 existing resources refuse before reserve/create',async()=>{const io=hostFake({existing:[{name:V2.volume,project:V2.project}]});await assert.rejects(()=>createDatabase({...environment(),PHASE8_V2_ACTION:'create-db'},io),code('phase8_v2_existing_resource_refused'));assert.equal(io.calls.some(s=>s.startsWith('reserve')||s.startsWith('create')),false)})
test('V2 runner orchestration binds grant and returns only bootstrap verified, never ready',async()=>{const io=hostFake();const result=await run(environment(),io);assert.equal(result.status,'bootstrap_verified');assert.equal(result.ready,false);assert.equal(io.grant.runnerId,runnerId);assert.equal(io.grant.role,'observer');assert.ok(io.calls.indexOf('grant')<io.calls.indexOf('start:'+runnerId));assert.ok(io.calls.indexOf('claim-verified')<io.calls.indexOf('result'))})
test('V2 failed receipt blocks runner creation',async()=>{const io=hostFake({badReceipt:true});await assert.rejects(()=>run(environment(),io),code('phase8_v2_receipt_rejected'));assert.equal(io.calls.includes('create:runner'),false)})
test('V2 unsafe runner is never started; failed evidence retained without cleanup',async()=>{const io=hostFake({badRunner:true});await assert.rejects(()=>run(environment(),io),code('phase8_v2_runner_hardening_rejected'));assert.equal(io.calls.some(s=>s.startsWith('start:')),false);assert.ok(io.calls.includes('failed:runner-created'));assert.equal(io.calls.some(s=>/stop|remove/.test(s)),false)})
test('V2 post-run drift prevents success audit even with exit success',async()=>{const io=hostFake({drift:true});await assert.rejects(()=>run(environment(),io),code('phase8_v2_network_rejected'));assert.equal(io.calls.includes('result'),false)})
test('V2 independent migration and app authorizations cannot be borrowed from bootstrap',async()=>{for(const [purpose,key,error]of [['initialize','PHASE8_V2_MIGRATE','migration_not_authorized'],['fixture','PHASE8_V2_TEST','fixture_not_authorized']]){const io=hostFake(),env=environment(purpose);delete env[key];await assert.rejects(()=>run(env,io),code('phase8_v2_'+error));assert.deepEqual(io.calls,[])}})

function pgFake({wrongUuid=false,errorOn=null}={}) {
  const queries=[],clients=[],g=token();let closed=0
  const identity={database_name:V2.database,current_role:'stall_test_observer',session_role:'stall_test_observer',database_owner:'stall_test_bootstrap',server_version:160015,server_port:5432,read_only:'on',rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false,rolcanlogin:true,database_create:false,public_create:false,memberships:0}
  const info={business_objects:0,extra_schemas:0,controls:['instance'],observer_write:false,app_write:false,migrator_identity_write:false}
  const roles=['stall_test_app','stall_test_migrator','stall_test_observer'].map(rolname=>({rolname,rolcanlogin:true,memberships:0,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false}))
  class Pool{on(){}async connect(){const c={releases:[],async query(sql,args){queries.push({sql,args});if(sql===errorOn)throw Object.assign(Error('synthetic failure'),{code:'08006'});return {rows:sql===IDENTITY?[identity]:sql===MARKER?[{instance_id:wrongUuid?'bad':g.instance,schema_state:'bootstrap',manifest_sha256:null,schema_sha256:null,owner:'stall_test_bootstrap'}]:sql===BOOTSTRAP?[info]:sql===ROLES?roles:[],rowCount:1}},release(e){this.releases.push(e)}};clients.push(c);return c}async end(){closed++}}
  return {Pool,queries,clients,info,roles,get closed(){return closed}}
}
function runnerIO(fake) {const g=token();let claims=0;return {env:{},readGrant:async()=>g,now:()=>now,hostname:()=>runnerId.slice(0,12),verifyArtifact:async()=>{},migrations:async()=>({files:[],manifestHash:g.manifestSha256}),claim:async()=>{assert.equal(claims++,0)},secret:async()=> 'a'.repeat(64),watchdog:()=>1,clearWatchdog:()=>{},makePool:fake.Pool}}
test('V2 real runner bootstrap job uses only read-only SQL and exposes no Pool',async()=>{const f=pgFake();const result=await runJob(runnerIO(f));assert.equal(result.status,'bootstrap_verified');assert.equal(result.ready,false);assert.equal(result.pool,undefined);assert.ok(f.queries.some(q=>q.sql.includes('READ ONLY')));assert.ok(f.queries.every(q=>/^SELECT|^BEGIN TRANSACTION .* READ ONLY$|^ROLLBACK$/.test(q.sql)));assert.equal(f.closed,1)})
test('V2 SQL UUID mismatch destroys connection and never reports bootstrap success',async()=>{const f=pgFake({wrongUuid:true});await assert.rejects(()=>runJob(runnerIO(f)),code('phase8_instance_marker_rejected'));assert.ok(f.clients[0].releases[0] instanceof Error);assert.equal(f.closed,1)})
for(const field of ['business_objects','extra_schemas','observer_write','app_write','migrator_identity_write'])test('V2 bootstrap rejects '+field,async()=>{const f=pgFake();f.info[field]=typeof f.info[field]==='boolean'?true:1;await assert.rejects(()=>runJob(runnerIO(f)),code('phase8_v2_bootstrap_objects_or_acl_rejected'));assert.equal(f.closed,1)})
test('V2 bootstrap rejects privileged/missing role rows',()=>{const f=pgFake();for(const roles of [f.roles.slice(1),f.roles.map((r,i)=>i===0?{...r,rolsuper:true}:r)])throws(()=>bootstrapRows(f.info,roles),'phase8_v2_bootstrap_roles_rejected')})
test('V2 connection failure destroys lease, does not return it normally',async()=>{const f=pgFake({errorOn:IDENTITY});await assert.rejects(()=>runJob(runnerIO(f)),e=>e.code==='08006');assert.equal(f.clients[0].releases[0].code,'08006');assert.equal(f.closed,1)})
test('V2 app fixture preserves three real-transport seams, distinct PID guard and blocking query',async()=>{let next=0;const queries=[],released=[];const pool={async connect(){const pid=++next;return {async query(sql,args){queries.push({sql,args});return {rows:sql.includes('pg_backend_pid')?[{pid}]:[{blocked:true}]}},release(e){released.push(e)}}}};const f=fixture(pool,token('fixture'));await f.connections(async x=>{assert.equal(new Set(x.pids).size,3);await f.waitForBlocked(x.observer,x.pids[0],x.pids[1]);const c=await x.firstPool.connect();await c.query('BUSINESS_CALL',[1]);c.release()});assert.equal(released.length,3);assert.ok(released.every(e=>e instanceof Error));assert.deepEqual(queries.find(q=>q.sql==='BUSINESS_CALL').args,[1]);assert.ok(queries.some(q=>q.sql.includes('pg_blocking_pids')))})
test('V2 fixture rejects reuse of the same backend PID',async()=>{const pool={async connect(){return {query:async()=>({rows:[{pid:1}]}),release(){}}}};await assert.rejects(()=>fixture(pool,token('fixture')).connections(()=>{}),code('phase8_v2_backend_pid_rejected'))})
test('V2 migration orchestration rolls back SQL failure and retains failed claim',async()=>{const queries=[];const failure=Object.assign(Error('synthetic constraint'),{code:'23514'});const c={async query(sql){queries.push(sql);if(sql==='MIGRATION')throw failure;return {rows:sql.startsWith('SELECT pg_try')?[{acquired:true}]:[{count:0}],rowCount:1}},release(){}};await assert.rejects(()=>initialize({connect:async()=>c},token('initialize'),{files:[{body:'MIGRATION',filename:'SYNTHETIC',sha256:'x'}]}),e=>e===failure);assert.ok(queries.includes('BEGIN'));assert.ok(queries.includes('ROLLBACK'));assert.ok(!queries.includes('COMMIT'));assert.ok(queries.at(-1).includes("schema_state='failed'"))})
test('V2 artifact allowlist excludes server, worker entrypoints and complete repository mounts',async()=>{const root=fileURLToPath(new URL('../../',import.meta.url)),manifest=await sourceManifest(root);assert.equal(manifest.version,1);assert.equal(manifest.files.filter(f=>f.path.startsWith('backend/sql/')).length,20);assert.ok(manifest.files.every(f=>!/(server\.mjs|\.env|host\.mjs|docker\.mjs|controller\.mjs|live-db)/.test(f.path)))})

function dockerFake(){
  const calls=[];let endpoint='npipe:////./pipe/dockerDesktopLinuxEngine'
  const env={PHASE8_V2_DOCKER_EXE:path.resolve('SYNTHETIC-docker.exe'),PATH:'UNTRUSTED-PARENT',DATABASE_URL:'UNTRUSTED-PARENT'}
  const execute=async(exe,args,opts)=>{calls.push({exe,args,opts});let output=''
    if(args[0]==='context')output=JSON.stringify([{Name:'desktop-linux',Endpoints:{docker:{Host:endpoint}}}])
    else if(args.includes('info'))output=JSON.stringify({OSType:'linux'})
    else if(args.includes('image')&&args.includes('inspect')){const c=config(),im=args.at(-1)===c.images.database.reference?c.images.database:c.images.runner;output=JSON.stringify([{Id:im.imageId,Os:'linux',Architecture:'amd64',RepoDigests:[im.reference],Config:{Labels:{'stall.phase8.bundle':node.bundleSha256}}}])}
    return {stdout:output}
  }
  const d=docker(env,{compose:'/synthetic/compose.yml',emptyEnv:'/synthetic/empty.env',launch:'/synthetic/launch',secrets:Object.fromEntries(['admin','migrator','app','observer'].map(r=>[r,'/synthetic/'+r]))},execute)
  return {d,calls,changeEndpoint:()=>{endpoint='npipe:////./pipe/docker_engine'}}
}
test('V2 real Docker transport compiles hardened runner command and strips inherited connection settings',async()=>{
  const {d,calls}=dockerFake();await d.bind();await d.images(config().images);await d.createRunner(config(),rec(),paths)
  const call=calls.find(x=>x.args.includes('create'));assert.ok(call);const a=call.args
  for(const value of ['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','1000:1000','--pull','never'])assert.ok(a.includes(value),value)
  assert.equal(a.at(-1),config().images.runner.reference);assert.equal(a.filter(x=>x==='--mount').length,3)
  assert.ok(a.includes('type=bind,source='+paths.secret+',target=/run/secrets/phase8_role,readonly'))
  assert.ok(!a.some(x=>/docker.sock|--privileged|--publish|--entrypoint/.test(x)))
  assert.equal(call.opts.env.DATABASE_URL,undefined);assert.notEqual(call.opts.env.PATH,'UNTRUSTED-PARENT')
  assert.equal(a[0],'--host');assert.equal(a[1],'npipe:////./pipe/dockerDesktopLinuxEngine');assert.equal(typeof d.command,'undefined')
})
test('V2 Docker endpoint drift refuses before creation command',async()=>{const {d,calls,changeEndpoint}=dockerFake();await d.bind();changeEndpoint();await assert.rejects(()=>d.createRunner(config(),rec(),paths),code('phase8_v2_docker_context_changed'));assert.ok(!calls.some(c=>c.args.includes('create')))})
test('V2 Docker transport only compiles isolated network and no-recreate no-pull DB creation',async()=>{
  const {d,calls}=dockerFake();await d.bind();await d.prepare('network',config(),rec().nonce);await d.createDatabase(config(),rec().nonce)
  const network=calls.find(x=>x.args.includes('network')&&x.args.includes('create')).args
  for(const v of ['--internal','--ipv6=false','com.docker.network.bridge.gateway_mode_ipv4=isolated'])assert.ok(network.includes(v))
  const db=calls.find(x=>x.args.includes('compose'));for(const v of ['--no-recreate','--no-build','--pull','never'])assert.ok(db.args.includes(v))
  assert.equal(db.opts.env.PHASE8_V2_PG_IMAGE,config().images.database.reference);assert.ok(!db.args.includes('up'))
})
test('V2 final-state seam uses real order-to-store join, parameters and read-only transaction',async()=>{
  const queries=[],id='a1234567-1234-4234-9234-123456789abc';const c={async query(sql,args){queries.push({sql,args});return {rows:[]}},release(){}}
  const f=fixture({connect:async()=>c},token('fixture'));const out=await f.finalOrder(id);assert.deepEqual(Object.keys(out),['order','items','reservations','movements','events','products'])
  const q=queries.find(q=>q.sql.startsWith('SELECT p.'));assert.match(q.sql,/JOIN orders o ON o.store_id=p.store_id/);assert.deepEqual(q.args,[id]);assert.ok(!q.sql.includes('SELECT store_id,product_id FROM order_items'))
  assert.match(queries[0].sql,/READ ONLY/);assert.equal(queries.at(-1).sql,'ROLLBACK')
})
