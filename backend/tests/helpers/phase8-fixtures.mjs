// Synthetic policy metadata ONLY. These digests are NOT approved Docker images.
import path from 'node:path'
import { TARGET } from '../../testing/phase8/policy.mjs'
export const instance='a1234567-1234-4234-8234-123456789abc',hash='d'.repeat(64),nonce='b'.repeat(64)
export const approval={approved:true,repository:TARGET.image,digest:'sha256:'+'c'.repeat(64),imageId:'sha256:'+'e'.repeat(64),reviewedBy:'SYNTHETIC UNIT TEST',reviewedAt:'2026-10-26T00:00:00Z'}
export const env=()=>({STALL_PHASE8_AUTHORIZE:'LOCAL_PHASE8_DATABASE_ACCESS',STALL_PHASE8_INSTANCE_ID:instance,
 STALL_PHASE8_INITIALIZE:'INITIALIZE_ONCE',STALL_PHASE8_TEST_WRITES:'TEST_WRITES_ONLY',STALL_PHASE8_START:'CREATE_FIRST_ONLY',
 STALL_PHASE8_RESTART:'RESTART_EXISTING_ONLY',STALL_PHASE8_HOST_EXCLUSIVE:'I_CONTROL_LOCAL_DOCKER',STALL_PHASE8_DOCKER_EXE:path.resolve('SYNTHETIC-docker.exe'),
 STALL_PHASE8_APP_URL:'postgresql://stall_test_app:'+'a'.repeat(64)+'@127.0.0.1:55433/stall_test_phase8',
 STALL_PHASE8_MIGRATOR_URL:'postgresql://stall_test_migrator:'+'b'.repeat(64)+'@127.0.0.1:55433/stall_test_phase8',
 STALL_PHASE8_OBSERVER_URL:'postgresql://stall_test_observer:'+'d'.repeat(64)+'@127.0.0.1:55433/stall_test_phase8'})
export function resources({running=true}={}) {
 const labels={'com.docker.compose.project':TARGET.project,'stall.phase8.scope':TARGET.scope,'stall.phase8.instance':instance,'stall.phase8.launch':nonce}
 const ports={'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'55433'}]}
 const container={Name:'/'+TARGET.container,Id:'f'.repeat(64),Image:approval.imageId,State:{Running:running},Config:{Image:'postgres@'+approval.digest,
  Entrypoint:['sh','/phase8/bootstrap-entrypoint.sh'],Cmd:['postgres','-c','log_statement=none','-c','log_min_error_statement=panic','-c','log_parameter_max_length_on_error=0','-c','listen_addresses=*','-c','port=5432'],
  Labels:{...labels,'com.docker.compose.service':TARGET.service},Env:['POSTGRES_DB='+TARGET.database,'POSTGRES_USER=stall_test_bootstrap',
   'POSTGRES_PASSWORD_FILE=/run/secrets/phase8_admin_password','PGDATA=/var/lib/postgresql/data','POSTGRES_HOST_AUTH_METHOD=scram-sha-256',
   'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=scram-sha-256','STALL_PHASE8_INSTANCE_ID='+instance,
   'STALL_PHASE8_BOOTSTRAP_CONFIRM=CREATE_NEW_PHASE8_INSTANCE','STALL_PHASE8_LAUNCH_TOKEN='+nonce,'STALL_PHASE8_IMAGE=postgres@'+approval.digest]},
  HostConfig:{Privileged:false,PortBindings:structuredClone(ports),NetworkMode:TARGET.network},
  NetworkSettings:{Ports:running?structuredClone(ports):{},Networks:{[TARGET.network]:{}}},
  Mounts:[{Destination:'/var/lib/postgresql/data',Type:'volume',Name:TARGET.volume,RW:true},
   ...['/docker-entrypoint-initdb.d/10-phase8-bootstrap.sh','/phase8/bootstrap-entrypoint.sh','/run/secrets/phase8_admin_password',
    '/run/secrets/phase8_migrator_password','/run/secrets/phase8_app_password','/run/secrets/phase8_observer_password','/run/phase8-launch'].map(Destination=>({Destination,Type:'bind',RW:false}))]}
 return [container,{Name:TARGET.volume,Driver:'local',Labels:{...labels}},
  {Name:TARGET.network,Driver:'bridge',Internal:true,Labels:{...labels},Containers:running?{[container.Id]:{}}:{}}]
}
export const identity=(role,purpose='inspect')=>({database_name:TARGET.database,current_role:'stall_test_'+role,session_role:'stall_test_'+role,
 database_owner:'stall_test_bootstrap',server_version:160010,server_port:5432,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,
 rolbypassrls:false,rolcanlogin:true,database_create:false,memberships:0,public_create:role==='migrator',read_only:purpose==='inspect'?'on':'off'})
export const marker=state=>[{instance_id:instance,schema_state:state,manifest_sha256:state==='bootstrap'?null:hash,owner:'stall_test_bootstrap'}]
