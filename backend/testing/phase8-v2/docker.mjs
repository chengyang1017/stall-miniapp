// Private transport. Only compiled V2 operations are exposed; no arbitrary command API.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dockerEnvironment } from '../phase8/docker.mjs'
import { assertDockerContext } from '../phase8/policy.mjs'
import { V2,HEX,check } from './policy.mjs'
const execute=promisify(execFile)
export function docker(env,paths,executor=execute) {
  const clean=dockerEnvironment({...env,STALL_PHASE8_DOCKER_EXE:env.PHASE8_V2_DOCKER_EXE});let bound
  const raw=async(args,extra={},timeout=15000)=>{try{return (await executor(clean.executable,args,{env:{...clean.env,...extra},timeout,maxBuffer:4*1024*1024,windowsHide:true})).stdout}catch{check(false,'docker_command_failed')}}
  const context=async()=>{const a=JSON.parse(await raw(['context','inspect']));check(a.length===1&&a[0].Name==='desktop-linux','docker_context_rejected');assertDockerContext(a[0]);return {name:a[0].Name,endpoint:a[0].Endpoints.docker.Host}}
  const revalidate=async()=>{check(bound&&JSON.stringify(await context())===JSON.stringify(bound),'docker_context_changed')}
  const call=async(args,extra,timeout)=>{await revalidate();return raw(['--host',bound.endpoint,...args],extra,timeout)}
  const inspect=async(kind,name)=>{const a=JSON.parse(await call([kind,'inspect',name]));check(a.length===1,'resource_inspect_failed');return a[0]}
  const labels=(c,nonce)=>['--label','com.docker.compose.project='+V2.project,'--label','stall.phase8.profile='+V2.profile,'--label','stall.phase8.instance='+c.instance,'--label','stall.phase8.launch='+nonce]
  return {revalidate,inspect,
    async identity(){const i=JSON.parse(await call(['info','--format','{{json .}}']));return {id:i.ID,version:i.ServerVersion,os:i.OSType,architecture:i.Architecture}},
    async bind(){bound=await context();const info=JSON.parse(await call(['info','--format','{{json .}}']));check(info.OSType==='linux','docker_os_rejected');return bound},
    async images(images){for(const [kind,image]of Object.entries(images)){const m=await inspect('image',image.reference);check(m.Id===image.imageId&&m.Os==='linux'&&m.Architecture==='amd64'&&m.RepoDigests?.some(d=>d===image.reference||d==='docker.io/library/'+image.reference),'local_image_rejected');if(kind==='runner')check(m.Config?.Labels?.['stall.phase8.bundle']===image.bundleSha256,'runner_bundle_label_rejected')}},
    async inventory(){const out=[];for(const kind of ['container','volume','network']){const text=await call([kind,'ls',...(kind==='container'?['--all']:[]),'--format','{{json .}}']);for(const line of text.split(/\r?\n/).filter(Boolean)){const a=JSON.parse(line),ls=typeof a.Labels==='string'?Object.fromEntries(a.Labels.split(',').map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)]})):a.Labels||{};out.push({kind,name:a.Name||a.Names,project:ls['com.docker.compose.project'],nonce:ls['stall.phase8.launch'],instance:ls['stall.phase8.instance']})}}return out},
    async prepare(kind,c,nonce){check(['volume','network'].includes(kind),'resource_kind_rejected');await call(kind==='volume'?['volume','create',...labels(c,nonce),'--label','com.docker.compose.volume=data',V2.volume]:['network','create','--internal','--ipv6=false','--opt','com.docker.network.bridge.gateway_mode_ipv4=isolated','--opt','com.docker.network.enable_ipv6=false',...labels(c,nonce),'--label','com.docker.compose.network=isolated',V2.network])},
    async createDatabase(c,nonce){await call(['compose','--project-name',V2.project,'--file',paths.compose,'--env-file',paths.emptyEnv,'create','--no-recreate','--no-build','--pull','never','postgres'],{
      PHASE8_V2_PG_IMAGE:c.images.database.reference,PHASE8_V2_INSTANCE:c.instance,PHASE8_V2_NONCE:nonce,PHASE8_V2_LAUNCH_FILE:paths.launch,
      ...Object.fromEntries(['admin','migrator','app','observer'].map(role=>['PHASE8_V2_'+role.toUpperCase()+'_FILE',paths.secrets[role]]))})},
    resources:async()=>[await inspect('container',V2.container),await inspect('volume',V2.volume),await inspect('network',V2.network)],
    runner:c=>inspect('container',V2.project+'-runner-'+c.runId),
    async createRunner(c,r,p){await call(['container','create','--name',V2.project+'-runner-'+c.runId,'--pull','never',...labels(c,r.nonce),
      '--network',V2.network,'--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory','536870912','--cpus','1','--restart','no',
      '--tmpfs','/tmp:rw,noexec,nosuid,size=16777216','--mount','type=bind,source='+p.grant+',target=/run/phase8-grant,readonly',
      '--mount','type=bind,source='+p.claim+',target=/run/phase8-claim','--mount','type=bind,source='+p.secret+',target=/run/secrets/phase8_role,readonly',
      ...c.purpose==='payments021'?['--mount','type=bind,source='+p.migratorSecret+',target=/run/secrets/phase8_migrator,readonly','--mount','type=bind,source='+p.authorizerSecret+',target=/run/secrets/phase8_authorizer,readonly']:[],
      c.images.runner.reference])},
    async start(id){check(HEX.test(id),'container_id_rejected');await call(['container','start',id])},
    async waitResult(c,id,deadline){check(HEX.test(id),'container_id_rejected');const timeout=deadline-Date.now()+5000;check(timeout>0&&timeout<=305000,'runtime_expired');const code=(await call(['container','wait',id],{},timeout)).trim();check(code==='0','runner_exit_failed');const text=await call(['container','logs',id]);let value;try{value=JSON.parse(text.trim())}catch{check(false,'runner_output_rejected')};check(Object.keys(value).every(k=>['version','profile','runId','instance','dbId','runnerId','purpose','status','ready','distinctConnections','schemaVersion','planSha256','catalogSha256',...['business','business021','payments021'].includes(c.purpose)?['namespace','passed','failed','skipped','results']:[]].includes(k)),'runner_output_rejected');return value}
  }
}
