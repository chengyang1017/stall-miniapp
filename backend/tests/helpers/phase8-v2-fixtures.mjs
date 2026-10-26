// SYNTHETIC Docker metadata and protocol replies only. Not a SQL/database implementation.
import { V2,configuration,PURPOSES } from '../../testing/phase8-v2/policy.mjs'
export const instance='b1234567-1234-4234-9234-123456789abc',runId='c1234567-1234-4234-9234-123456789abc',nonce='a'.repeat(64),dbId='b'.repeat(64),networkId='c'.repeat(64),runnerId='d'.repeat(64),now=1000000
export const pg={approved:true,repository:'postgres:16-alpine',digest:'sha256:'+'e'.repeat(64),imageId:'sha256:'+'f'.repeat(64),reviewedBy:'SYNTHETIC TEST',reviewedAt:'2026-10-26T00:00:00Z'}
export const node={approved:true,repository:V2.runnerRepository,digest:'sha256:'+'1'.repeat(64),imageId:'sha256:'+'2'.repeat(64),bundleSha256:'3'.repeat(64),baseReference:'node@sha256:'+'4'.repeat(64),reviewedBy:'SYNTHETIC TEST',reviewedAt:'2026-10-26T00:00:00Z'}
export const environment=(purpose='bootstrap')=>({PHASE8_V2_PROFILE:V2.profile,PHASE8_V2_AUTHORIZE:'ISOLATED_V2_ONLY',PHASE8_V2_HOST_EXCLUSIVE:'I_CONTROL_LOCAL_DOCKER',PHASE8_V2_INSTANCE:instance,
  PHASE8_V2_ACTION:'run',PHASE8_V2_RUN_ID:runId,PHASE8_V2_PURPOSE:purpose,PHASE8_V2_MIGRATE:'INITIALIZE_NEW_V2_ONCE',PHASE8_V2_TEST:'V2_FIXTURE_ONLY'})
export const config=purpose=>configuration(environment(purpose),'run',pg,node)
export const rec=()=>({version:2,profile:V2.profile,project:V2.project,status:'created_verified',instance,nonce,dbId,networkId,volume:V2.volume,pgReference:'postgres@'+pg.digest,pgImageId:pg.imageId})
export const paths={grant:'/synthetic/r2/run/grant',claim:'/synthetic/r2/run/claim',secret:'/synthetic/r2/secrets/observer.secret'}
export const sources=()=>Object.fromEntries(['/docker-entrypoint-initdb.d/10-phase8-bootstrap.sh','/phase8/bootstrap-entrypoint.sh','/run/phase8-launch',...['admin','migrator','app','observer'].map(r=>'/run/secrets/phase8_'+r+'_password')].map((dest,i)=>[dest,'/synthetic/r2/source-'+i]))
const labels=()=>({'com.docker.compose.project':V2.project,'stall.phase8.profile':V2.profile,'stall.phase8.instance':instance,'stall.phase8.launch':nonce})
export function resources({running=true,runnerRunning=false}={}) {
  const c=config(),net={NetworkID:networkId,IPAddress:'10.81.0.2',Gateway:'',GlobalIPv6Address:''}
  const db={Name:'/'+V2.container,Id:dbId,Image:pg.imageId,State:{Running:running},Config:{Image:c.images.database.reference,Labels:labels(),Entrypoint:['sh','/phase8/bootstrap-entrypoint.sh'],Cmd:['postgres','-c','log_statement=none','-c','log_min_error_statement=panic','-c','log_parameter_max_length_on_error=0','-c','listen_addresses=*','-c','port=5432'],Env:[
    'POSTGRES_DB=stall_test_phase8','POSTGRES_USER=stall_test_bootstrap','POSTGRES_PASSWORD_FILE=/run/secrets/phase8_admin_password','PGDATA=/var/lib/postgresql/data','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=scram-sha-256','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','STALL_PHASE8_INSTANCE_ID='+instance,'STALL_PHASE8_LAUNCH_TOKEN='+nonce,'STALL_PHASE8_IMAGE='+c.images.database.reference,'STALL_PHASE8_BOOTSTRAP_CONFIRM=CREATE_NEW_PHASE8_INSTANCE']},
    HostConfig:{Privileged:false,PortBindings:{},PublishAllPorts:false,NetworkMode:V2.network},NetworkSettings:{Ports:{'5432/tcp':[]},Networks:{[V2.network]:net}},
    Mounts:[{Type:'volume',Name:V2.volume,Destination:'/var/lib/postgresql/data',RW:true},...Object.entries(sources()).map(([Destination,Source])=>({Type:'bind',Destination,Source,RW:false}))]}
  const v={Name:V2.volume,Driver:'local',Options:{},Labels:labels()}
  const n={Name:V2.network,Id:networkId,Driver:'bridge',Internal:true,EnableIPv6:false,Options:{'com.docker.network.bridge.gateway_mode_ipv4':'isolated','com.docker.network.enable_ipv6':'false'},Labels:labels(),Containers:running?{[dbId]:{},...runnerRunning?{[runnerId]:{}}:{}}:{}}
  return [db,v,n]
}
export function runner(running=false) {
  return {Name:'/'+V2.project+'-runner-'+runId,Id:runnerId,Image:node.imageId,State:{Running:running},Config:{Image:V2.runnerRepository+'@'+node.digest,Hostname:runnerId.slice(0,12),User:'1000:1000',Labels:labels(),Entrypoint:['node','/opt/phase8/backend/testing/phase8-v2/runner.mjs'],Cmd:[],Env:['PATH=/usr/local/bin','NODE_VERSION=22.0.0']},
    HostConfig:{Privileged:false,CapDrop:['ALL'],ReadonlyRootfs:true,SecurityOpt:['no-new-privileges'],PidsLimit:64,Memory:536870912,NanoCpus:1000000000,Tmpfs:{'/tmp':'rw,noexec,nosuid,size=16777216'},RestartPolicy:{Name:'no'},NetworkMode:V2.network,PortBindings:{}},
    NetworkSettings:{Ports:{},Networks:{[V2.network]:{NetworkID:networkId,IPAddress:'10.81.0.3',Gateway:'',GlobalIPv6Address:''}}},Mounts:[['/run/phase8-grant',paths.grant,false],['/run/phase8-claim',paths.claim,true],['/run/secrets/phase8_role',paths.secret,false]].map(([Destination,Source,RW])=>({Destination,Source,RW,Type:'bind'}))}
}
export const token=(purpose='bootstrap')=>({version:1,profile:V2.profile,instance,runId,nonce,dbId,runnerId,networkId,bundleSha256:node.bundleSha256,manifestSha256:'5'.repeat(64),receiptSha256:'6'.repeat(64),
  pgReference:'postgres@'+pg.digest,pgImageId:pg.imageId,runnerReference:V2.runnerRepository+'@'+node.digest,runnerImageId:node.imageId,purpose,role:PURPOSES[purpose].role,scope:PURPOSES[purpose].scope,database:V2.database,host:'10.81.0.2',port:5432,issuedAt:now-1,expiresAt:now+30000,deadlineAt:now+100000})
export function hostFake({existing=[],badReceipt=false,badRunner=false,drift=false}={}) {
  const calls=[];let dbRunning=true,rr=false,runnerCreated=false,stage='';const c=config();const io={calls,approvals:async()=>[pg,node],materials:async()=>{calls.push('materials')},now:()=>now,nonce:()=>nonce,sources,
    reserveDatabase:async()=>{calls.push('reserve-db');dbRunning=false},assertPreparedInventory:async()=>{calls.push('inventory-gate')},writeDatabase:async()=>{calls.push('receipt-created')},
    readDatabase:async()=>({...rec(),...badReceipt?{status:'failed'}:{}}),prerequisite:async()=>({profile:V2.profile,instance,dbId,status:'bootstrap_verified'}),reserveRun:async()=>{calls.push('reserve-run');return paths},writeGrant:async(_p,g)=>{calls.push('grant');io.grant=g},verifyClaim:async()=>{calls.push('claim-verified')},writeResult:async()=>{calls.push('result')},failure:async(_key,e)=>{calls.push('failed:'+e.stage)},migrations:async()=>({manifestHash:'5'.repeat(64)}),
    docker:{bind:async()=>{calls.push('bind')},images:async()=>{calls.push('images')},inventory:async()=>existing,revalidate:async()=>{calls.push('revalidate')},prepare:async kind=>{calls.push('create:'+kind)},
      createDatabase:async()=>{calls.push('create:database')},resources:async()=>{const a=resources({running:dbRunning,runnerRunning:rr});if(drift&&stage==='post')a[2].EnableIPv6=true;return a},
      createRunner:async()=>{calls.push('create:runner');runnerCreated=true},runner:async()=>{const a=runner(rr);if(badRunner)a.Config.User='0';return a},
      start:async id=>{calls.push('start:'+id);if(id===dbId)dbRunning=true;else rr=true},waitResult:async()=>{calls.push('wait');rr=false;stage='post';return {version:1,profile:V2.profile,runId,instance,dbId,runnerId,purpose:'bootstrap',status:'bootstrap_verified',ready:false}}}}
  return io
}
