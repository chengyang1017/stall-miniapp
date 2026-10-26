// V2 orchestration only; executes the unchanged manifest SQL, never imported for side effects.
import { check } from './policy.mjs'
import { inspectCatalog,fingerprint,assertReadyTransition } from '../phase8/schema.mjs'
export async function initialize(pool,g,migrations) {
  check(g.purpose==='initialize'&&g.role==='migrator','migration_role_rejected')
  const c=await pool.connect();let transaction=false,claimed=false
  try {
    check((await c.query('SELECT pg_try_advisory_lock(803280,2) AS acquired')).rows[0]?.acquired===true,'initialization_locked')
    check((await c.query("SELECT (SELECT count(*)::int FROM pg_class WHERE relnamespace='public'::regnamespace)+(SELECT count(*)::int FROM pg_proc WHERE pronamespace='public'::regnamespace)+(SELECT count(*)::int FROM pg_type WHERE typnamespace='public'::regnamespace) AS count")).rows[0]?.count===0,'nonempty_database_rejected')
    const claim=await c.query("UPDATE phase8_control.instance SET schema_state='initializing' WHERE singleton=true AND schema_state='bootstrap' RETURNING instance_id")
    check(claim.rowCount===1,'initialization_already_attempted');claimed=true
    await c.query('BEGIN');transaction=true
    await c.query('CREATE TABLE phase8_control.migrations(filename text PRIMARY KEY,sha256 char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())')
    await c.query('CREATE TABLE phase8_control.schema_baseline(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),catalog jsonb NOT NULL)')
    for(const f of migrations.files){await c.query(f.body);await c.query('INSERT INTO phase8_control.migrations(filename,sha256) VALUES($1,$2)',[f.filename,f.sha256])}
    for(const sql of ['REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC','GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO stall_test_app','GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO stall_test_app','GRANT SELECT ON ALL TABLES IN SCHEMA public TO stall_test_observer','GRANT SELECT ON phase8_control.migrations,phase8_control.schema_baseline TO stall_test_app,stall_test_observer'])await c.query(sql)
    const catalog=await inspectCatalog(c);await c.query('INSERT INTO phase8_control.schema_baseline(catalog) VALUES($1::jsonb)',[JSON.stringify(catalog)])
    assertReadyTransition(await c.query("UPDATE phase8_control.instance SET schema_state='ready',manifest_sha256=$1,schema_sha256=$2 WHERE singleton=true AND schema_state='initializing'",[migrations.manifestHash,fingerprint(catalog)]))
    await c.query('COMMIT');transaction=false
    return {status:'schema_initialized',ready:false}
  }catch(e){if(transaction){try{await c.query('ROLLBACK')}catch{}}if(claimed){try{await c.query("UPDATE phase8_control.instance SET schema_state='failed' WHERE singleton=true AND schema_state='initializing'")}catch{}}throw e}
  finally{c.release(Error('phase8_v2_initializer_finished'))}
}
