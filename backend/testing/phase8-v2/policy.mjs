// Pure V2 policy. Never imports Docker, pg or the legacy launcher.
import { isIP } from 'node:net'
import { requireSafe, approvedImage } from '../phase8/policy.mjs'
export const V2 = Object.freeze({profile:'internal-runner-v1',project:'stall-phase8-r2',container:'stall-phase8-r2-pg16',
  volume:'stall-phase8-r2-data',network:'stall-phase8-r2-network',database:'stall_test_phase8',runnerRepository:'stall-phase8-r2-runner'})
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export const HEX=/^[0-9a-f]{64}$/, DIGEST=/^sha256:[0-9a-f]{64}$/
export const PURPOSES=Object.freeze({bootstrap:{role:'observer',scope:'bootstrap-select',state:'bootstrap'},
  initialize:{role:'migrator',scope:'manifest-001-020',state:'bootstrap'},ready:{role:'observer',scope:'ready-select',state:'ready'},
  fixture:{role:'app',scope:'fixture-connections',state:'ready'}})
export const check=(value,code)=>requireSafe(value,'phase8_v2_'+code)
export function images(pg,runner) {
  const database=approvedImage(pg)
  check(runner?.approved===true&&runner.repository===V2.runnerRepository&&DIGEST.test(runner.digest||'')&&DIGEST.test(runner.imageId||'')&&
    HEX.test(runner.bundleSha256||'')&&typeof runner.reviewedBy==='string'&&runner.reviewedBy.trim()&&
    Number.isFinite(Date.parse(runner.reviewedAt))&&/^node@sha256:[a-f0-9]{64}$/.test(runner.baseReference||''),'image_not_approved')
  return {database,runner:{reference:V2.runnerRepository+'@'+runner.digest,imageId:runner.imageId,bundleSha256:runner.bundleSha256}}
}
export function configuration(env,action,pg,runner) {
  check(env.PHASE8_V2_PROFILE===V2.profile,'profile_rejected')
  check(env.PHASE8_V2_AUTHORIZE==='ISOLATED_V2_ONLY'&&env.PHASE8_V2_HOST_EXCLUSIVE==='I_CONTROL_LOCAL_DOCKER','not_authorized')
  check(['create-db','run'].includes(action)&&env.PHASE8_V2_ACTION===action,'action_not_authorized')
  check(UUID.test(env.PHASE8_V2_INSTANCE||'')&&env.PHASE8_V2_INSTANCE!=='43805bf5-1391-4d3f-b8ce-e3bfa9448d48','instance_rejected')
  if(action==='run') {
    check(UUID.test(env.PHASE8_V2_RUN_ID||'')&&Object.hasOwn(PURPOSES,env.PHASE8_V2_PURPOSE||''),'purpose_rejected')
    if(env.PHASE8_V2_PURPOSE==='initialize')check(env.PHASE8_V2_MIGRATE==='INITIALIZE_NEW_V2_ONCE','migration_not_authorized')
    if(env.PHASE8_V2_PURPOSE==='fixture')check(env.PHASE8_V2_TEST==='V2_FIXTURE_ONLY','fixture_not_authorized')
  }
  check(!['DATABASE_URL','PGHOST','PGPORT','PGUSER','PGPASSWORD','PGSERVICE','PGOPTIONS'].some(k=>env[k]),'connection_override_rejected')
  return {profile:V2.profile,instance:env.PHASE8_V2_INSTANCE,runId:env.PHASE8_V2_RUN_ID,purpose:env.PHASE8_V2_PURPOSE,images:images(pg,runner)}
}
export function receipt(r,c) {
  check(r?.version===2&&r.profile===V2.profile&&r.status==='created_verified'&&r.project===V2.project&&r.instance===c.instance&&
    HEX.test(r.nonce||'')&&HEX.test(r.dbId||'')&&HEX.test(r.networkId||'')&&r.volume===V2.volume&&
    r.pgReference===c.images.database.reference&&r.pgImageId===c.images.database.imageId,'receipt_rejected')
}
export function absent(rows) {
  check(!rows.some(r=>r.project===V2.project||[V2.container,V2.volume,V2.network].includes(r.name)||r.name?.startsWith(V2.project+'-runner-')),'existing_resource_refused')
}
const empty=o=>!Object.keys(o||{}).length
const noPorts=c=>empty(c.HostConfig?.PortBindings)&&c.HostConfig?.PublishAllPorts!==true&&Object.values(c.NetworkSettings?.Ports||{}).every(v=>v===null||Array.isArray(v)&&v.length===0)
const labels=(l,c,nonce)=>l?.['com.docker.compose.project']===V2.project&&l?.['stall.phase8.profile']===V2.profile&&l?.['stall.phase8.instance']===c.instance&&l?.['stall.phase8.launch']===nonce
function base(c,name,image,config,nonce,running) {
  check(c?.Name==='/'+name&&HEX.test(c.Id||'')&&c.Image===image.imageId&&c.Config?.Image===image.reference&&c.State?.Running===running,'container_rejected')
  check(labels(c.Config.Labels,config,nonce),'labels_rejected')
  const h=c.HostConfig||{}
  check(h.Privileged===false&&!(h.CapAdd||[]).length&&!(h.Devices||[]).length&&!(h.DeviceRequests||[]).length&&!(h.VolumesFrom||[]).length&&!h.PidMode&&
    !h.UsernsMode&&['','private','shareable'].includes(h.IpcMode||''),'privilege_rejected')
  check(noPorts(c),'host_port_rejected')
  check(h.NetworkMode===V2.network&&Object.keys(c.NetworkSettings.Networks||{}).join()===V2.network,'network_mode_rejected')
}
export function topology(db,volume,network,c,r,sources,{running=true,runner=null}={}) {
  receipt(r,c);base(db,V2.container,c.images.database,c,r.nonce,running)
  check(db.Id===r.dbId&&network?.Id===r.networkId,'resource_identity_rejected')
  check(volume?.Name===V2.volume&&volume.Driver==='local'&&empty(volume.Options)&&labels(volume.Labels,c,r.nonce),'volume_rejected')
  const options=network?.Options||{}
  check(network?.Name===V2.network&&network.Driver==='bridge'&&network.Internal===true&&network.EnableIPv6===false&&
    options['com.docker.network.bridge.gateway_mode_ipv4']==='isolated'&&options['com.docker.network.enable_ipv6']==='false'&&
    Object.keys(options).every(k=>['com.docker.network.bridge.gateway_mode_ipv4','com.docker.network.enable_ipv6','com.docker.network.enable_ipv4'].includes(k))&&
    labels(network.Labels,c,r.nonce),'network_rejected')
  const expected=running?[db.Id,...runner&&runner.State.Running?[runner.Id]:[]]:[]
  check(JSON.stringify(Object.keys(network.Containers||{}).sort())===JSON.stringify(expected.sort()),'network_members_rejected')
  const e=db.NetworkSettings.Networks[V2.network]
  check((!running||e.NetworkID===network.Id&&isIP(e.IPAddress)===4&&!e.Gateway)&&!e.GlobalIPv6Address,'endpoint_rejected')
  check(JSON.stringify(db.Config.Entrypoint)===JSON.stringify(['sh','/phase8/bootstrap-entrypoint.sh'])&&JSON.stringify(db.Config.Cmd)===JSON.stringify(
    ['postgres','-c','log_statement=none','-c','log_min_error_statement=panic','-c','log_parameter_max_length_on_error=0','-c','listen_addresses=*','-c','port=5432']),'entrypoint_rejected')
  const vars=db.Config.Env||[],map=new Map(vars.map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)]}))
  check(map.size===vars.length&&map.get('POSTGRES_DB')===V2.database&&map.get('POSTGRES_USER')==='stall_test_bootstrap'&&
    map.get('POSTGRES_PASSWORD_FILE')==='/run/secrets/phase8_admin_password'&&map.get('PGDATA')==='/var/lib/postgresql/data'&&
    map.get('POSTGRES_INITDB_ARGS')==='--auth-host=scram-sha-256 --auth-local=scram-sha-256'&&map.get('POSTGRES_HOST_AUTH_METHOD')==='scram-sha-256'&&
    map.get('STALL_PHASE8_INSTANCE_ID')===c.instance&&map.get('STALL_PHASE8_LAUNCH_TOKEN')===r.nonce&&map.get('STALL_PHASE8_IMAGE')===c.images.database.reference&&
    map.get('STALL_PHASE8_BOOTSTRAP_CONFIRM')==='CREATE_NEW_PHASE8_INSTANCE'&&!map.has('POSTGRES_PASSWORD')&&
    ![...map.keys()].some(k=>k.startsWith('PG')&&!['PGDATA','PG_MAJOR','PG_VERSION','PG_SHA256'].includes(k)),'database_environment_rejected')
  const mounts=db.Mounts||[]
  check(mounts.length===Object.keys(sources).length+1&&mounts.filter(m=>m.Type==='volume'&&m.Name===V2.volume&&m.Destination==='/var/lib/postgresql/data'&&m.RW===true).length===1&&
    Object.entries(sources).every(([dest,src])=>mounts.filter(m=>m.Type==='bind'&&m.Destination===dest&&sameSource(m.Source,src)&&m.RW===false).length===1),'mount_rejected')
}
export function runnerIdentity(r,c,dbReceipt,paths,{running=false}={}) {
  base(r,V2.project+'-runner-'+c.runId,c.images.runner,c,dbReceipt.nonce,running)
  const endpoint=r.NetworkSettings.Networks[V2.network]
  check(!running||endpoint.NetworkID===dbReceipt.networkId&&isIP(endpoint.IPAddress)===4&&!endpoint.Gateway&&!endpoint.GlobalIPv6Address,'runner_endpoint_rejected')
  check(r.Config.Hostname===r.Id.slice(0,12)&&r.Config.User==='1000:1000'&&r.HostConfig.ReadonlyRootfs===true&&JSON.stringify(r.HostConfig.CapDrop)===JSON.stringify(['ALL'])&&
    r.HostConfig.SecurityOpt?.includes('no-new-privileges')&&r.HostConfig.SecurityOpt.length===1&&r.HostConfig.PidsLimit===64&&
    r.HostConfig.Memory===536870912&&r.HostConfig.NanoCpus===1000000000,'runner_hardening_rejected')
  check(JSON.stringify(r.Config.Entrypoint)===JSON.stringify(['node','/opt/phase8/backend/testing/phase8-v2/runner.mjs'])&&
    JSON.stringify(r.Config.Cmd||[])===JSON.stringify([])&&r.HostConfig.RestartPolicy?.Name==='no','runner_command_rejected')
  check((r.Config.Env||[]).every(s=>['PATH','NODE_VERSION','YARN_VERSION','NODE_ENV','LANG'].includes(s.split('=')[0])),'runner_environment_rejected')
  const vars=new Map((r.Config.Env||[]).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)]}))
  check(vars.size===(r.Config.Env||[]).length&&/^\d+\.\d+\.\d+$/.test(vars.get('NODE_VERSION')||'')&&Number(vars.get('NODE_VERSION').split('.')[0])>=20,'runner_node_version_rejected')
  check(Object.keys(r.HostConfig.Tmpfs||{}).join()==='/tmp'&&r.HostConfig.Tmpfs['/tmp']==='rw,noexec,nosuid,size=16777216','runner_tmpfs_rejected')
  const expected=[['/run/phase8-grant',paths.grant,true],['/run/phase8-claim',paths.claim,false],['/run/secrets/phase8_role',paths.secret,true]]
  check(r.Mounts?.length===3&&expected.every(([dest,src,ro])=>r.Mounts.filter(m=>m.Destination===dest&&sameSource(m.Source,src)&&m.Type==='bind'&&m.RW===!ro).length===1),'runner_mount_rejected')
}
export function sameSource(a,b) {
  const norm=s=>{if(typeof s!=='string')return '';s=s.replaceAll('\\','/').replace(/^\/run\/desktop\/mnt\/host\/([a-z])\//i,'$1:/');return /^[a-z]:\//i.test(s)?s.toLowerCase():s}
  return norm(a)!==''&&norm(a)===norm(b)
}
