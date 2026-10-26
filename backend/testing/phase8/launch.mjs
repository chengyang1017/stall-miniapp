// Orchestration: testable with fake IO; production IO is supplied only by CLI.
// Import is inert. No rollback/cleanup of created Docker resources on failure.
import { randomBytes } from 'node:crypto'
import { approvedImage,requireSafe,assertResources,TARGET } from './policy.mjs'
export function launchConfig(env,mode,approval) {
  requireSafe(mode==='first'||mode==='restart','phase8_invalid_launch_mode')
  requireSafe(env.STALL_PHASE8_AUTHORIZE==='LOCAL_PHASE8_DATABASE_ACCESS','phase8_access_not_authorized')
  requireSafe(env.STALL_PHASE8_HOST_EXCLUSIVE==='I_CONTROL_LOCAL_DOCKER','phase8_host_exclusivity_not_acknowledged')
  requireSafe(mode==='first'?env.STALL_PHASE8_START==='CREATE_FIRST_ONLY':env.STALL_PHASE8_RESTART==='RESTART_EXISTING_ONLY','phase8_launch_not_authorized')
  requireSafe(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(env.STALL_PHASE8_INSTANCE_ID||''),'phase8_invalid_instance_id')
  return {instance:env.STALL_PHASE8_INSTANCE_ID,image:approvedImage(approval),approval,mode}
}
export function assertInventory(inventory,nonce=null,allowed=[]) {
  for(const r of inventory) {
    const named=({container:TARGET.container,volume:TARGET.volume,network:TARGET.network})[r.kind]
    if(r.project===TARGET.project || r.name===named) requireSafe(nonce && r.nonce===nonce && allowed.includes(r.kind) && r.name===named,'phase8_existing_resource_refused')
  }
}
export function assertPrepared(kind,value,record) {
  requireSafe(value?.Name===(kind==='volume'?TARGET.volume:TARGET.network) && value.Labels?.['stall.phase8.launch']===record.nonce &&
    value.Labels?.['stall.phase8.instance']===record.instance && value.Labels?.['com.docker.compose.project']===TARGET.project &&
    value.Labels?.['stall.phase8.scope']===TARGET.scope,'phase8_existing_resource_refused')
  requireSafe(kind==='volume'?value.Driver==='local'&&!Object.keys(value.Options||{}).length:
    value.Driver==='bridge'&&value.Internal===true&&!Object.keys(value.Containers||{}).length,'phase8_prepared_resource_rejected')
}
export async function controlledLaunch(env,mode,io) {
  const config=launchConfig(env,mode,io.approval) // Before lock files or Docker calls.
  let lock,record
  try {
    lock=await io.lock(mode)
    const binding=await io.docker.bind()
    await io.docker.ensureImage(config.image)
    if(mode==='first') {
      assertInventory(await io.docker.inventory())
      const nonce=io.nonce?io.nonce():randomBytes(32).toString('hex')
      requireSafe(/^[a-f0-9]{64}$/.test(nonce),'phase8_invalid_launch_token')
      record={version:1,instance:config.instance,image:config.image.reference,imageId:config.image.imageId,nonce,endpoint:binding.endpoint,context:binding.name,status:'creating'}
      await lock.write(record)
      for(const kind of ['volume','network']) {
        await io.docker.revalidate();assertInventory(await io.docker.inventory(),nonce,kind==='volume'?[]:['volume'])
        await io.create(kind,record)
        assertInventory(await io.docker.inventory(),nonce,kind==='volume'?['volume']:['volume','network'])
        assertPrepared(kind,await io.docker.inspect(kind,kind==='volume'?TARGET.volume:TARGET.network),record)
      }
      // Compose create uses existing nonce-labelled resources; never runs PG.
      await lock.launch(io.receiptText(record,'first'))
      await io.docker.revalidate();assertInventory(await io.docker.inventory(),nonce,['volume','network'])
      for(const kind of ['volume','network'])assertPrepared(kind,await io.docker.inspect(kind,kind==='volume'?TARGET.volume:TARGET.network),record)
      await io.createContainer(record,lock.paths.launch)
      const resources=await io.docker.inspectAll()
      assertResources(...resources,config.instance,{approval:io.approval,nonce,running:false})
      record.containerId=resources[0].Id
    } else {
      record=await io.previous(config)
      requireSafe(record.endpoint===binding.endpoint&&record.context===binding.name,'phase8_docker_context_changed')
      const resources=await io.docker.inspectAll()
      requireSafe(resources[0].Id===record.containerId,'phase8_receipt_identity_rejected')
      assertResources(...resources,config.instance,{approval:io.approval,nonce:record.nonce,running:false})
      await lock.launch(io.receiptText(record,'restart'))
    }
    // Last reinspection, then start immutable container ID, never a mutable name.
    await io.docker.revalidate()
    const last=await io.docker.inspectAll()
    requireSafe(last[0].Id===record.containerId,'phase8_resource_changed_before_start')
    assertResources(...last,config.instance,{approval:io.approval,nonce:record.nonce,running:false})
    record.status=mode==='first'?'starting':'restarting';await lock.write(record);await lock.updateOriginal(record)
    await io.start(record.containerId)
    const running=await io.docker.inspectAll()
    requireSafe(running[0].Id===record.containerId,'phase8_resource_changed_before_start')
    assertResources(...running,config.instance,{approval:io.approval,nonce:record.nonce})
    if(mode==='restart') await io.verifyDatabase() // SELECT-only observer, no migrations.
    record.status=mode==='first'?'created_verified':'ready_verified';await lock.write(record);await lock.updateOriginal(record)
    return {containerId:record.containerId,status:record.status}
  }catch(error){if(lock&&record){record.status='failed';try{await lock.write(record);await lock.updateOriginal(record)}catch{}}throw error}
  finally{await lock?.close()}
}
