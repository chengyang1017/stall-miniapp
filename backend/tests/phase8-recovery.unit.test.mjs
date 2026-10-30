// Offline: actual V2 policy/controller + synthetic Docker metadata. No Docker,
// SQL or real private-directory access. Exclusive claim uses a fresh temp file.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {configuration,networkIsolation,topology,V2} from '../testing/phase8-v2/policy.mjs'
import {recoveryReceipt,recoveryInventory,containerSpec,volumeSpec,claimRecovery} from '../testing/phase8-v2/recovery.mjs'
import {recoverCreated} from '../testing/phase8-v2/controller.mjs'
import {hash} from '../testing/phase8-v2/artifact.mjs'
import {resources,config,environment,pg,node,instance,nonce,dbId,networkId,sources} from './helpers/phase8-v2-fixtures.mjs'
const code=name=>e=>e.phase8Code==='phase8_v2_'+name
const clone=v=>structuredClone(v)
const env=()=>({...environment(),PHASE8_V2_ACTION:'recover-created',PHASE8_V2_RECOVER_CREATED:'START_PINNED_CREATED_ONCE'})
function scenario(){
 const c=configuration(env(),'recover-created',pg,node),r=resources({running:false}),[db,v,n]=r
 db.Created='2026-10-27T00:00:00Z';db.RestartCount=0;db.HostConfig.RestartPolicy={Name:'no'}
 db.State={Status:'created',Running:false,Paused:false,Restarting:false,Dead:false,Pid:0,ExitCode:0,Error:'',StartedAt:'0001-01-01T00:00:00Z',FinishedAt:'0001-01-01T00:00:00Z'}
 v.Scope='local';v.CreatedAt='2026-10-27T00:00:00Z'
 n.Scope='local';n.Created='2026-10-27T00:00:00Z';n.Ingress=false;n.ConfigOnly=false;n.EnableIPv4=true;n.IPAM={Config:[{Subnet:'10.81.0.0/24'}]}
 delete n.Options['com.docker.network.enable_ipv6'];n.Options['com.docker.network.enable_ipv4']='true'
 const evidence={attempt:Buffer.from(JSON.stringify({version:2,profile:V2.profile,instance,status:'attempted',nonce})),
  failure:Buffer.from(JSON.stringify({version:1,profile:V2.profile,stage:'container',code:'phase8_v2_network_rejected'})),
  launch:Buffer.from(`MODE=first\nINSTANCE=${instance}\nTOKEN=${nonce}\nIMAGE=${c.images.database.reference}\nCONTAINER=\n`)}
 const engine={id:'synthetic-local-engine',version:'29.6.2',os:'linux',architecture:'amd64'}
 const anchor={version:1,protocol:'recover-created-v1',profile:V2.profile,project:V2.project,instance,dbId,dbCreated:db.Created,networkId,networkCreated:n.Created,
  volumeName:V2.volume,volumeCreated:v.CreatedAt,engineId:engine.id,engineVersion:engine.version,pgReference:c.images.database.reference,pgImageId:c.images.database.imageId,
  nonceSha256:hash(nonce),containerSpecSha256:hash(JSON.stringify(containerSpec(db))),volumeSpecSha256:hash(JSON.stringify(volumeSpec(v))),
  evidenceSha256:Object.fromEntries(Object.entries(evidence).map(([k,b])=>[k,hash(b)]))}
 const inventory=['container','volume','network'].map((kind,i)=>({kind,name:[V2.container,V2.volume,V2.network][i],project:V2.project,instance,nonce}))
 const calls=[],saved={};let claimed=false
 const io={calls,saved,recoveryAnchor:async()=>anchor,approvals:async()=>[pg,node],materials:async()=>calls.push('materials'),sources,
  assertRecoveryUnused:async()=>{if(claimed)throw Object.assign(Error('used'),{phase8Code:'phase8_v2_recovery_already_attempted'})},
  recoveryEvidence:async()=>evidence,
  reserveRecovery:async()=>{assert.equal(claimed,false);claimed=true;calls.push('claim')},
  completeRecovery:async value=>{saved.success=value;calls.push('success')},recoveryFailure:async value=>{saved.failure=value;calls.push('failure')},
  docker:{bind:async()=>calls.push('bind'),images:async()=>calls.push('images'),identity:async()=>engine,
   resources:async()=>r,inventory:async()=>inventory,revalidate:async()=>calls.push('revalidate'),
   start:async id=>{assert.equal(id,anchor.dbId);calls.push('start');db.State.Status='running';db.State.Running=true;db.State.StartedAt='2026-10-27T01:00:00Z';db.State.Pid=100;n.Containers={[dbId]:{}}}}
 }
 return {c,r,anchor,evidence,engine,inventory,io,calls,saved}
}
test('accepts explicit false and Engine-normalized omitted redundant IPv6 option',()=>{
 const s=scenario();assert.doesNotThrow(()=>networkIsolation(s.r[2]));s.r[2].Options['com.docker.network.enable_ipv6']='false';assert.doesNotThrow(()=>networkIsolation(s.r[2]))
})
for(const [name,change]of [
 ['missing actual flag',n=>delete n.EnableIPv6],['null flag',n=>n.EnableIPv6=null],['string false flag',n=>n.EnableIPv6='false'],['zero flag',n=>n.EnableIPv6=0],['enabled IPv6',n=>n.EnableIPv6=true],
 ['contradictory option',n=>n.Options['com.docker.network.enable_ipv6']='true'],['ambiguous option',n=>n.Options['com.docker.network.enable_ipv6']=false],['null option',n=>n.Options['com.docker.network.enable_ipv6']=null],['undefined option',n=>n.Options['com.docker.network.enable_ipv6']=undefined],
 ['external network',n=>n.Internal=false],['missing internal flag',n=>delete n.Internal],['NAT gateway',n=>n.Options['com.docker.network.bridge.gateway_mode_ipv4']='nat'],['routed gateway',n=>n.Options['com.docker.network.bridge.gateway_mode_ipv4']='routed'],
 ['no isolated mode',n=>delete n.Options['com.docker.network.bridge.gateway_mode_ipv4']],['unexpected option',n=>n.Options['com.docker.network.bridge.gateway_mode_ipv6']='routed'],['disabled IPv4',n=>n.Options['com.docker.network.enable_ipv4']='false']
])test('network compatibility still rejects '+name,()=>{const s=scenario();change(s.r[2]);assert.throws(()=>networkIsolation(s.r[2]),code('network_rejected'))})
test('normalized metadata still passes full topology including labels, mounts and no ports',()=>{
 const s=scenario(),r=recoveryReceipt(s.c,s.anchor,s.evidence,s.r,sources(),s.engine)
 assert.doesNotThrow(()=>topology(...s.r,s.c,r,sources(),{running:false}))
})
for(const [name,change,expected]of [
 ['wrong database id',s=>s.r[0].Id='0'.repeat(64),'recovery_resource_changed'],['wrong network id',s=>s.r[2].Id='0'.repeat(64),'recovery_resource_changed'],
 ['other volume',s=>s.r[1].Name='stall-phase8-data','recovery_resource_changed'],['changed container configuration',s=>s.r[0].Config.Env.push('PGHOST=elsewhere'),'recovery_resource_changed'],
 ['started before',s=>s.r[0].State.StartedAt='2026-10-27T00:00:00Z','recovery_not_never_started'],['exited container',s=>s.r[0].State.Status='exited','recovery_not_never_started'],['restart count',s=>s.r[0].RestartCount=1,'recovery_not_never_started'],
 ['running container',s=>s.r[0].State.Running=true,'recovery_not_never_started'],['existing start error',s=>s.r[0].State.Error='failed start','recovery_not_never_started'],
 ['different engine',s=>s.engine.id='another-engine','recovery_engine_rejected'],['upgraded engine without audit',s=>s.engine.version='30.0.0','recovery_engine_rejected'],
 ['rewritten failed evidence',s=>s.evidence.failure=Buffer.from('{}'),'recovery_evidence_rejected'],['rewritten launch',s=>s.evidence.launch=Buffer.from('MODE=restart\n'),'recovery_evidence_rejected'],
 ['extra IPv6 subnet',s=>s.r[2].IPAM.Config.push({Subnet:'fd00::/64'}),'recovery_ipam_rejected'],['network gateway',s=>s.r[2].IPAM.Config[0].Gateway='10.81.0.1','recovery_ipam_rejected'],
 ['wrong launch label',s=>s.r[2].Labels['stall.phase8.launch']='0'.repeat(64),'network_rejected'],['extra network member',s=>s.r[2].Containers['f'.repeat(64)]={},'network_members_rejected'],
 ['extra adapter',s=>s.r[0].NetworkSettings.Networks.other={},'network_mode_rejected'],['published port',s=>s.r[0].HostConfig.PortBindings={'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'55433'}]},'recovery_resource_changed']
])test('recovery rejects '+name+' before a claim/start',async()=>{
 const s=scenario();change(s);await assert.rejects(()=>recoverCreated(env(),s.io),code(expected));assert(!s.calls.includes('claim'));assert(!s.calls.includes('start'))
})
test('recovery rejects a different instance before credentials/Docker access',async()=>{
 const s=scenario();await assert.rejects(()=>recoverCreated({...env(),PHASE8_V2_INSTANCE:'f1234567-1234-4234-9234-123456789abc'},s.io),code('recovery_anchor_rejected'));assert.deepEqual(s.calls,[])
})
for(const patch of [{PHASE8_V2_RECOVER_CREATED:''},{PHASE8_V2_AUTHORIZE:''},{PHASE8_V2_HOST_EXCLUSIVE:''},{PHASE8_V2_ACTION:'run'}])test('recovery requires every explicit authorization '+JSON.stringify(patch),async()=>{
 const s=scenario();await assert.rejects(()=>recoverCreated({...env(),...patch},s.io),e=>['phase8_v2_recovery_not_authorized','phase8_v2_not_authorized','phase8_v2_action_not_authorized'].includes(e.phase8Code));assert.deepEqual(s.calls,[])
})
test('only three exact owned resources allowed, including stopped runner rejection',async()=>{
 const s=scenario();s.inventory.push({kind:'container',name:V2.project+'-runner-unexpected',project:V2.project,instance,nonce})
 await assert.rejects(()=>recoverCreated(env(),s.io),code('recovery_inventory_rejected'));assert(!s.calls.includes('claim'));assert(!s.calls.includes('start'))
})
test('successful synthetic recovery claims before start and preserves original failed evidence',async()=>{
 const s=scenario(),old=Buffer.from(s.evidence.failure),r=await recoverCreated(env(),s.io)
 assert(s.calls.indexOf('claim')<s.calls.indexOf('start'));assert.equal(s.calls.filter(x=>x==='start').length,1)
 assert.equal(r.status,'created_verified');assert.equal(r.ready,false);assert.equal(r.bootstrapVerified,false);assert.equal(r.dbId,dbId)
 assert(s.evidence.failure.equals(old));assert.equal(s.saved.success.recovery.originalFailureSha256,hash(old));assert.equal(s.saved.failure,undefined)
 await assert.rejects(()=>recoverCreated(env(),s.io),code('recovery_already_attempted'));assert.equal(s.calls.filter(x=>x==='start').length,1)
})
test('drift after durable claim rejects start and preserves a failed recovery',async()=>{
 const s=scenario();s.io.docker.revalidate=async()=>{s.r[2].EnableIPv6=true}
 await assert.rejects(()=>recoverCreated(env(),s.io),code('network_rejected'));assert(s.calls.includes('claim'));assert(!s.calls.includes('start'));assert.equal(s.saved.failure.stage,'reserved')
})
test('failed start never writes a success or reclaims its attempt',async()=>{
 const s=scenario();s.io.docker.start=async()=>{throw Object.assign(Error('synthetic'),{phase8Code:'phase8_v2_docker_command_failed'})}
 await assert.rejects(()=>recoverCreated(env(),s.io),code('docker_command_failed'));assert.equal(s.saved.success,undefined);assert.equal(s.saved.failure.stage,'reserved')
 await assert.rejects(()=>recoverCreated(env(),s.io),code('recovery_already_attempted'))
})
test('post-start drift retains failed recovery and never promotes the original failure',async()=>{
 const s=scenario(),start=s.io.docker.start,original=Buffer.from(s.evidence.failure)
 s.io.docker.start=async id=>{await start(id);s.r[2].EnableIPv6=true}
 await assert.rejects(()=>recoverCreated(env(),s.io),code('network_rejected'))
 assert.equal(s.saved.success,undefined);assert.equal(s.saved.failure.stage,'started');assert(s.evidence.failure.equals(original))
 await assert.rejects(()=>recoverCreated(env(),s.io),code('recovery_already_attempted'));assert.equal(s.calls.filter(v=>v==='start').length,1)
})
test('a matching digest cannot substitute another failure phase',async()=>{
 const s=scenario();s.evidence.failure=Buffer.from(JSON.stringify({version:1,profile:V2.profile,stage:'started',code:'phase8_v2_network_rejected'}))
 s.anchor.evidenceSha256.failure=hash(s.evidence.failure)
 await assert.rejects(()=>recoverCreated(env(),s.io),code('recovery_evidence_rejected'));assert(!s.calls.includes('claim'))
})
test('a matching digest cannot change first-start launch mode',async()=>{
 const s=scenario();s.evidence.launch=Buffer.from(s.evidence.launch.toString().replace('MODE=first','MODE=restart'));s.anchor.evidenceSha256.launch=hash(s.evidence.launch)
 await assert.rejects(()=>recoverCreated(env(),s.io),code('recovery_launch_rejected'));assert(!s.calls.includes('claim'))
})
test('actual exclusive claim file cannot be overwritten, including concurrent claims',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'phase8-recovery-'))
 try{
  const r=await Promise.allSettled([claimRecovery(dir,{id:'one'}),claimRecovery(dir,{id:'two'})])
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.filter(x=>x.status==='rejected'&&code('recovery_already_attempted')(x.reason)).length,1)
  const file=path.join(dir,'db.recovery.attempt.json'),before=await readFile(file)
  await assert.rejects(()=>claimRecovery(dir,{id:'overwrite'}),code('recovery_already_attempted'));assert((await readFile(file)).equals(before))
 }finally{await unlink(path.join(dir,'db.recovery.attempt.json'));await rmdir(dir)}
})
