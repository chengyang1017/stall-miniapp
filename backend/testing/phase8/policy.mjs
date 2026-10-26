// PURE safety logic. No pg, Docker, subprocesses, network or writes on import.
export const TARGET = Object.freeze({ project: 'stall-phase8-b0', container: 'stall-phase8-pg16',
  volume: 'stall-phase8-data', network: 'stall-phase8-network', service: 'phase8-postgres',
  database: 'stall_test_phase8', port: 55433, image: 'postgres:16-alpine', scope: 'isolated-integration' })
export function requireSafe(condition, code) { if (!condition) throw Object.assign(Error(code), { phase8Code: code }) }
export function safeCode(error) { return /^phase8_[a-z0-9_]+$/.test(error?.phase8Code || '') ? error.phase8Code : 'phase8_operation_failed' }
export function approvedImage(approval) {
  requireSafe(approval?.approved === true && approval.repository === TARGET.image &&
    /^sha256:[a-f0-9]{64}$/.test(approval.digest || '') && /^sha256:[a-f0-9]{64}$/.test(approval.imageId || '') &&
    typeof approval.reviewedBy === 'string' && approval.reviewedBy.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}T/.test(approval.reviewedAt || ''), 'phase8_image_not_approved')
  // The approved channel remains exact; local digest lookup uses the repository name without its tag.
  return { reference: 'postgres@' + approval.digest, imageId: approval.imageId }
}
export function accessConfig(env, role = 'observer', purpose = 'inspect', approval) {
  requireSafe(['app', 'migrator', 'observer'].includes(role), 'phase8_invalid_role')
  requireSafe(['inspect', 'initialize', 'test'].includes(purpose), 'phase8_invalid_purpose')
  requireSafe(env.STALL_PHASE8_AUTHORIZE === 'LOCAL_PHASE8_DATABASE_ACCESS', 'phase8_access_not_authorized')
  requireSafe(({ inspect: 'observer', test: 'app', initialize: 'migrator' })[purpose] === role, 'phase8_role_purpose_rejected')
  requireSafe(!env.DOCKER_HOST && !env.DOCKER_CONTEXT && !env.DOCKER_TLS_VERIFY && !env.DOCKER_CERT_PATH, 'phase8_docker_override_rejected')
  if (purpose === 'initialize') requireSafe(role === 'migrator' && env.STALL_PHASE8_INITIALIZE === 'INITIALIZE_ONCE', 'phase8_initialization_not_authorized')
  if (purpose === 'test') requireSafe(role === 'app' && env.STALL_PHASE8_TEST_WRITES === 'TEST_WRITES_ONLY', 'phase8_test_writes_not_authorized')
  const instance = env.STALL_PHASE8_INSTANCE_ID
  requireSafe(typeof instance === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(instance), 'phase8_invalid_instance_id')
  const raw = env['STALL_PHASE8_' + role.toUpperCase() + '_URL']
  let url
  try { url = new URL(raw) } catch { requireSafe(false, 'phase8_missing_or_invalid_test_url') }
  const user = 'stall_test_' + role
  requireSafe(url.protocol === 'postgresql:' && url.hostname === '127.0.0.1' && url.port === String(TARGET.port) &&
    url.pathname === '/' + TARGET.database && url.username === user && url.search === '' && url.hash === '', 'phase8_connection_target_rejected')
  requireSafe(/^[0-9a-f]{64}$/.test(url.password), 'phase8_invalid_password_format')
  // Explicit fields/options prevent PGHOST/PGDATABASE/PGOPTIONS and service defaults.
  return { instance, purpose, role, image: approvedImage(approval), pg: { host: '127.0.0.1', port: TARGET.port, database: TARGET.database,
    user, password: url.password, ssl: false, max: 6, connectionTimeoutMillis: 5000, query_timeout: 12000,
    application_name: 'stall-phase8-' + instance,
    options: '-c search_path=public -c statement_timeout=8000 -c lock_timeout=4000 -c idle_in_transaction_session_timeout=15000 -c default_transaction_read_only=' + (purpose === 'inspect' ? 'on' : 'off') } }
}
export function assertDockerContext(context) {
  requireSafe(['npipe:////./pipe/docker_engine','npipe:////./pipe/dockerDesktopLinuxEngine','unix:///var/run/docker.sock'].includes(context?.Endpoints?.docker?.Host) &&
    context.Endpoints.docker.SkipTLSVerify !== true, 'phase8_remote_docker_context_rejected')
}
export function assertResources(container, volume, network, instance, options = {}) {
  const vars = container?.Config?.Env || [], values = new Map(vars.map(v => { const p = v.indexOf('='); return [v.slice(0,p), v.slice(p+1)] }))
  requireSafe(values.size === vars.length && values.get('PGDATA') === '/var/lib/postgresql/data' &&
    values.get('POSTGRES_INITDB_ARGS') === '--auth-host=scram-sha-256 --auth-local=scram-sha-256' &&
    values.get('POSTGRES_HOST_AUTH_METHOD') === 'scram-sha-256' &&
    ![...values.keys()].some(k => k.startsWith('PG') && !['PGDATA','PG_MAJOR','PG_VERSION','PG_SHA256'].includes(k)), 'phase8_container_environment_rejected')
  const image = approvedImage(options.approval)
  const labels = (value, service = false) => {
    requireSafe(value?.['com.docker.compose.project'] === TARGET.project && value?.['stall.phase8.scope'] === TARGET.scope && value?.['stall.phase8.instance'] === instance &&
      /^[a-f0-9]{64}$/.test(options.nonce || '') && value?.['stall.phase8.launch'] === options.nonce &&
      (!service || value?.['com.docker.compose.service'] === TARGET.service), 'phase8_resource_labels_rejected')
  }
  const running = options.running !== false
  requireSafe(container?.Name === '/' + TARGET.container && container.State?.Running === running && container.Config?.Image === image.reference &&
    container.Image === image.imageId && /^[a-f0-9]{64}$/.test(container.Id || ''), 'phase8_container_rejected')
  requireSafe(JSON.stringify(container.Config.Entrypoint) === JSON.stringify(['sh','/phase8/bootstrap-entrypoint.sh']) &&
    JSON.stringify(container.Config.Cmd) === JSON.stringify(['postgres','-c','log_statement=none','-c','log_min_error_statement=panic','-c','log_parameter_max_length_on_error=0','-c','listen_addresses=*','-c','port=5432']), 'phase8_entrypoint_rejected')
  labels(container.Config.Labels, true); labels(volume?.Labels); labels(network?.Labels)
  requireSafe(volume?.Name === TARGET.volume && volume.Driver === 'local' && Object.keys(volume.Options || {}).length === 0 &&
    network?.Name === TARGET.network && network.Driver === 'bridge' && network.Internal === true, 'phase8_storage_network_rejected')
  const ports = value => Object.keys(value || {}).length === 1 && Array.isArray(value['5432/tcp']) && value['5432/tcp'].length === 1 &&
    value['5432/tcp'][0].HostIp === '127.0.0.1' && value['5432/tcp'][0].HostPort === String(TARGET.port)
  requireSafe(container.HostConfig?.Privileged === false && ports(container.HostConfig.PortBindings) &&
    (running ? ports(container.NetworkSettings?.Ports) : !Object.keys(container.NetworkSettings?.Ports || {}).length), 'phase8_port_binding_rejected')
  requireSafe(Object.keys(container.NetworkSettings.Networks || {}).join() === TARGET.network &&
    container.HostConfig.NetworkMode === TARGET.network && (running ? Object.keys(network.Containers || {}).length === 1 &&
    Object.keys(network.Containers)[0] === container.Id : Object.keys(network.Containers || {}).length === 0), 'phase8_network_membership_rejected')
  const mounts = container.Mounts || [], data = mounts.filter(m => m.Destination === '/var/lib/postgresql/data')
  requireSafe(data.length === 1 && data[0].Type === 'volume' && data[0].Name === TARGET.volume && data[0].RW === true, 'phase8_data_mount_rejected')
  const readonly = ['/docker-entrypoint-initdb.d/10-phase8-bootstrap.sh', '/phase8/bootstrap-entrypoint.sh',
    '/run/secrets/phase8_admin_password', '/run/secrets/phase8_migrator_password', '/run/secrets/phase8_app_password',
    '/run/secrets/phase8_observer_password', '/run/phase8-launch']
  requireSafe(mounts.length === readonly.length + 1 && readonly.every(destination => {
    const matching = mounts.filter(m => m.Destination === destination)
    return matching.length === 1 && matching[0].Type === 'bind' && matching[0].RW === false
  }), 'phase8_extra_mount_rejected')
  requireSafe(vars.includes('POSTGRES_DB=' + TARGET.database) && vars.includes('POSTGRES_USER=stall_test_bootstrap') &&
    vars.includes('POSTGRES_PASSWORD_FILE=/run/secrets/phase8_admin_password') &&
    vars.includes('STALL_PHASE8_INSTANCE_ID=' + instance) && vars.includes('STALL_PHASE8_BOOTSTRAP_CONFIRM=CREATE_NEW_PHASE8_INSTANCE') &&
    vars.includes('STALL_PHASE8_LAUNCH_TOKEN=' + options.nonce) && vars.includes('STALL_PHASE8_IMAGE=' + image.reference) &&
    !vars.some(v => v.startsWith('POSTGRES_PASSWORD=')), 'phase8_container_environment_rejected')
}
export function assertIdentity(row, config) {
  requireSafe(row && row.database_name === TARGET.database && row.current_role === config.pg.user && row.session_role === config.pg.user &&
    row.database_owner === 'stall_test_bootstrap' && Number(row.server_version) >= 160000 && Number(row.server_version) < 170000 &&
    Number(row.server_port) === 5432 && row.read_only === (config.purpose === 'inspect' ? 'on' : 'off'), 'phase8_database_identity_rejected')
  requireSafe([row.rolsuper,row.rolcreatedb,row.rolcreaterole,row.rolreplication,row.rolbypassrls,row.database_create].every(v => v === false) &&
    row.rolcanlogin === true && Number(row.memberships) === 0 && row.public_create === (config.role === 'migrator'), 'phase8_role_privileges_rejected')
}
export function assertMarker(rows, config, state, manifestHash) {
  requireSafe(rows.length === 1 && rows[0].instance_id === config.instance && rows[0].schema_state === state &&
    rows[0].owner === 'stall_test_bootstrap', 'phase8_instance_marker_rejected')
  requireSafe(state === 'bootstrap' ? rows[0].manifest_sha256 === null : rows[0].manifest_sha256 === manifestHash, 'phase8_manifest_marker_rejected')
}
export function assertLedger(rows, files) {
  requireSafe(rows.length === files.length && rows.every((r, i) => r.filename === files[i].filename && r.sha256 === files[i].sha256), 'phase8_migration_ledger_rejected')
}
