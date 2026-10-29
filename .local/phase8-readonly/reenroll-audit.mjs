// Read-only observation; this file cannot enroll or recover resources.
import {execFileSync} from 'node:child_process'
import {readFileSync,lstatSync,readdirSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {V2,images,topology} from '../../backend/testing/phase8-v2/policy.mjs'
import {containerSpec,volumeSpec,canonicalResource,resourceFingerprintV2,recoveryInventory} from '../../backend/testing/phase8-v2/recovery.mjs'
import {hash} from '../../backend/testing/phase8-v2/artifact.mjs'
const anchorPath='backend/testing/phase8-v2/recovery-anchor.json',anchorBytes=readFileSync(anchorPath),a=JSON.parse(anchorBytes)
const privateRoot='C:/Users/USER/StallPhase8-R2-'+a.instance,records=privateRoot+'/records/'
const pg=JSON.parse(readFileSync('backend/testing/phase8/image-approval.json')),runner=JSON.parse(readFileSync('backend/testing/phase8-v2/runner-image-approval.json'))
const c={instance:a.instance,images:images(pg,runner)}
const exe='C:/Users/USER/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe',endpoint='npipe:////./pipe/dockerDesktopLinuxEngine'
const call=args=>execFileSync(exe,args,{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:8*1024*1024})
const docker=(...args)=>call(['--host',endpoint,...args]),json=(...args)=>JSON.parse(docker(...args))
const checkResults=[]
function check(name,fn){try{const value=fn();if(value===false)throw Error('condition_false');checkResults.push({name,status:'passed'});return value}catch(e){checkResults.push({name,status:'failed',code:e.phase8Code||e.code||e.message});return null}}
const context=JSON.parse(call(['context','inspect']))
check('local_context',()=>context.length===1&&context[0].Name==='desktop-linux'&&context[0].Endpoints.docker.Host===endpoint&&!context[0].Endpoints.docker.SkipTLSVerify)
const info=json('info','--format','{{json .}}')
check('engine_identity',()=>info.ID===a.engineId&&info.ServerVersion===a.engineVersion&&info.OSType==='linux'&&['amd64','x86_64'].includes(info.Architecture))
const db=json('container','inspect',a.dbId)[0],v=json('volume','inspect',a.volumeName)[0],n=json('network','inspect',a.networkId)[0]
check('exact_ids_and_creation_times',()=>db.Id===a.dbId&&db.Created===a.dbCreated&&n.Id===a.networkId&&n.Created===a.networkCreated&&v.Name===a.volumeName&&v.CreatedAt===a.volumeCreated)
const ev=Object.fromEntries(Object.entries({attempt:'db.attempt.json',failure:'db.failed.json',launch:'db.launch'}).map(([k,f])=>[k,readFileSync(records+f)]))
check('original_evidence_bytes',()=>Object.keys(ev).every(k=>hash(ev[k])===a.evidenceSha256[k]))
const attempt=JSON.parse(ev.attempt),failure=JSON.parse(ev.failure)
check('original_failure_and_launch_semantics',()=>attempt.version===2&&attempt.profile===V2.profile&&attempt.instance===a.instance&&attempt.status==='attempted'&&hash(attempt.nonce)===a.nonceSha256&&failure.version===1&&failure.profile===V2.profile&&failure.stage==='container'&&failure.code==='phase8_v2_network_rejected'&&ev.launch.toString()===`MODE=first\nINSTANCE=${a.instance}\nTOKEN=${attempt.nonce}\nIMAGE=${a.pgReference}\nCONTAINER=\n`)
check('never_started_state',()=>db.State.Status==='created'&&db.State.Running===false&&db.State.Paused===false&&db.State.Restarting===false&&db.State.Dead===false&&db.State.Pid===0&&db.State.ExitCode===0&&db.State.Error===''&&db.State.StartedAt==='0001-01-01T00:00:00Z'&&db.State.FinishedAt==='0001-01-01T00:00:00Z'&&db.RestartCount===0&&db.HostConfig.RestartPolicy.Name==='no')
const sources={
 '/docker-entrypoint-initdb.d/10-phase8-bootstrap.sh':resolve('backend/testing/phase8/bootstrap.sh'),
 '/phase8/bootstrap-entrypoint.sh':resolve('backend/testing/phase8/bootstrap-entrypoint.sh'),
 '/run/phase8-launch':records+'db.launch',
 ...Object.fromEntries(['admin','migrator','app','observer'].map(role=>['/run/secrets/phase8_'+role+'_password',privateRoot+'/secrets/'+role+'.secret']))}
// Internal descriptor for pure topology validation, never a created receipt.
const descriptor={version:2,profile:V2.profile,project:V2.project,status:'created_verified',instance:a.instance,nonce:attempt.nonce,dbId:a.dbId,networkId:a.networkId,volume:V2.volume,pgReference:a.pgReference,pgImageId:a.pgImageId}
check('independent_full_topology',()=>{topology(db,v,n,c,descriptor,sources,{running:false});return true})
check('network_ipam_scope',()=>n.Scope==='local'&&n.Ingress===false&&n.ConfigOnly===false&&n.EnableIPv4===true&&n.IPAM.Driver==='default'&&n.IPAM.Config.length===1&&n.IPAM.Config[0].Subnet==='172.23.0.0/16'&&!n.IPAM.Config[0].Gateway)
check('volume_scope_and_legacy_digest',()=>v.Scope==='local'&&hash(JSON.stringify(volumeSpec(v)))===a.volumeSpecSha256)
const inventory=[]
for(const kind of ['container','volume','network'])for(const line of docker(kind,'ls',...(kind==='container'?['--all']:[]),'--format','{{json .}}').split(/\r?\n/).filter(Boolean)){
 const r=JSON.parse(line),labels=typeof r.Labels==='string'?Object.fromEntries(r.Labels.split(',').map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)]})):r.Labels||{}
 inventory.push({kind,name:r.Name||r.Names,project:labels['com.docker.compose.project'],instance:labels['stall.phase8.instance'],nonce:labels['stall.phase8.launch']})
}
check('exact_three_resource_inventory',()=>{recoveryInventory(inventory,c,descriptor);return true})
const imageChecks=[]
for(const [kind,expected]of Object.entries({...c.images,node:{reference:runner.baseReference,imageId:runner.baseReference.replace('node@','')}})){
 const im=json('image','inspect',expected.reference)[0]
 check('image_'+kind,()=>im.Id===expected.imageId&&im.Os==='linux'&&im.Architecture==='amd64'&&im.RepoDigests.some(d=>d===expected.reference||d==='docker.io/library/'+expected.reference)&&(kind!=='runner'||im.Config.Labels['stall.phase8.bundle']===expected.bundleSha256))
 imageChecks.push({kind,id:im.Id,created:im.Created,reference:expected.reference,repoDigests:im.RepoDigests,platform:im.Os+'/'+im.Architecture,bundle:kind==='runner'?im.Config.Labels['stall.phase8.bundle']:undefined})
}
const bindingFiles=Object.entries(sources).map(([destination,path])=>{const s=lstatSync(path);return {destination,path,regular:s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,size:s.size,...(!destination.startsWith('/run/secrets/')?{sha256:hash(readFileSync(path))}:{credentialContentRead:false})}})
check('bind_source_file_types_and_sizes',()=>bindingFiles.every(f=>f.regular&&(!f.destination.startsWith('/run/secrets/')||f.size===64)))
const aclScript="$ErrorActionPreference='Stop';$me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$root='"+privateRoot+"';$paths=@($root,(Join-Path $root 'secrets'),(Join-Path $root 'records'),(Join-Path $root 'runs'))+@(Get-ChildItem -LiteralPath $root -Recurse -Force|ForEach-Object FullName);$bad=@();foreach($p in ($paths|Select-Object -Unique)){$a=Get-Acl -LiteralPath $p;$rs=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));$ids=@($me,'S-1-5-18','S-1-5-32-544');if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $me -or $rs.Count -ne 3 -or @($rs.IdentityReference.Value|Sort-Object -Unique).Count -ne 3){$bad+=$p;continue};foreach($r in $rs){if($r.IdentityReference.Value -notin $ids -or $r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl){$bad+=$p}};if($p -eq $root -and (-not $a.AreAccessRulesProtected -or @($rs|Where-Object IsInherited).Count -gt 0)){$bad+=$p}};@{checked=@($paths|Select-Object -Unique).Count;failed=@($bad|Select-Object -Unique).Count}|ConvertTo-Json -Compress"
const acl=check('private_material_acl',()=>{const r=JSON.parse(execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-Command',aclScript],{encoding:'utf8',windowsHide:true}));if(r.failed)throw Error('acl_rejected');return r})
check('no_created_or_recovery_receipts',()=>!readdirSync(records).some(f=>f==='db.created.json'||f.startsWith('db.recovery.')))
const history=JSON.parse(readFileSync('docs/testing/PHASE8_V2_BOOTSTRAP_START_AUDIT.json')),prior=history.diagnosis.observations[0]
const historyNetwork=JSON.parse(readFileSync('docs/testing/PHASE8_V2_NETWORK_COMPATIBILITY_AUDIT.json')).network
const currentNetwork=structuredClone(n);if(currentNetwork.Labels)currentNetwork.Labels['stall.phase8.launch']='[REDACTED: verified by hash]'
const networkFields=['Name','Id','Created','Scope','Driver','EnableIPv4','EnableIPv6','IPAM','Internal','Attachable','Ingress','ConfigFrom','ConfigOnly','Options','Labels','Containers']
const networkComparison=networkFields.map(field=>({field,equal:JSON.stringify(canonicalResource(currentNetwork[field]))===JSON.stringify(canonicalResource(historyNetwork[field]))}))
const hashes={rawContainer:hash(JSON.stringify(containerSpec(db))),originalContainer:a.containerSpecSha256,config:hash(JSON.stringify(db.Config)),hostConfig:hash(JSON.stringify(db.HostConfig)),mountSet:hash(JSON.stringify([...db.Mounts].sort((a,b)=>a.Destination.localeCompare(b.Destination)))),volume:hash(JSON.stringify(volumeSpec(v))),canonicalV2:resourceFingerprintV2(db,v).sha256}
const comparisons={configSameAsHistoricalDiagnosis:hashes.config===prior.configSha256,hostConfigSameAsHistoricalDiagnosis:hashes.hostConfig===prior.hostConfigSha256,mountSetSameAsHistoricalDiagnosis:hashes.mountSet===prior.mountSetSha256,originalContainerDigestMatches:hashes.rawContainer===a.containerSpecSha256,networkFields:networkComparison}
check('diagnostic_history_components',()=>comparisons.configSameAsHistoricalDiagnosis&&comparisons.hostConfigSameAsHistoricalDiagnosis&&comparisons.mountSetSameAsHistoricalDiagnosis&&networkComparison.every(f=>f.equal))
const repeated=[]
for(let i=0;i<2;i++){const d=json('container','inspect',a.dbId)[0],vol=json('volume','inspect',a.volumeName)[0];repeated.push(resourceFingerprintV2(d,vol).sha256)}
check('stable_canonical_observation',()=>repeated.every(h=>h===hashes.canonicalV2))
check('original_anchor_and_evidence_unchanged_after_inspection',()=>hash(readFileSync(anchorPath))===hash(anchorBytes)&&Object.entries({attempt:'db.attempt.json',failure:'db.failed.json',launch:'db.launch'}).every(([k,f])=>hash(readFileSync(records+f))===a.evidenceSha256[k]))
const result={version:1,kind:'readonly-independent-identity-audit-not-registration',checkedAtUTC:new Date().toISOString(),checkedAtLocal:new Date().toLocaleString('sv-SE',{timeZone:'Asia/Kuala_Lumpur'})+' UTC+8',instance:a.instance,dbId:a.dbId,dbCreated:db.Created,networkId:a.networkId,networkCreated:n.Created,volume:v.Name,volumeCreated:v.CreatedAt,engine:{id:info.ID,version:info.ServerVersion},originalAnchorSha256:hash(anchorBytes),failure,checks:checkResults,hashes,comparisons,images:imageChecks,acl,bindings:bindingFiles.map(({path,...rest})=>rest),mounts:db.Mounts.map(({Type,Name,Destination,RW,Propagation})=>({Type,Name,Destination,RW,Propagation})),network:{internal:n.Internal,ipv4:n.EnableIPv4,ipv6:n.EnableIPv6,ipam:n.IPAM,options:n.Options,members:Object.keys(n.Containers||{})},recordFiles:readdirSync(records),registrationCreated:false,limitations:['No complete original container spec to prove equivalence to original anchor','No stopped-volume content inspection or proof of never externally written volume','No runtime egress test or bootstrap/SQL verification','No current source to approved runner bundle equivalence'],dockerMutations:false,databaseConnections:false}
const out='.local/phase8-readonly/identity-audit-'+Date.now()+'.json';writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({audit:out,...result},null,2))
