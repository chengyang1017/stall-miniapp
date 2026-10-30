// Windows host IO. No action at import; authorization is checked by controller first.
import { readFile,open,mkdir,lstat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { V2,check,UUID,purposeSpec,PURPOSES021 } from './policy.mjs'
import { docker } from './docker.mjs'
import { loadMigrations } from '../phase8/migrations.mjs'
import { claimRecovery } from './recovery.mjs'
import { hash } from './artifact.mjs'
const execute=promisify(execFile)
export async function hostMigrations(purpose,env={}){
  if(Object.hasOwn(PURPOSES021,purpose||''))return (await import('./schema021.mjs')).stageMigrations()
  // Explicit source-only projection for the already approved 020 image. Its
  // runtime still contains exactly 20 SQL files and uses the original grant.
  if(env.PHASE8_V2_BASELINE_SOURCE==='VERIFIED_021_WORKSPACE_PROJECT_020')return loadMigrations({sourceProfile:'workspace021-baseline020'})
  check(!env.PHASE8_V2_BASELINE_SOURCE,'baseline_source_rejected')
  return loadMigrations()
}
export function privateRoot(root,instance,profile) {
  check(UUID.test(instance||'')&&typeof profile==='string'&&path.isAbsolute(profile)&&root===path.join(profile,'StallPhase8-R2-'+instance),'private_root_rejected')
  check(!root.includes(',')&&!root.includes('\n'),'private_root_rejected');return root
}
const writeOnce=async(file,value)=>{const f=await open(file,'wx',0o600);try{await f.writeFile(typeof value==='string'?value:JSON.stringify(value));await f.sync()}finally{await f.close()}}
export function hostIO(env) {
  let root,paths,transport,activeRun
  const regular=async p=>{const s=await lstat(p);check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,'material_file_rejected');return s}
  const safeDir=async p=>{const s=await lstat(p);check(s.isDirectory()&&!s.isSymbolicLink(),'material_directory_rejected')}
  const rootAcl=async(p,protectedRoot=false)=>{
    check(process.platform==='win32'&&env.SystemRoot,'host_platform_rejected')
    const script="$ErrorActionPreference='Stop';$me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$a=Get-Acl -LiteralPath $env:PHASE8_V2_ACL_PATH;$rs=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $me -or $rs.Count -ne 3 -or @($rs.IdentityReference.Value|Sort-Object -Unique).Count -ne 3){exit 8};$ids=@($me,'S-1-5-18','S-1-5-32-544');foreach($r in $rs){if($r.IdentityReference.Value -notin $ids -or $r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl){exit 9};if($env:PHASE8_V2_ACL_ROOT -eq 'yes' -and ($r.IsInherited -or -not $a.AreAccessRulesProtected -or $r.InheritanceFlags -ne ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit))){exit 10}};Write-Output 'PASS'"
    try{const r=await execute(path.join(env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{env:{SystemRoot:env.SystemRoot,PHASE8_V2_ACL_PATH:p,PHASE8_V2_ACL_ROOT:protectedRoot?'yes':'no'},windowsHide:true,timeout:10000});check(r.stdout.trim()==='PASS','private_acl_rejected')}catch{check(false,'private_acl_rejected')}
  }
  const sources=()=>({'/docker-entrypoint-initdb.d/10-phase8-bootstrap.sh':fileURLToPath(new URL('../phase8/bootstrap.sh',import.meta.url)),
    '/phase8/bootstrap-entrypoint.sh':fileURLToPath(new URL('../phase8/bootstrap-entrypoint.sh',import.meta.url)),'/run/phase8-launch':paths.launch,
    ...Object.fromEntries(['admin','migrator','app','observer'].map(r=>['/run/secrets/phase8_'+r+'_password',paths.secrets[r]]))})
  const getDocker=()=>{check(paths,'materials_not_verified');return transport||=(docker(env,paths))}
  return {now:Date.now,nonce:()=>randomBytes(32).toString('hex'),sources,migrations:c=>hostMigrations(c?.purpose,env),
    approvals:async()=>[JSON.parse(await readFile(new URL('../phase8/image-approval.json',import.meta.url),'utf8')),JSON.parse(await readFile(new URL('./runner-image-approval.json',import.meta.url),'utf8'))],
    async materials(c,role){root=privateRoot(env.PHASE8_V2_PRIVATE_ROOT,c.instance,env.USERPROFILE);await safeDir(root);await rootAcl(root,true);for(const name of ['secrets','records','runs']){await safeDir(path.join(root,name));await rootAcl(path.join(root,name))}
      paths={compose:fileURLToPath(new URL('../../compose.test-v2.yml',import.meta.url)),emptyEnv:fileURLToPath(new URL('../phase8/empty.env',import.meta.url)),launch:path.join(root,'records','db.launch'),secrets:Object.fromEntries(['admin','migrator','app','observer','authorizer'].map(r=>[r,path.join(root,'secrets',r+'.secret')]))}
      const values=[];for(const r of role==='all'?['admin','migrator','app','observer']:c.purpose==='payments021'?['app','migrator','authorizer']:[role]){const p=paths.secrets[r];const s=await regular(p);await rootAcl(p);check(s.size===64,'credential_rejected');const secret=await readFile(p,'ascii');check(/^[a-f0-9]{64}$/.test(secret),'credential_rejected');values.push(secret)}check(new Set(values).size===values.length,'credential_reused')},
    docker:new Proxy({}, {get(_o,key){return (...args)=>getDocker()[key](...args)}}),
    async assertPreparedInventory(c,nonce,allowed){for(const r of await getDocker().inventory())if(r.project===V2.project||[V2.container,V2.volume,V2.network].includes(r.name))check(allowed.includes(r.kind)&&r.name===(r.kind==='volume'?V2.volume:V2.network)&&r.nonce===nonce&&r.instance===c.instance,'existing_resource_refused')
      for(const kind of allowed){const r=await getDocker().inspect(kind,kind==='volume'?V2.volume:V2.network);check(kind==='volume'?r.Driver==='local'&&!Object.keys(r.Options||{}).length:r.Internal===true&&r.Driver==='bridge'&&r.EnableIPv6===false&&r.Options?.['com.docker.network.bridge.gateway_mode_ipv4']==='isolated'&&!Object.keys(r.Containers||{}).length,'prepared_resource_rejected')}},
    async reserveDatabase(c,nonce){await writeOnce(path.join(root,'records','db.attempt.json'),{version:2,profile:V2.profile,instance:c.instance,status:'attempted',nonce});await writeOnce(paths.launch,`MODE=first\nINSTANCE=${c.instance}\nTOKEN=${nonce}\nIMAGE=${c.images.database.reference}\nCONTAINER=\n`)},
    async writeDatabase(r){await writeOnce(path.join(root,'records','db.created.json'),r)},
    async recoveryAnchor(){const p=fileURLToPath(new URL('./recovery-anchor.json',import.meta.url));const s=await regular(p);check(s.size<=16384,'recovery_anchor_rejected');return JSON.parse(await readFile(p,'utf8'))},
    async recoveryEvidence(){
      const out={};for(const [key,name]of [['attempt','db.attempt.json'],['failure','db.failed.json'],['launch','db.launch']]){
        const p=path.join(root,'records',name),s=await regular(p);await rootAcl(p);check(s.size>0&&s.size<=8192,'recovery_evidence_rejected');out[key]=await readFile(p)
      }return out
    },
    async assertRecoveryUnused(){
      for(const name of ['db.created.json','db.recovery.attempt.json','db.recovery.failed.json']){
        try{await lstat(path.join(root,'records',name));check(false,'recovery_already_attempted')}catch(e){if(e.code!=='ENOENT')throw e}
      }
    },
    async reserveRecovery(c,r,a){await claimRecovery(path.join(root,'records'),{version:1,profile:V2.profile,instance:c.instance,dbId:r.dbId,networkId:r.networkId,
      anchorSha256:hash(JSON.stringify(a)),originalFailureSha256:a.evidenceSha256.failure,status:'attempted',at:new Date().toISOString()})},
    async completeRecovery(r){await writeOnce(path.join(root,'records','db.created.json'),r)},
    async recoveryFailure(value){try{await writeOnce(path.join(root,'records','db.recovery.failed.json'),{version:1,profile:V2.profile,...value})}catch{/* No overwrite or repair, preserve original failure. */}},
    async readDatabase(){const p=path.join(root,'records','db.created.json');await regular(p);return JSON.parse(await readFile(p,'utf8'))},
    async reserveRun(c){activeRun=c.runId;const dir=path.join(root,'runs',c.runId);await mkdir(dir);await mkdir(path.join(dir,'grant'));await mkdir(path.join(dir,'claim'));await writeOnce(path.join(dir,'attempt.json'),{version:1,profile:V2.profile,instance:c.instance,runId:c.runId,purpose:c.purpose});return {grant:path.join(dir,'grant'),claim:path.join(dir,'claim'),secret:paths.secrets[purposeSpec(c.purpose).role],...c.purpose==='payments021'?{migratorSecret:paths.secrets.migrator,authorizerSecret:paths.secrets.authorizer}:{}}},
    async writeGrant(p,g){await writeOnce(path.join(p.grant,'grant.json'),g)},
    async verifyClaim(p){const f=path.join(p.claim,'consumed');await regular(f);check((await readFile(f,'utf8'))==='consumed\n','grant_consumption_missing')},
    async prerequisite(){const name=env.PHASE8_V2_PREREQUISITE;check(UUID.test(name||''),'prerequisite_rejected');const p=path.join(root,'runs',name,'result.json');await regular(p);return JSON.parse(await readFile(p,'utf8'))},
    async writeResult(c,result){await writeOnce(path.join(root,'runs',c.runId,'result.json'),result)},
    async failure(key,value){try{await writeOnce(key==='database'?path.join(root,'records','db.failed.json'):path.join(root,'runs',activeRun,'failed.json'),{version:1,profile:V2.profile,...value})}catch{/* Preserve the original error, never repair/rewrite an earlier record. */}}
  }
}
