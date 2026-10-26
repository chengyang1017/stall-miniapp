// B0 remediation: pure safety/orchestration tests. NO Docker or PostgreSQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import { accessConfig, approvedImage, assertResources, TARGET } from '../testing/phase8/policy.mjs'
import { env,resources,approval,nonce } from './helpers/phase8-fixtures.mjs'
import { controlledLaunch } from '../testing/phase8/launch.mjs'
import { createDocker } from '../testing/phase8/docker.mjs'
import { guardedPool } from '../testing/phase8/leases.mjs'
import { assertCatalog,assertBaseline,assertReadyTransition,fingerprint } from '../testing/phase8/schema.mjs'
import { openVerifiedPool,loadImageApproval } from '../testing/phase8/postgres.mjs'
import { transaction } from './helpers/phase8-postgres.mjs'
import { readFile } from 'node:fs/promises'
const instance = 'a1234567-1234-4234-8234-123456789abc'
const environment = () => ({ STALL_PHASE8_AUTHORIZE: 'LOCAL_PHASE8_DATABASE_ACCESS', STALL_PHASE8_INSTANCE_ID: instance,
  STALL_PHASE8_TEST_WRITES: 'TEST_WRITES_ONLY', STALL_PHASE8_INITIALIZE: 'INITIALIZE_ONCE',
  STALL_PHASE8_APP_URL: 'postgresql://stall_test_app:' + 'a'.repeat(64) + '@127.0.0.1:55433/stall_test_phase8',
  STALL_PHASE8_MIGRATOR_URL: 'postgresql://stall_test_migrator:' + 'b'.repeat(64) + '@127.0.0.1:55433/stall_test_phase8' })
const rejects = (action, code) => assert.throws(action, e => e?.phase8Code === code)
test('R-P1 inspect cannot select the DML app role', () => rejects(() => accessConfig(environment(), 'app', 'inspect'), 'phase8_role_purpose_rejected'))
test('R-P1 inspect cannot select the migrator role', () => rejects(() => accessConfig(environment(), 'migrator', 'inspect'), 'phase8_role_purpose_rejected'))
for (const value of ['PGDATA=/tmp/unapproved','PGHOST=unexpected','PGSERVICE=unexpected','POSTGRES_HOST_AUTH_METHOD=trust']) {
  test('R-P2 bootstrap refuses extra environment ' + value.split('=')[0], () => {
    const r = resources(); r[0].Config.Env.push(value)
    rejects(() => assertResources(...r, instance,{approval,nonce}), 'phase8_container_environment_rejected')
  })
}
test('R-P3 unapproved image digest prevents access', () => rejects(() => accessConfig(environment(), 'app', 'test'), 'phase8_image_not_approved'))

function launchIO({existing=[],race,changed=false}={}) {
 const calls=[],inventory=structuredClone(existing);let running=false,inspections=0
 const io={approval,nonce:()=>nonce,calls,
  async lock(mode){calls.push('lock:'+mode);return {paths:{launch:'SYNTHETIC'},async write(r){calls.push('record:'+r.status)},async launch(){calls.push('receipt')},async updateOriginal(){},async close(){calls.push('close')}}},
  docker:{async bind(){calls.push('bind');return {endpoint:'npipe:////./pipe/dockerDesktopLinuxEngine',name:'local'}},
   async ensureImage(){calls.push('image')},async revalidate(){calls.push('context');if(changed)throw Object.assign(Error('phase8_docker_context_changed'),{phase8Code:'phase8_docker_context_changed'})},
   async inventory(){calls.push('inventory');return inventory},
   async inspect(kind){calls.push('inspect:'+kind);return resources({running:false})[kind==='volume'?1:2]},
   async inspectAll(){calls.push('inspectAll');const r=resources({running});if(race==='replacement'&&++inspections===2)r[0].Id='1'.repeat(64);return r}},
  async create(kind){calls.push('create:'+kind);inventory.push({kind,name:kind==='volume'?TARGET.volume:TARGET.network,project:TARGET.project,nonce:race===kind?'foreign':nonce})},
  async createContainer(){calls.push('create:container');inventory.push({kind:'container',name:TARGET.container,project:TARGET.project,nonce})},
  receiptText:()=>'',async start(id){calls.push('start:'+id);running=true},
  async previous(config){calls.push('previous');return {version:1,instance,nonce,containerId:'f'.repeat(64),image:config.image.reference,imageId:config.image.imageId,
    endpoint:'npipe:////./pipe/dockerDesktopLinuxEngine',context:'local',status:'created_verified'}},
  async verifyDatabase(){calls.push('observer:verify')}
 }
 return io
}
for(const kind of ['container','volume','network','project'])test('R-P1 existing '+kind+' refuses BEFORE any Docker creation',async()=>{
 const io=launchIO({existing:[{kind:kind==='project'?'container':kind,name:kind==='project'?'different-name':TARGET[kind],project:TARGET.project,nonce:'old-uuid'}]})
 await assert.rejects(()=>controlledLaunch(env(),'first',io),e=>e.phase8Code==='phase8_existing_resource_refused')
 assert.equal(io.calls.some(c=>c.startsWith('create:')||c.startsWith('start:')),false)
})
for(const field of ['STALL_PHASE8_AUTHORIZE','STALL_PHASE8_START','STALL_PHASE8_HOST_EXCLUSIVE'])test('R-P1 missing '+field+' rejects before lock or external access',async()=>{
 const e=env();delete e[field];const io=launchIO()
 const code=field==='STALL_PHASE8_AUTHORIZE'?'phase8_access_not_authorized':field==='STALL_PHASE8_START'?'phase8_launch_not_authorized':'phase8_host_exclusivity_not_acknowledged'
 await assert.rejects(()=>controlledLaunch(e,'first',io),x=>x.phase8Code===code);assert.deepEqual(io.calls,[])
})
test('R-P1 controlled first create rechecks resources BEFORE starting immutable container ID',async()=>{
 const io=launchIO(),r=await controlledLaunch(env(),'first',io)
 assert.equal(r.status,'created_verified');assert.equal(r.containerId,'f'.repeat(64))
 assert.deepEqual(io.calls.filter(c=>c.startsWith('create:')),['create:volume','create:network','create:container'])
 const start=io.calls.findIndex(c=>c.startsWith('start:'))
 assert.ok(io.calls.slice(0,start).filter(c=>c==='inspectAll').length===2)
 assert.ok(io.calls.indexOf('inventory')<io.calls.indexOf('create:volume'));assert.ok(io.calls.indexOf('inspect:volume')<io.calls.indexOf('create:container'))
 assert.equal(io.calls.at(-1),'close')
})
for(const race of ['volume','network','replacement'])test('R-P1 raced '+race+' blocks later creation/start without cleanup',async()=>{
 const io=launchIO({race});await assert.rejects(()=>controlledLaunch(env(),'first',io),e=>e.phase8Code===(race==='replacement'?'phase8_resource_changed_before_start':'phase8_existing_resource_refused'))
 assert.equal(io.calls.some(c=>c.startsWith('start:')),false)
 if(race!=='replacement')assert.equal(io.calls.includes('create:container'),false)
 assert.equal(io.calls.some(c=>/remove|delete|cleanup|stop/.test(c)),false)
})
test('R-P1 independent restart requires its own authorization and read-only post-start identity verification',async()=>{
 const e=env();delete e.STALL_PHASE8_RESTART;const blocked=launchIO()
 await assert.rejects(()=>controlledLaunch(e,'restart',blocked),x=>x.phase8Code==='phase8_launch_not_authorized');assert.deepEqual(blocked.calls,[])
 const io=launchIO(),r=await controlledLaunch(env(),'restart',io)
 assert.equal(r.status,'ready_verified');assert.equal(io.calls.some(c=>c.startsWith('create:')),false)
 assert.ok(io.calls.indexOf('observer:verify')>io.calls.findIndex(c=>c.startsWith('start:')))
})
test('R-P1 restart identity failure leaves explicit failed audit, never stops or repairs resources',async()=>{
 const io=launchIO();io.verifyDatabase=async()=>{throw Object.assign(Error('phase8_schema_drift'),{phase8Code:'phase8_schema_drift'})}
 await assert.rejects(()=>controlledLaunch(env(),'restart',io),e=>e.phase8Code==='phase8_schema_drift')
 assert.ok(io.calls.includes('record:failed'));assert.equal(io.calls.some(c=>/stop|remove|cleanup/.test(c)),false)
})
test('R-P1 inspect cannot expose any Pool even with otherwise valid access authorization',async()=>{
 await assert.rejects(()=>openVerifiedPool(env()),e=>e.phase8Code==='phase8_inspect_pool_not_exposed')
 const c=accessConfig(env(),'observer','inspect',approval);assert.equal(c.pg.user,'stall_test_observer')
})
test('R-P3 synthetic unapproved image blocks controlled launch before any IO',async()=>{
 // Approval is mutable operational state; this rejection case owns its fixture.
 const io=launchIO();io.approval={...structuredClone(approval),approved:false}
 assert.equal(io.approval.approved,false)
 await assert.rejects(()=>controlledLaunch(env(),'first',io),e=>e.phase8Code==='phase8_image_not_approved');assert.deepEqual(io.calls,[])
})
test('R-P3 valid synthetic approval yields the exact pinned image identity',()=>{
 const candidate=structuredClone(approval)
 assert.deepEqual(approvedImage(candidate),{
  reference:'postgres@'+candidate.digest,imageId:candidate.imageId
 })
 assert.equal(accessConfig(env(),'app','test',candidate).image.imageId,candidate.imageId)
 assert.deepEqual(candidate,approval)
})

for(const [label,change] of [
 ['missing approval',{approved:undefined}],['nonboolean approval',{approved:'true'}],
 ['unexpected repository',{repository:'postgres:latest'}],
 ['invalid index digest',{digest:'sha256:'+'c'.repeat(63)}],['missing index digest',{digest:null}],
 ['invalid local image ID',{imageId:'sha256:'+'g'.repeat(64)}],['missing local image ID',{imageId:null}],
 ['missing reviewer',{reviewedBy:undefined}],['blank reviewer',{reviewedBy:'  '}],
 ['missing review timestamp',{reviewedAt:undefined}],['invalid review timestamp',{reviewedAt:'not-a-review-timestamp'}]
])test('R-P3 '+label+' is rejected before any launch IO',async()=>{
 const io=launchIO();io.approval={...structuredClone(approval),...change}
 rejects(()=>approvedImage(io.approval),'phase8_image_not_approved')
 await assert.rejects(()=>controlledLaunch(env(),'first',io),e=>e.phase8Code==='phase8_image_not_approved')
 assert.deepEqual(io.calls,[])
})

test('R-P3 real approval record is policy-consistent without fixing its approval state',async()=>{
 const record=await loadImageApproval()
 assert.equal(typeof record.approved,'boolean');assert.equal(record.repository,TARGET.image)
 if(record.approved){
  assert.deepEqual(approvedImage(record),{reference:'postgres@'+record.digest,imageId:record.imageId})
 }else{
  rejects(()=>approvedImage(record),'phase8_image_not_approved')
 }
})

test('R-P2 Docker always receives an explicit sanitized environment and pinned endpoint',async()=>{
 const calls=[],e=env();e.DATABASE_URL='SYNTHETIC_PARENT_DATABASE';e.PGHOST='SYNTHETIC_PARENT_HOST'
 const d=createDocker(e,async(executable,args,options)=>{calls.push({executable,args,options});return {stdout:JSON.stringify([{Name:'local',Endpoints:{docker:{Host:'npipe:////./pipe/dockerDesktopLinuxEngine'}}}])}})
 await d.bind();await d.command(['image','inspect','SYNTHETIC'])
 const last=calls.at(-1);assert.equal(last.options.env.PGHOST,undefined);assert.equal(last.options.env.DATABASE_URL,undefined)
 assert.equal(last.options.env.DOCKER_HOST,undefined);assert.deepEqual(last.args.slice(0,2),['--host','npipe:////./pipe/dockerDesktopLinuxEngine'])
 assert.equal(last.executable,e.STALL_PHASE8_DOCKER_EXE)
})
test('R-P2 context/endpoint switching refuses a command BEFORE side effects',async()=>{
 let n=0,operations=0
 const d=createDocker(env(),async(_exe,args)=>{if(args[0]!=='context')operations++;return {stdout:JSON.stringify([{Name:++n===1?'local':'different',Endpoints:{docker:{Host:'npipe:////./pipe/dockerDesktopLinuxEngine'}}}])}})
 await d.bind();await assert.rejects(()=>d.command(['volume','create',TARGET.volume]),e=>e.phase8Code==='phase8_docker_context_changed');assert.equal(operations,0)
})
test('R-P2 remote endpoint and forbidden Docker actions cannot be used',async()=>{
 let operations=0
 const d=createDocker(env(),async()=>{operations++;return {stdout:JSON.stringify([{Name:'remote',Endpoints:{docker:{Host:'ssh://not-local.invalid'}}}])}})
 await assert.rejects(()=>d.bind(),e=>e.phase8Code==='phase8_remote_docker_context_rejected')
 for(const args of [['container','rm','anything'],['image','pull','anything'],['volume','rm',TARGET.volume],['compose','up']])await assert.rejects(()=>d.command(args),e=>e.phase8Code==='phase8_docker_action_rejected')
 assert.equal(operations,1)
})
function catalog() {
 const rows=[]
 for(const name of ['orders_checkout_retry_unique','inventory_held_product','inventory_expiring_orders'])rows.push({kind:'index',name,detail:{valid:true}})
 for(const name of ['products.products_stock_quantity_check','inventory_reservations.inventory_reservations_pkey','inventory_reservations.inventory_reservations_store_id_order_id_fkey',
 'inventory_reservations.inventory_reservations_store_id_product_id_fkey','inventory_movements.inventory_movements_store_id_order_id_fkey','inventory_movements.inventory_movements_store_id_product_id_fkey'])rows.push({kind:'constraint',name,detail:{validated:true}})
 for(const name of ['inventory_movements.inventory_movements_no_rewrite','order_items.order_item_category_snapshot','order_items.capture_order_image','orders.end_order_tracking_on_status'])rows.push({kind:'trigger',name,detail:{enabled:'O'}})
 rows.push({kind:'table',name:'public.orders',detail:{owner:'stall_test_migrator',observer_write:false,app_danger:false}})
 return {rows,controls:['instance','migrations','schema_baseline'].map(relname=>({relname,owner:relname==='instance'?'stall_test_bootstrap':'stall_test_migrator',app_write:false,observer_write:false}))}
}
test('R-P2 pristine catalog and its separately captured fingerprint are accepted',()=>{
 const {rows,controls}=catalog();assertCatalog(rows,controls);assertBaseline(structuredClone(rows),rows,fingerprint(rows))
 assertReadyTransition({rowCount:1})
})
for(const [label,change,code] of [
 ['index',c=>c.rows.splice(0,1),'phase8_key_index_missing'],['constraint',c=>c.rows.find(r=>r.kind==='constraint').detail.validated=false,'phase8_key_constraint_missing'],
 ['trigger',c=>c.rows.find(r=>r.kind==='trigger').detail.enabled='D','phase8_key_trigger_missing'],
 ['owner',c=>c.rows.at(-1).detail.owner='stall_test_app','phase8_table_privilege_drift'],
 ['observer DML',c=>c.rows.at(-1).detail.observer_write=true,'phase8_table_privilege_drift'],
 ['TRUNCATE',c=>c.rows.at(-1).detail.app_danger=true,'phase8_table_privilege_drift'],
 ['ledger ACL',c=>c.controls[1].app_write=true,'phase8_control_acl_drift']
])test('R-P2 drift in '+label+' is rejected independently of ledger hashes',()=>{const c=catalog();change(c);rejects(()=>assertCatalog(c.rows,c.controls),code)})
test('R-P2 catalog definition drift and wrong ready row count cannot claim readiness',()=>{
 const {rows}=catalog(),stored=structuredClone(rows);rows[0].detail.definition='DIFFERENT'
 rejects(()=>assertBaseline(rows,stored,fingerprint(stored)),'phase8_schema_drift')
 for(const rowCount of [0,2,undefined])rejects(()=>assertReadyTransition({rowCount}),'phase8_ready_transition_failed')
})
function fakePool(fail=()=>false) {
 const clients=[];let ended=0
 return {clients,get ended(){return ended},async connect(){
  const c={queries:[],releases:[],async query(sql){this.queries.push(sql);const error=fail(sql);if(error)throw error;return {rows:[{ok:true}]}},release(error){this.releases.push(error)}}
  clients.push(c);return c
 },async end(){ended++}}
}
test('R-P2 successful queries return real transport results and normally release once',async()=>{
 const raw=fakePool(),p=guardedPool(raw,async()=>{})
 assert.deepEqual(await p.query('SELECT test'),{rows:[{ok:true}]});assert.deepEqual(raw.clients[0].releases,[undefined]);await p.end()
})
test('R-P2 timeout destroys the lease immediately, prevents reuse and keeps release idempotent',async()=>{
 const timeout=Error('Query read timeout'),raw=fakePool(sql=>sql==='TIMEOUT'?timeout:null),p=guardedPool(raw,async()=>{}),c=await p.connect()
 await assert.rejects(()=>c.query('TIMEOUT'),e=>e===timeout)
 assert.equal(raw.clients[0].releases[0],timeout)
 await assert.rejects(()=>c.query('SELECT later'),e=>e.phase8Code==='phase8_connection_released')
 c.release();assert.equal(raw.clients[0].releases.length,1)
 const next=await p.connect();assert.equal(raw.clients.length,2);next.release();await p.end()
})
test('R-P2 constraint failure may rollback but can never return its connection normally',async()=>{
 const failure=Object.assign(Error('synthetic check'),{code:'23514'}),raw=fakePool(sql=>sql==='BAD'?failure:null),p=guardedPool(raw,async()=>{}),c=await p.connect()
 await assert.rejects(()=>c.query('BAD'),e=>e===failure)
 await assert.rejects(()=>c.query('SELECT wrong'),e=>e.phase8Code==='phase8_connection_tainted')
 await c.query('ROLLBACK');c.release();assert.equal(raw.clients[0].releases[0],failure);await p.end()
})

for(const code of ['57014','57P01','08006','40003'])test('R-P2 uncertain/terminated SQLSTATE '+code+' destroys connection immediately',async()=>{
 const failure=Object.assign(Error('synthetic failure'),{code}),raw=fakePool(()=>failure),p=guardedPool(raw,async()=>{}),c=await p.connect()
 await assert.rejects(()=>c.query('COMMIT'),e=>e===failure)
 assert.deepEqual(raw.clients[0].releases,[failure])
 await assert.rejects(()=>c.query('ROLLBACK'),e=>e.phase8Code==='phase8_connection_released')
 c.release();assert.equal(raw.clients[0].releases.length,1);await p.end()
})
test('R-P2 rollback failure destroys connection and preserves original transaction error',async()=>{
 const original=Object.assign(Error('synthetic deadlock'),{code:'40P01'}),rollback=Object.assign(Error('synthetic disconnect'),{code:'08006'})
 const raw=fakePool(sql=>sql==='BAD'?original:sql==='ROLLBACK'?rollback:null),p=guardedPool(raw,async()=>{}),c=await p.connect()
 await assert.rejects(()=>transaction(c,db=>db.query('BAD')),e=>e===original)
 assert.equal(raw.clients[0].releases[0],rollback);assert.equal(raw.clients[0].releases.length,1);await p.end()
})
test('R-P2 failed identity destroys client before exposing it; closing invalidates active leases',async()=>{
 const fail=Object.assign(Error('phase8_schema_drift'),{phase8Code:'phase8_schema_drift'}),raw=fakePool(),p=guardedPool(raw,async()=>{throw fail})
 await assert.rejects(()=>p.connect(),e=>e===fail);assert.equal(raw.clients[0].releases[0],fail);await p.end()
 const raw2=fakePool(),p2=guardedPool(raw2,async()=>{}),c=await p2.connect();await p2.end();await p2.end()
 assert.equal(raw2.ended,1);assert.equal(raw2.clients[0].releases.length,1)
 await assert.rejects(()=>c.query('SELECT after'),e=>e.phase8Code==='phase8_connection_released')
 await assert.rejects(()=>p2.connect(),e=>e.phase8Code==='phase8_pool_closed')
})
test('R-P2 shell guard/source review: LF, fixed socket, observer privileges and empty first PGDATA',async()=>{
 for(const name of ['bootstrap.sh','bootstrap-entrypoint.sh']){
  const raw=await readFile(new URL('../testing/phase8/'+name,import.meta.url));assert.equal(raw.includes(13),false);assert.notEqual(raw.subarray(0,3).toString('hex'),'efbbbf')
 }
 const boot=await readFile(new URL('../testing/phase8/bootstrap.sh',import.meta.url),'utf8'),entry=await readFile(new URL('../testing/phase8/bootstrap-entrypoint.sh',import.meta.url),'utf8')
 assert.match(boot,/--host=\/var\/run\/postgresql --port=5432/);assert.match(boot,/CREATE ROLE stall_test_observer LOGIN NOSUPERUSER/)
 assert.match(entry,/! -e "\$PGDATA\/PG_VERSION"/);assert.match(entry,/find "\$PGDATA" -mindepth 1/)
 assert.match(entry,/MODE=restart/);assert.match(entry,/PG\*\|POSTGRES_PASSWORD/)
})

// B3 regression: only injected Docker transport is used below; no real Docker or pg IO.
for(const repository of ['postgres','docker.io/library/postgres:16-alpine','example.invalid/postgres:16-alpine']) {
 test('R-B3 repository whitelist rejects '+repository+' before launch IO',async()=>{
  const io=launchIO();io.approval={...approval,repository}
  await assert.rejects(()=>controlledLaunch(env(),'first',io),e=>e.phase8Code==='phase8_image_not_approved')
  assert.deepEqual(io.calls,[])
 })
}

test('R-B3 approval cannot override the pinned reference using extra fields',()=>{
 const candidate={...approval,reference:'untrusted:latest',image:'postgres:16-alpine'}
 assert.deepEqual(approvedImage(candidate),{reference:'postgres@'+approval.digest,imageId:approval.imageId})
 assert.equal(candidate.repository,'postgres:16-alpine')
})

function imageTransport(metadata,{missing=false}={}) {
 const calls=[]
 const docker=createDocker(env(),async(_exe,args)=>{
  calls.push(args)
  if(args[0]==='context')return {stdout:JSON.stringify([{Name:'local',Endpoints:{docker:{Host:'npipe:////./pipe/dockerDesktopLinuxEngine'}}}])}
  assert.deepEqual(args.slice(2),['image','inspect','postgres@'+approval.digest])
  if(missing)throw Error('synthetic image missing')
  return {stdout:JSON.stringify([metadata])}
 })
 return {docker,calls}
}

test('R-B3 ensureImage inspects only the canonical pinned reference and verifies both identities',async()=>{
 const {docker,calls}=imageTransport({Id:approval.imageId,RepoDigests:['postgres@'+approval.digest]})
 await docker.bind();await docker.ensureImage(approvedImage(approval))
 assert.deepEqual(calls.filter(c=>c[0]!=='context').map(c=>c.slice(2)),[['image','inspect','postgres@'+approval.digest]])
})

for(const [label,metadata] of [
 ['wrong local Image ID',{Id:'sha256:'+'1'.repeat(64),RepoDigests:['postgres@'+approval.digest]}],
 ['wrong RepoDigest',{Id:approval.imageId,RepoDigests:['postgres@sha256:'+'1'.repeat(64)]}],
 ['missing RepoDigests',{Id:approval.imageId}]
])test('R-B3 ensureImage rejects '+label+' without fallback',async()=>{
 const {docker,calls}=imageTransport(metadata);await docker.bind()
 await assert.rejects(()=>docker.ensureImage(approvedImage(approval)),e=>e.phase8Code==='phase8_local_image_digest_mismatch')
 assert.equal(calls.filter(c=>c[0]!=='context').length,1)
})

test('R-B3 a missing pinned image never triggers tag lookup or pull',async()=>{
 const {docker,calls}=imageTransport(null,{missing:true});await docker.bind()
 await assert.rejects(()=>docker.ensureImage(approvedImage(approval)),e=>e.phase8Code==='phase8_docker_command_failed')
 assert.deepEqual(calls.filter(c=>c[0]!=='context').map(c=>c.slice(2)),[['image','inspect','postgres@'+approval.digest]])
})

test('R-B3 container attestation accepts canonical pin and rejects other image references',()=>{
 const r=resources();assert.equal(r[0].Config.Image,'postgres@'+approval.digest)
 assert.doesNotThrow(()=>assertResources(...r,instance,{approval,nonce}))
 for(const image of ['postgres:16-alpine',approval.repository+'@'+approval.digest,'untrusted@'+approval.digest,'postgres@sha256:'+'1'.repeat(64)]){
  const changed=resources();changed[0].Config.Image=image
  rejects(()=>assertResources(...changed,instance,{approval,nonce}),'phase8_container_rejected')
 }
})

test('R-B3 container environment must match the same canonical pinned image',()=>{
 const r=resources();const i=r[0].Config.Env.findIndex(v=>v.startsWith('STALL_PHASE8_IMAGE='))
 r[0].Config.Env[i]='STALL_PHASE8_IMAGE='+approval.repository
 rejects(()=>assertResources(...r,instance,{approval,nonce}),'phase8_container_environment_rejected')
})

test('R-B3 controlled launch propagates canonical image through checks and audit records',async()=>{
 const io=launchIO(),images=[],records=[];const lock=io.lock
 io.lock=async mode=>{const l=await lock(mode),write=l.write;l.write=async r=>{records.push(structuredClone(r));await write(r)};return l}
 io.docker.ensureImage=async image=>{images.push(image)}
 io.receiptText=r=>{assert.equal(r.image,'postgres@'+approval.digest);return 'SYNTHETIC'}
 const createContainer=io.createContainer;io.createContainer=async r=>{assert.equal(r.image,'postgres@'+approval.digest);await createContainer(r)}
 await controlledLaunch(env(),'first',io)
 assert.deepEqual(images,[{reference:'postgres@'+approval.digest,imageId:approval.imageId}])
 assert.ok(records.length>=3);assert.ok(records.every(r=>r.image==='postgres@'+approval.digest&&r.imageId===approval.imageId))
})

test('R-B3 Compose requires the supplied pinned reference and never supplies a floating fallback',async()=>{
 const compose=await readFile(new URL('../compose.test.yml',import.meta.url),'utf8')
 const imageLines=compose.split(/\r?\n/).filter(l=>/^\s+(?:image|STALL_PHASE8_IMAGE):/.test(l))
 assert.equal(imageLines.length,2)
 assert.ok(imageLines.every(l=>l.trim().split(': ').slice(1).join(': ')==='${STALL_PHASE8_IMAGE:?Reviewed immutable image reference required}'))
 assert.match(compose,/pull_policy: never/)
})

test('R-B3 bootstrap image guard accepts only the canonical repository digest grammar',async()=>{
 const entry=await readFile(new URL('../testing/phase8/bootstrap-entrypoint.sh',import.meta.url),'utf8')
 const pattern=entry.match(/grep -Eq '(\^postgres[^']+\$)'/)
 assert.ok(pattern);const guard=new RegExp(pattern[1])
 assert.equal(guard.test('postgres@'+approval.digest),true)
 for(const image of [approval.repository,approval.repository+'@'+approval.digest,'untrusted@'+approval.digest,'postgres@sha256:'+'a'.repeat(63)])assert.equal(guard.test(image),false)
})
