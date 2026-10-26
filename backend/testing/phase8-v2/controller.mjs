// Real orchestration with injectable IO. The offline tests never supply real Docker/pg.
import { configuration,check,V2,HEX,PURPOSES,receipt,absent,topology,runnerIdentity } from './policy.mjs'
import { grant } from './grants.mjs'
import { hash } from './artifact.mjs'
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
  await io.materials(c,PURPOSES[c.purpose].role)
  const r=await io.readDatabase();receipt(r,c)
  const needed={initialize:'bootstrap_verified',ready:'schema_initialized',fixture:'ready_verified'}[c.purpose]
  if(needed){const p=await io.prerequisite();check(p?.profile===V2.profile&&p.instance===c.instance&&p.dbId===r.dbId&&p.status===needed,'prerequisite_rejected')}
  await io.docker.bind();await io.docker.images(c.images)
  topology(...await io.docker.resources(),c,r,io.sources())
  const paths=await io.reserveRun(c);let stage='reserved'
  try {
    await io.docker.createRunner(c,r,paths);stage='runner-created'
    let runner=await io.docker.runner(c)
    runnerIdentity(runner,c,r,paths)
    const [db,v,n]=await io.docker.resources();topology(db,v,n,c,r,io.sources(),{runner})
    const now=io.now(),migrations=await io.migrations()
    const g={version:1,profile:V2.profile,instance:c.instance,runId:c.runId,nonce:r.nonce,dbId:r.dbId,networkId:r.networkId,runnerId:runner.Id,
      purpose:c.purpose,role:PURPOSES[c.purpose].role,scope:PURPOSES[c.purpose].scope,database:V2.database,port:5432,host:db.NetworkSettings.Networks[V2.network].IPAddress,
      pgReference:c.images.database.reference,pgImageId:c.images.database.imageId,runnerReference:c.images.runner.reference,runnerImageId:c.images.runner.imageId,
      receiptSha256:hash(Buffer.from(JSON.stringify(r))),bundleSha256:c.images.runner.bundleSha256,manifestSha256:migrations.manifestHash,issuedAt:now,expiresAt:now+60000,deadlineAt:now+300000}
    grant(g,now);await io.writeGrant(paths,g)
    await io.docker.revalidate();runnerIdentity(await io.docker.runner(c),c,r,paths)
    topology(...await io.docker.resources(),c,r,io.sources(),{runner:await io.docker.runner(c)})
    await io.docker.start(runner.Id);stage='runner-started'
    runner=await io.docker.runner(c);runnerIdentity(runner,c,r,paths,{running:runner.State.Running})
    topology(...await io.docker.resources(),c,r,io.sources(),{runner})
    const result=await io.docker.waitResult(c,runner.Id,g.deadlineAt)
    check(result?.version===1&&result.profile===V2.profile&&result.runId===c.runId&&result.dbId===r.dbId&&result.runnerId===runner.Id&&result.instance===c.instance&&
      result.purpose===c.purpose&&result.status===({bootstrap:'bootstrap_verified',initialize:'schema_initialized',ready:'ready_verified',fixture:'fixture_connected'})[c.purpose],'runner_result_rejected')
    await io.verifyClaim(paths)
    // Post-run membership/identity check is mandatory even after a success exit code.
    runner=await io.docker.runner(c);runnerIdentity(runner,c,r,paths,{running:false})
    topology(...await io.docker.resources(),c,r,io.sources(),{runner})
    await io.writeResult(c,result);return result
  }catch(e){await io.failure(c.runId,{stage,code:e.phase8Code||'phase8_v2_run_failed'});throw e}
}
