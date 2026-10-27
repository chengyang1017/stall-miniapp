// Pure recovery decisions. Real entrypoint reads the checked-in anchor only;
// callers cannot supply another path, instance ID or resource ID through argv.
import {isIP} from 'node:net'
import {check,V2,HEX,UUID,topology} from './policy.mjs'
import {hash} from './artifact.mjs'
export const containerSpec=db=>({Id:db.Id,Created:db.Created,Image:db.Image,Config:db.Config,HostConfig:db.HostConfig,Mounts:db.Mounts})
export const volumeSpec=v=>({Name:v.Name,Driver:v.Driver,Scope:v.Scope,CreatedAt:v.CreatedAt,Options:v.Options,Labels:v.Labels})
export function recoveryReceipt(c,a,e,[db,v,n],sources,engine){
 check(a?.version===1&&a.protocol==='recover-created-v1'&&a.profile===V2.profile&&a.project===V2.project&&UUID.test(a.instance||'')&&
   a.instance===c.instance&&a.volumeName===V2.volume&&HEX.test(a.dbId||'')&&HEX.test(a.networkId||'')&&
   a.pgReference===c.images.database.reference&&a.pgImageId===c.images.database.imageId,'recovery_anchor_rejected')
 check(engine?.id===a.engineId&&engine.version===a.engineVersion&&engine.os==='linux'&&['amd64','x86_64'].includes(engine.architecture),'recovery_engine_rejected')
 check(['attempt','failure','launch'].every(k=>Buffer.isBuffer(e?.[k])&&e[k].length>0&&e[k].length<=8192&&hash(e[k])===a.evidenceSha256?.[k]),'recovery_evidence_rejected')
 let attempt,failure
 try{attempt=JSON.parse(e.attempt);failure=JSON.parse(e.failure)}catch{check(false,'recovery_evidence_rejected')}
 check(attempt.version===2&&attempt.profile===V2.profile&&attempt.instance===c.instance&&attempt.status==='attempted'&&HEX.test(attempt.nonce||'')&&
   hash(attempt.nonce)===a.nonceSha256&&failure.version===1&&failure.profile===V2.profile&&failure.stage==='container'&&failure.code==='phase8_v2_network_rejected','recovery_evidence_rejected')
 check(e.launch.toString('utf8')===`MODE=first\nINSTANCE=${c.instance}\nTOKEN=${attempt.nonce}\nIMAGE=${a.pgReference}\nCONTAINER=\n`,'recovery_launch_rejected')
 check(db?.Id===a.dbId&&db.Created===a.dbCreated&&n?.Id===a.networkId&&n.Created===a.networkCreated&&v?.CreatedAt===a.volumeCreated&&
   hash(JSON.stringify(containerSpec(db)))===a.containerSpecSha256&&hash(JSON.stringify(volumeSpec(v)))===a.volumeSpecSha256,'recovery_resource_changed')
 check(db.State?.Status==='created'&&db.State.Running===false&&db.State.Paused===false&&db.State.Restarting===false&&db.State.Dead===false&&db.State.Pid===0&&
   db.State.ExitCode===0&&db.State.Error===''&&db.State.StartedAt==='0001-01-01T00:00:00Z'&&db.State.FinishedAt==='0001-01-01T00:00:00Z'&&
   db.RestartCount===0&&db.HostConfig.RestartPolicy?.Name==='no','recovery_not_never_started')
 check(n.Scope==='local'&&n.Ingress===false&&n.ConfigOnly===false&&n.EnableIPv4===true&&Array.isArray(n.IPAM?.Config)&&n.IPAM.Config.length===1&&
   isIP(n.IPAM.Config[0].Subnet?.split('/')[0])===4&&!n.IPAM.Config[0].Gateway,'recovery_ipam_rejected')
 const r={version:2,profile:V2.profile,project:V2.project,status:'created_verified',instance:c.instance,nonce:attempt.nonce,dbId:a.dbId,networkId:a.networkId,
   volume:V2.volume,pgReference:a.pgReference,pgImageId:a.pgImageId}
 topology(db,v,n,c,r,sources,{running:false})
 return r // Internal only: the raw nonce must never be printed or put in public docs.
}
export function recoveryInventory(rows,c,r){
 const names={container:V2.container,volume:V2.volume,network:V2.network}
 const owned=rows.filter(x=>x.project===V2.project||Object.values(names).includes(x.name)||x.name?.startsWith(V2.project+'-runner-'))
 check(owned.length===3&&Object.entries(names).every(([kind,name])=>owned.filter(x=>x.kind===kind&&x.name===name&&x.project===V2.project&&x.instance===c.instance&&x.nonce===r.nonce).length===1),'recovery_inventory_rejected')
}
export async function claimRecovery(directory,record){
 const {open}=await import('node:fs/promises'),{join}=await import('node:path');let file
 try{file=await open(join(directory,'db.recovery.attempt.json'),'wx',0o600);await file.writeFile(JSON.stringify(record));await file.sync()}
 catch(e){if(e.code==='EEXIST')check(false,'recovery_already_attempted');throw e}
 finally{await file?.close()}
}
