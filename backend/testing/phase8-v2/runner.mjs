// Fixed jobs only. Never invokes a shell, child process, Docker or API server.
import { readFile,open,lstat } from 'node:fs/promises'
import { hostname } from 'node:os'
import { pathToFileURL } from 'node:url'
import { check,PURPOSES } from './policy.mjs'
import { grant,consume } from './grants.mjs'
import { verifyArtifact } from './artifact.mjs'
import { loadMigrations } from '../phase8/migrations.mjs'
import { openSQL,inspectBootstrap,verifySQL } from './sql.mjs'
import { initialize } from './initialize.mjs'
import { fixture } from './fixture.mjs'
import { runBusiness } from './business.mjs'
export async function claimOnce(directory) {
  const {join}=await import('node:path');let f
  try{f=await open(join(directory,'consumed'),'wx',0o600);await f.writeFile('consumed\n');await f.sync()}
  catch{check(false,'grant_already_consumed')}finally{await f?.close()}
}
export async function runJob(io) {
  const g=grant(await io.readGrant(),io.now());let pool,timer
  check(!Object.keys(io.env||{}).some(k=>k==='DATABASE_URL'||k.startsWith('PG')||k.startsWith('STALL_PHASE8_')||k.startsWith('PHASE8_V2_')),'runner_environment_rejected')
  await io.verifyArtifact(g.bundleSha256)
  const migrations=await io.migrations();check(migrations.manifestHash===g.manifestSha256,'manifest_rejected')
  await consume(g,io)
  try {
    timer=io.watchdog(g.deadlineAt-io.now(),()=>pool?.end())
    pool=await openSQL(g,await io.secret(),migrations,{makePool:io.makePool,now:io.now,onPool:p=>{pool=p}})
    let result
    if(g.purpose==='bootstrap')result=await inspectBootstrap(pool,g,migrations)
    else if(g.purpose==='initialize')result=await initialize(pool,g,migrations)
    else if(g.purpose==='ready'){
      const c=await pool.connect();try{await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await verifySQL(c,g,migrations,'ready');await c.query('ROLLBACK')}finally{c.release()}
      result={status:'ready_verified',ready:true}
    }else if(g.purpose==='business')result=await runBusiness(pool,g)
    else{
      const f=fixture(pool,g);const pids=await f.connections(async x=>x.pids)
      result={status:'fixture_connected',ready:true,distinctConnections:pids.length}
    }
    check(io.now()<=g.deadlineAt,'runtime_expired')
    return {version:1,profile:g.profile,runId:g.runId,instance:g.instance,dbId:g.dbId,runnerId:g.runnerId,purpose:g.purpose,...result}
  }finally{if(timer)io.clearWatchdog(timer);await pool?.end()}
}
export function realRunnerIO() {
  const regular=async p=>{const s=await lstat(p);check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,'runner_file_rejected');return s}
  return {env:process.env,now:Date.now,hostname,
    async readGrant(){await regular('/run/phase8-grant/grant.json');return JSON.parse(await readFile('/run/phase8-grant/grant.json','utf8'))},
    verifyArtifact:h=>verifyArtifact('/opt/phase8',h),migrations:loadMigrations,
    claim:()=>claimOnce('/run/phase8-claim'),
    async secret(){const s=await regular('/run/secrets/phase8_role');check(s.size===64,'credential_rejected');return readFile('/run/secrets/phase8_role','ascii')},
    watchdog(ms,close){check(ms>0&&ms<=300000,'runtime_expired');return setTimeout(()=>{close();process.exit(124)},ms)},clearWatchdog:clearTimeout}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==2){console.error('phase8_v2_runner_command_rejected');process.exitCode=1}
  else try{console.log(JSON.stringify(await runJob(realRunnerIO())))}catch(e){console.error(/^phase8_[a-z0-9_]+$/.test(e?.phase8Code||'')?e.phase8Code:'phase8_v2_runner_failed');process.exitCode=1}
}
