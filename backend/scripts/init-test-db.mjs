// Never imported by a test for side effects. No DB connection without --initialize
// AND all dedicated policy gates. No create/drop database, clear, resume or cleanup.
import { pathToFileURL } from 'node:url'
import { openVerifiedPool } from '../testing/phase8/postgres.mjs'
import { requireSafe, safeCode } from '../testing/phase8/policy.mjs'
import { inspectCatalog,fingerprint,assertReadyTransition } from '../testing/phase8/schema.mjs'
export async function initializeTestDatabase(env) {
  const { pool, migrations } = await openVerifiedPool(env, { role: 'migrator', purpose: 'initialize', state: 'bootstrap' })
  let client, transaction = false, claimed = false
  try {
    client = await pool.connect()
    // Session lock survives the separate persistent attempt claim. Reject rather
    // than wait for/replay another initializer. Connection close releases it.
    const lock = await client.query('SELECT pg_try_advisory_lock(803280,1) AS acquired')
    requireSafe(lock.rows[0]?.acquired === true, 'phase8_initialization_locked')
    const objects = await client.query(`SELECT
      (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace)+
      (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace)+
      (SELECT count(*) FROM pg_type WHERE typnamespace='public'::regnamespace) AS count`)
    requireSafe(Number(objects.rows[0].count) === 0, 'phase8_nonempty_database_refused')
    const claim = await client.query("UPDATE phase8_control.instance SET schema_state='initializing' WHERE singleton=true AND schema_state='bootstrap' RETURNING instance_id")
    requireSafe(claim.rowCount === 1, 'phase8_initialization_already_attempted'); claimed = true
    await client.query('BEGIN'); transaction = true
    await client.query('CREATE TABLE phase8_control.migrations(filename text PRIMARY KEY,sha256 char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())')
    await client.query('CREATE TABLE phase8_control.schema_baseline(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),catalog jsonb NOT NULL)')
    for (const file of migrations.files) {
      await client.query(file.body)
      await client.query('INSERT INTO phase8_control.migrations(filename,sha256) VALUES($1,$2)', [file.filename, file.sha256])
    }
    await client.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC')
    await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO stall_test_app')
    await client.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO stall_test_app')
    await client.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO stall_test_observer')
    await client.query('GRANT SELECT ON phase8_control.migrations,phase8_control.schema_baseline TO stall_test_app,stall_test_observer')
    const catalog=await inspectCatalog(client)
    await client.query('INSERT INTO phase8_control.schema_baseline(catalog) VALUES($1::jsonb)',[JSON.stringify(catalog)])
    const ready=await client.query("UPDATE phase8_control.instance SET schema_state='ready',manifest_sha256=$1,schema_sha256=$2 WHERE singleton=true AND schema_state='initializing'", [migrations.manifestHash,fingerprint(catalog)])
    assertReadyTransition(ready)
    await client.query('COMMIT'); transaction = false
  } catch (error) {
    if (transaction) { try { await client.query('ROLLBACK') } catch {} }
    // A dropped connection may prevent this write. Persistent initializing still
    // blocks reruns. If COMMIT succeeded but acknowledgement was lost, ready is
    // never overwritten: inspect via verify-test-env, not another initialization.
    if (claimed) { try { await client.query("UPDATE phase8_control.instance SET schema_state='failed' WHERE singleton=true AND schema_state='initializing'") } catch {} }
    throw error
  } finally { client?.release(Error('phase8_initializer_finished')); await pool.end() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length === 2) console.log('Offline only. --initialize requires dedicated first-instance and write authorization. No connection made.')
  else if (process.argv.length !== 3 || process.argv[2] !== '--initialize') { console.error('phase8_invalid_arguments'); process.exitCode = 1 }
  else try { await initializeTestDatabase(process.env); console.log('Phase8 schema, checksums and ready marker committed atomically.') }
  catch (error) { console.error(safeCode(error)); process.exitCode = 1 }
}
