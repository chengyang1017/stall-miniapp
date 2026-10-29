// B0 ENVIRONMENT SAFETY UNIT TESTS ONLY. Synthetic metadata is not PostgreSQL.
// No pg connections, Docker commands, migrations, containers or credentials used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { accessConfig as baseAccessConfig, assertDockerContext, assertResources as baseAssertResources, assertIdentity, assertMarker, assertLedger, safeCode, TARGET } from '../testing/phase8/policy.mjs'
import { statements, migrationBody, checkedMigration, loadMigrations, sourceHash } from '../testing/phase8/migrations.mjs'
import { openVerifiedPool } from '../testing/phase8/postgres.mjs'
import { initializeTestDatabase } from '../scripts/init-test-db.mjs'
import { verifyReady } from '../scripts/verify-test-env.mjs'
import { barrier, bounded, expectSqlstate, openFixture } from './helpers/phase8-postgres.mjs'

import { instance,hash,nonce,approval,env,resources,identity,marker } from './helpers/phase8-fixtures.mjs'
const accessConfig=(e,role='observer',purpose='inspect')=>baseAccessConfig(e,role,purpose,approval)
const assertResources=(c,v,n,id)=>baseAssertResources(c,v,n,id,{approval,nonce})
const rejects = (fn, code) => assert.throws(fn, error => error?.phase8Code === code)

test('B0 policy: exact dedicated config, explicit options, no production fallback', () => {
  const e = env(); e.DATABASE_URL = 'not-a-test-url'; e.PGHOST = 'untrusted-host'; e.PGOPTIONS = '-c search_path=untrusted'
  const config = accessConfig(e, 'app', 'test')
  assert.equal(config.pg.host, '127.0.0.1'); assert.equal(config.pg.max, 6); assert.equal(config.pg.database, TARGET.database)
  assert.equal(config.pg.user, 'stall_test_app'); assert.equal(config.pg.connectionString, undefined)
  assert.match(config.pg.options, /search_path=public/); assert.ok(!config.pg.options.includes('untrusted'))
  assert.match(config.pg.options, /default_transaction_read_only=off/)
  assert.match(accessConfig(e).pg.options, /default_transaction_read_only=on/)
  assert.equal(accessConfig(e, 'migrator', 'initialize').pg.user, 'stall_test_migrator')
})
for (const key of ['STALL_PHASE8_AUTHORIZE','STALL_PHASE8_INSTANCE_ID','STALL_PHASE8_APP_URL']) {
  test('B0 policy rejects missing ' + key, () => { const e = env(); delete e[key]; rejects(() => accessConfig(e,'app','test'),key==='STALL_PHASE8_AUTHORIZE'?'phase8_access_not_authorized':key==='STALL_PHASE8_INSTANCE_ID'?'phase8_invalid_instance_id':'phase8_missing_or_invalid_test_url') })
}
test('B0 policy: independent authorization for initialization and writes', () => {
  const e = env(); delete e.STALL_PHASE8_INITIALIZE; delete e.STALL_PHASE8_TEST_WRITES
  rejects(() => accessConfig(e, 'migrator', 'initialize'), 'phase8_initialization_not_authorized')
  rejects(() => accessConfig(e, 'app', 'test'), 'phase8_test_writes_not_authorized')
  rejects(() => accessConfig(env(), 'app', 'initialize'), 'phase8_role_purpose_rejected')
  rejects(() => accessConfig(env(), 'migrator', 'test'), 'phase8_role_purpose_rejected')
})
test('B0 remote Docker overrides cannot substitute for the local test infrastructure', () => {
  for (const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']) { const e = env(); e[key] = 'synthetic-override'; rejects(() => accessConfig(e), 'phase8_docker_override_rejected') }
  assertDockerContext({ Endpoints: { docker: { Host: 'npipe:////./pipe/dockerDesktopLinuxEngine' } } })
  rejects(() => assertDockerContext({ Endpoints: { docker: { Host: 'ssh://remote.invalid' } } }), 'phase8_remote_docker_context_rejected')
  rejects(() => assertDockerContext({ Endpoints: { docker: { Host: 'tcp://127.0.0.1:2375' } } }), 'phase8_remote_docker_context_rejected')
})
for (const [label, change] of [
  ['remote', u => u.replace('127.0.0.1','production.invalid')], ['dev database', u => u.replace('stall_test_phase8','stall_dev')],
  ['dev port', u => u.replace('55433','55432')], ['wrong role', u => u.replace('stall_test_app','postgres')],
  ['URL parameter override', u => u + '?host=production.invalid'], ['SSL override', u => u + '?sslmode=disable'],
  ['fragment', u => u + '#ignored'], ['socket', u => u.replace('127.0.0.1','%2Ftmp')],
  ['unapproved protocol', u => u.replace('postgresql:','postgres:')], ['missing password', u => u.replace('a'.repeat(64),'')]
]) test('B0 policy rejects ' + label, () => { const e = env(); e.STALL_PHASE8_APP_URL = change(e.STALL_PHASE8_APP_URL); rejects(() => accessConfig(e,'app','test'),label==='missing password'?'phase8_invalid_password_format':'phase8_connection_target_rejected') })

test('B0 resource attestation accepts only the complete synthetic dedicated topology', () => assert.doesNotThrow(() => assertResources(...resources(), instance)))
for (const [label, change] of [
  ['dev project', r => r[0].Config.Labels['com.docker.compose.project'] = 'stall_dev'],
  ['wrong instance', r => r[1].Labels['stall.phase8.instance'] = 'other'],
  ['public port', r => r[0].HostConfig.PortBindings['5432/tcp'][0].HostIp = '0.0.0.0'],
  ['runtime port mismatch', r => r[0].NetworkSettings.Ports['5432/tcp'][0].HostPort = '55432'],
  ['dev volume', r => r[0].Mounts[0].Name = 'stall_dev_pgdata'],
  ['volume driver bind options', r => r[1].Options = { type: 'none', device: '/shared-data', o: 'bind' }],
  ['host data bind', r => r[0].Mounts[0].Type = 'bind'],
  ['extra writable bind', r => r[0].Mounts.push({ Destination: '/host', Type: 'bind', RW: true })],
  ['missing secret mount', r => r[0].Mounts.pop()],
  ['writable bootstrap script', r => r[0].Mounts[1].RW = true],
  ['shared network', r => r[2].Containers.other = {}],
  ['external network', r => r[2].Internal = false],
  ['privileged', r => r[0].HostConfig.Privileged = true],
  ['stopped', r => r[0].State.Running = false],
  ['different entrypoint', r => r[0].Config.Entrypoint = ['docker-entrypoint.sh']],
  ['different image', r => r[0].Config.Image = 'postgres:latest'],
  ['password in environment', r => r[0].Config.Env.push('POSTGRES_PASSWORD=synthetic-only')]
]) test('B0 resource attestation rejects ' + label, () => {
  const r = resources(); change(r)
  const codes={'dev project':'resource_labels_rejected','wrong instance':'resource_labels_rejected','public port':'port_binding_rejected','runtime port mismatch':'port_binding_rejected',
    'dev volume':'data_mount_rejected','volume driver bind options':'storage_network_rejected','host data bind':'data_mount_rejected','extra writable bind':'extra_mount_rejected',
    'missing secret mount':'extra_mount_rejected','writable bootstrap script':'extra_mount_rejected','shared network':'network_membership_rejected','external network':'storage_network_rejected',
    privileged:'port_binding_rejected',stopped:'container_rejected','different entrypoint':'entrypoint_rejected','different image':'container_rejected','password in environment':'container_environment_rejected'}
  rejects(()=>assertResources(...r,instance),'phase8_'+codes[label])
})

test('B0 database identity accepts distinct non-superuser app and migrator roles', () => {
  for (const [role,purpose] of [['app','test'],['migrator','initialize'],['observer','inspect']]) assert.doesNotThrow(() => assertIdentity(identity(role,purpose), accessConfig(env(), role,purpose)))
})
test('B0 inspect and write sessions must report the expected server-side read-only mode', () => {
  const row = identity('app')
  rejects(() => assertIdentity(row, accessConfig(env(), 'app', 'test')),'phase8_database_identity_rejected')
  row.read_only = 'off'
  assertIdentity(row, accessConfig(env(), 'app', 'test'))
  row.current_role=row.session_role='stall_test_observer'
  rejects(() => assertIdentity(row, accessConfig(env())),'phase8_database_identity_rejected')
})
for (const [field, value] of [['database_name','stall_dev'], ['current_role','postgres'], ['session_role','postgres'],
  ['server_version',150000], ['database_owner','stall_test_app'], ['rolsuper',true], ['rolcreatedb',true],
  ['rolcreaterole',true], ['rolreplication',true], ['rolbypassrls',true], ['database_create',true], ['public_create',true], ['memberships',1]]) {
  test('B0 identity rejects ' + field, () => { const row = identity('app','test'); row[field] = value; rejects(() => assertIdentity(row, accessConfig(env(),'app','test')), 'phase8_' + (['database_name','current_role','session_role','server_version','database_owner'].includes(field) ? 'database_identity_rejected' : 'role_privileges_rejected')) })
}
test('B0 first initialization requires bootstrap, not a nonexistent ready marker', () => {
  const c = accessConfig(env(), 'migrator', 'initialize')
  assert.doesNotThrow(() => assertMarker(marker('bootstrap'), c, 'bootstrap', hash))
  rejects(() => assertMarker([], c, 'bootstrap', hash),'phase8_instance_marker_rejected')
})
for (const state of ['bootstrap','initializing','failed']) test('B0 reuse rejects non-ready state ' + state, () => rejects(() => assertMarker(marker(state), accessConfig(env()), 'ready', hash),'phase8_instance_marker_rejected'))
test('B0 ready marker and exact complete ledger are both required', () => {
  const c = accessConfig(env()), files = [{ filename: '001_example.sql', sha256: hash }]
  assert.doesNotThrow(() => assertMarker(marker('ready'), c, 'ready', hash))
  for (const [change,code] of [[r => r[0].instance_id = 'wrong','phase8_instance_marker_rejected'], [r => r[0].owner = 'stall_test_app','phase8_instance_marker_rejected'], [r => r[0].manifest_sha256 = 'wrong','phase8_manifest_marker_rejected']]) { const r = marker('ready'); change(r); rejects(() => assertMarker(r, c, 'ready', hash),code) }
  assertLedger(files, files)
  rejects(() => assertLedger([], files),'phase8_migration_ledger_rejected'); rejects(() => assertLedger([{ ...files[0], sha256: 'wrong' }], files),'phase8_migration_ledger_rejected')
})
test('B0 SQL scanner preserves dollar bodies, quoted delimiters and nested comments', () => {
  const text = "/* outer /* inner */ */ BEGIN; CREATE FUNCTION example() RETURNS void LANGUAGE plpgsql AS $body$ BEGIN RAISE NOTICE 'COMMIT;'; END; $body$; -- end\nCOMMIT;"
  assert.equal(statements(text).length, 3)
  const body = migrationBody(text, 'wrapped'); assert.match(body, /BEGIN RAISE NOTICE 'COMMIT;'; END;/)
  assert.equal(statements(body).length, 1)
  assert.equal(statements("CREATE TABLE \"a;b\"(v text DEFAULT 'it''s;ok');").length, 1)
})
for (const text of ['BEGIN; VACUUM; COMMIT;', 'BEGIN; CREATE INDEX CONCURRENTLY idx ON t(id); COMMIT;',
  'BEGIN; COMMIT; CREATE TABLE wrong(id int); COMMIT;', 'BEGIN; COPY t FROM STDIN; COMMIT;']) {
  test('B0 migration policy rejects unsafe transaction expression ' + text.split(';')[1].trim(), () => rejects(() => migrationBody(text, 'wrapped'),text.includes('CONCURRENTLY')?'phase8_nontransactional_sql':'phase8_unapproved_top_level_sql'))
}
test('B0 scanner rejects malformed input and does not infer transaction wrapping', () => {
  for (const text of ["SELECT 'missing;", 'DO $tag$ missing;', '/* missing', 'CREATE TABLE a(id int)']) rejects(() => statements(text),text.startsWith('CREATE')?'phase8_missing_sql_terminator':'phase8_unterminated_sql')
  rejects(() => migrationBody('CREATE TABLE a(id int);', 'wrapped'),'phase8_transaction_wrapper_changed')
  rejects(() => migrationBody('BEGIN; CREATE TABLE a(id int); COMMIT;', 'bare'),'phase8_unapproved_top_level_sql')
})
test('B0 offline review: actual 001-020 checksums and transaction boundaries match manifest', async () => {
  const { files, manifestHash } = await loadMigrations({sourceProfile:'workspace021-baseline020'})
  assert.equal(files.length, 20); assert.match(manifestHash, /^[a-f0-9]{64}$/)
  assert.equal(files.filter(f => f.transaction === 'wrapped').length, 19)
  assert.equal(files.find(f => f.transaction === 'bare').filename, '007_order_estimated_arrival.sql')
  for (const file of files) assert.ok(statements(file.body).every(s => !/^(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)))
  assert.equal(sourceHash(Buffer.from('a\r\nb')), sourceHash(Buffer.from('a\nb')))
  assert.notEqual(sourceHash(Buffer.from('a\nb')), sourceHash(Buffer.from('a\nc')))
})
test('B0 migration hash mismatch fails before SQL body can be accepted', () => {
  const raw = Buffer.from('BEGIN; CREATE TABLE original(id int); COMMIT;'), entry = { filename: '001_example.sql', sha256: sourceHash(raw), transaction: 'wrapped' }
  assert.match(checkedMigration(entry, raw).body, /CREATE TABLE original/)
  rejects(() => checkedMigration(entry, Buffer.from('BEGIN; CREATE TABLE changed(id int); COMMIT;')), 'phase8_migration_hash_changed')
})
test('B0 actual entry functions reject absent authorization BEFORE Docker/pg access', async () => {
  for (const action of [() => initializeTestDatabase({}), () => verifyReady({}), () => openFixture({}), () => openVerifiedPool({})]) {
    await assert.rejects(action, e => e?.phase8Code === 'phase8_access_not_authorized')
  }
})
test('B0 default CLIs are offline; children receive no database authorization', () => {
  for (const file of ['init-test-db.mjs','verify-test-env.mjs']) {
    const output = execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/' + file, import.meta.url))], {
      encoding: 'utf8', timeout: 5000, windowsHide: true, env: { SystemRoot: process.env.SystemRoot || '', PATH: '' }
    })
    assert.match(output, /Offline only/); assert.match(output, /No connection made/)
  }
})
test('B0 config review: dedicated resources, pre-init entrypoint and no backend service', async () => {
  const compose = await readFile(new URL('../compose.test.yml', import.meta.url), 'utf8')
  assert.match(compose, /name: stall-phase8-b0/); assert.match(compose, /127\.0\.0\.1:55433:5432/)
  assert.match(compose, /internal: true/); assert.match(compose, /bootstrap-entrypoint\.sh/)
  assert.ok(!/stall_dev|server\.mjs|inventory\.mjs/.test(compose))
  const hook = await readFile(new URL('../testing/phase8/bootstrap.sh', import.meta.url), 'utf8')
  assert.match(hook, /NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/)
  assert.match(hook, /\\getenv app_password/); assert.ok(!hook.includes('set -x'))
  const initializer = await readFile(new URL('../scripts/init-test-db.mjs', import.meta.url), 'utf8')
  assert.match(initializer, /pg_try_advisory_lock/)
  assert.ok(!/DROP DATABASE|TRUNCATE|DISABLE TRIGGER|session_replication_role\s*=/.test(initializer))
})
test('B0 safe diagnostics never print arbitrary driver messages or credentials', () => {
  assert.equal(safeCode(Error('synthetic password should never reach logs')), 'phase8_operation_failed')
  assert.equal(safeCode({ phase8Code: 'phase8_role_privileges_rejected' }), 'phase8_role_privileges_rejected')
  assert.equal(safeCode({ phase8Code: 'unsafe\ncredential' }), 'phase8_operation_failed')
})
test('B0 helper barrier, SQLSTATE predicate and bounded timeout are pure tools, not DB evidence', async () => {
  const b = barrier(); b.signal(); await bounded(b.promise)
  assert.equal(await bounded(Promise.resolve(42)), 42)
  await expectSqlstate(async () => { throw Object.assign(Error('synthetic'), { code: '40P01' }) }, '40P01')
  await assert.rejects(bounded(new Promise(() => {}), 5), e => e.phase8Code === 'phase8_wait_timeout')
})
