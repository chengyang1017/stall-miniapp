// Real orchestration with injectable IO. The offline tests never supply real Docker/pg.
import { configuration,check,V2,HEX,PURPOSES,PURPOSES021,purposeSpec,receipt,absent,topology,runnerIdentity } from './policy.mjs'
import { grant } from './grants.mjs'
import { hash } from './artifact.mjs'
import { recoveryReceipt,recoveryInventory,containerSpec,volumeSpec } from './recovery.mjs'
export async function createDatabase(env,io) {
  const approvals=await io.approvals(),c=configuration(env,'create-db',...approvals)
  await io.materials(c,'all')
  await io.docker.bind();await io.docker.images(c.images)
  absent(await io.docker.inventory())
  const nonce=io.nonce();check(HEX.test(nonce),'nonce_rejected')
  await io.reserveDatabase(c,nonce)
  let stage='reserved'
  try {
    for(const kind of ['volume','network']){
      await io.docker.revalidate()
      await io.assertPreparedInventory(c,nonce,kind==='volume'?[]:['volume'])
      await io.docker.prepare(kind,c,nonce);stage=kind
      await io.assertPreparedInventory(c,nonce,kind==='volume'?['volume']:['volume','network'])
    }
    await io.docker.revalidate();await io.assertPreparedInventory(c,nonce,['volume','network'])
    await io.docker.createDatabase(c,nonce);stage='container'
    const rsrc=await io.docker.resources(),[db,v,n]=rsrc
    const r={version:2,profile:V2.profile,project:V2.project,status:'created_verified',instance:c.instance,nonce,dbId:db.Id,networkId:n.Id,volume:V2.volume,pgReference:c.images.database.reference,pgImageId:c.images.database.imageId}
    topology(db,v,n,c,r,io.sources(),{running:false})
    await io.docker.revalidate();topology(...await io.docker.resources(),c,r,io.sources(),{running:false})
    await io.docker.start(db.Id);stage='started'
    topology(...await io.docker.resources(),c,r,io.sources())
    await io.writeDatabase(r);return {status:'created_verified',bootstrapVerified:false,ready:false,dbId:r.dbId}
  }catch(e){await io.failure('database',{stage,code:e.phase8Code||'phase8_v2_creation_failed'});throw e}
}
export async function run(env,io) {
  const approvals=await io.approvals(),c=configuration(env,'run',...approvals)
  const staged=Object.hasOwn(PURPOSES021,c.purpose),spec=purposeSpec(c.purpose)
  await io.materials(c,spec.role)
  const r=await io.readDatabase();receipt(r,c)
  const needed={initialize:'bootstrap_verified',ready:'schema_initialized',fixture:'ready_verified',business:'ready_verified',upgrade021:'ready_verified',ready021:'schema021_initialized',business021:'ready021_verified',payments021:'ready021_verified'}[c.purpose]
  let prerequisite
  if(needed){prerequisite=await io.prerequisite();check(prerequisite?.profile===V2.profile&&prerequisite.instance===c.instance&&prerequisite.dbId===r.dbId&&prerequisite.status===needed,'prerequisite_rejected')}
  const migrations=await io.migrations(c)
  if(staged){check(migrations.plan?.manifestSha256===migrations.manifestHash&&HEX.test(migrations.baseline?.manifestHash||''),'schema021_manifest_rejected')
    if(c.purpose!=='upgrade021')check(prerequisite.schemaVersion===21&&prerequisite.planSha256===migrations.manifestHash,'schema021_prerequisite_rejected')}
  await io.docker.bind();await io.docker.images(c.images)
  topology(...await io.docker.resources(),c,r,io.sources())
  const paths=await io.reserveRun(c);let stage='reserved'
  try {
    await io.docker.createRunner(c,r,paths);stage='runner-created'
    let runner=await io.docker.runner(c)
    runnerIdentity(runner,c,r,paths)
    const [db,v,n]=await io.docker.resources();topology(db,v,n,c,r,io.sources(),{runner})
    const now=io.now()
    const g={version:staged?2:1,profile:V2.profile,instance:c.instance,runId:c.runId,nonce:r.nonce,dbId:r.dbId,networkId:r.networkId,runnerId:runner.Id,
      purpose:c.purpose,role:spec.role,scope:spec.scope,database:V2.database,port:5432,host:db.NetworkSettings.Networks[V2.network].IPAddress,
      pgReference:c.images.database.reference,pgImageId:c.images.database.imageId,runnerReference:c.images.runner.reference,runnerImageId:c.images.runner.imageId,
      receiptSha256:hash(Buffer.from(JSON.stringify(r))),bundleSha256:c.images.runner.bundleSha256,manifestSha256:migrations.manifestHash,issuedAt:now,expiresAt:now+60000,deadlineAt:now+300000,
      ...staged?{schemaVersion:21,baselineManifestSha256:migrations.baseline.manifestHash,planSha256:migrations.manifestHash,prerequisiteSha256:hash(JSON.stringify(prerequisite))}:{}}
    grant(g,now);await io.writeGrant(paths,g)
    await io.docker.revalidate();runnerIdentity(await io.docker.runner(c),c,r,paths)
    topology(...await io.docker.resources(),c,r,io.sources(),{runner:await io.docker.runner(c)})
    await io.docker.start(runner.Id);stage='runner-started'
    runner=await io.docker.runner(c);runnerIdentity(runner,c,r,paths,{running:runner.State.Running})
    topology(...await io.docker.resources(),c,r,io.sources(),{runner})
    const result=await io.docker.waitResult(c,runner.Id,g.deadlineAt)
    check(result?.version===1&&result.profile===V2.profile&&result.runId===c.runId&&result.dbId===r.dbId&&result.runnerId===runner.Id&&result.instance===c.instance&&
      result.purpose===c.purpose&&result.status===({bootstrap:'bootstrap_verified',initialize:'schema_initialized',ready:'ready_verified',fixture:'fixture_connected',business:'business_finished',upgrade021:'schema021_initialized',ready021:'ready021_verified',business021:'business021_finished',payments021:'payments021_finished'})[c.purpose],'runner_result_rejected')
    if(staged)check(result.schemaVersion===21&&result.planSha256===g.planSha256,'schema021_result_rejected')
    const reporting=['business','business021','payments021'].includes(c.purpose)
    if(reporting)check(Array.isArray(result.results)&&result.results.length>0&&result.results.length<=50&&
      new Set(result.results.map(x=>x.name)).size===result.results.length&&result.results.every(x=>typeof x.name==='string'&&['passed','failed'].includes(x.status))&&
      result.passed===result.results.filter(x=>x.status==='passed').length&&result.failed===result.results.filter(x=>x.status==='failed').length&&result.skipped===0,'business_report_rejected')
    if(c.purpose==='business021'||c.purpose==='payments021')check(result.results.length===(c.purpose==='business021'?26:11),'schema021_case_count_rejected')
    if(c.purpose==='business021'||c.purpose==='payments021'){
      const cases=c.purpose==='business021'?(await import('./business.mjs')).BUSINESS_CASES:(await import('./payments021.mjs')).PAYMENT_CASES
      check(JSON.stringify(result.results.map(r=>r.name))===JSON.stringify(cases.map(r=>r.name)),'schema021_case_names_rejected')
    }
    await io.verifyClaim(paths)
    // Post-run membership/identity check is mandatory even after a success exit code.
    runner=await io.docker.runner(c);runnerIdentity(runner,c,r,paths,{running:false})
    topology(...await io.docker.resources(),c,r,io.sources(),{runner})
    await io.writeResult(c,result)
    if(reporting)check(Number.isInteger(result.passed)&&result.passed>0&&result.failed===0,'business_assertions_failed')
    return result
  }catch(e){await io.failure(c.runId,{stage,code:e.phase8Code||'phase8_v2_run_failed'});throw e}
}
export async function recoverCreated(env,io){
 const approvals=await io.approvals(),c=configuration(env,'recover-created',...approvals)
 const a=await io.recoveryAnchor()
 // Reject an unrelated instance before reading any credentials or Docker IO.
 check(a.instance===c.instance,'recovery_anchor_rejected')
 await io.materials(c,'all');await io.assertRecoveryUnused()
 await io.docker.bind();await io.docker.images(c.images)
 const inspect=async()=>{
  const resources=await io.docker.resources(),e=await io.recoveryEvidence()
  const r=recoveryReceipt(c,a,e,resources,io.sources(),await io.docker.identity())
  recoveryInventory(await io.docker.inventory(),c,r);return r
 }
 const r=await inspect()
 await io.reserveRecovery(c,r,a) // wx + fsync; never erased, even if the start fails.
 let stage='reserved'
 try{
  await io.docker.revalidate();await io.docker.images(c.images);await inspect()
  await io.docker.start(r.dbId);stage='started'
  const [db,v,n]=await io.docker.resources();topology(db,v,n,c,r,io.sources())
  check(db.Id===a.dbId&&db.Created===a.dbCreated&&n.Id===a.networkId&&n.Created===a.networkCreated&&v.CreatedAt===a.volumeCreated,'recovery_resource_changed')
  check(hash(JSON.stringify(containerSpec(db)))===a.containerSpecSha256&&hash(JSON.stringify(volumeSpec(v)))===a.volumeSpecSha256,'recovery_resource_changed')
  const e=await io.recoveryEvidence();check(['attempt','failure','launch'].every(k=>hash(e[k])===a.evidenceSha256[k]),'recovery_evidence_rejected')
  await io.docker.revalidate();const engine=await io.docker.identity()
  check(engine.id===a.engineId&&engine.version===a.engineVersion,'recovery_engine_rejected')
  recoveryInventory(await io.docker.inventory(),c,r)
  await io.completeRecovery({...r,recovery:{protocol:'recover-created-v1',anchorSha256:hash(JSON.stringify(a)),originalFailureSha256:a.evidenceSha256.failure}})
  return {status:'created_verified',recoveredCreated:true,dbId:r.dbId,bootstrapVerified:false,ready:false}
 }catch(e){await io.recoveryFailure({stage,code:e.phase8Code||'phase8_v2_recovery_failed'});throw e}
}
