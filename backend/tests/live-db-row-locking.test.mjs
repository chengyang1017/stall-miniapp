// Real PostgreSQL concurrency probe: confirms product-row locking behavior.
// Runs ONLY on an explicitly named isolated test database, never production.
// Uses two actual DB sessions and temporary transactions; does not mutate data.
// Requires a PostgreSQL role with SELECT / SELECT FOR UPDATE privileges.
// STALL_AUDIT_DATABASE_URL=postgresql://.../stall_test
// STALL_AUDIT_CONFIRM=READ_ONLY_TEST_DATABASE
// node --test backend/tests/live-db-row-locking.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {Pool} from 'pg'

test('real product row lock excludes a concurrent checkout transaction', {timeout:30000}, async t => {
 const connectionString=process.env.STALL_AUDIT_DATABASE_URL
 assert.equal(process.env.STALL_AUDIT_CONFIRM,'READ_ONLY_TEST_DATABASE',
   'Only a confirmed isolated test database may be used')
 assert.ok(connectionString,'Set STALL_AUDIT_DATABASE_URL; DATABASE_URL is intentionally not used')
 const url=new URL(connectionString)
 assert.ok(['postgres:','postgresql:'].includes(url.protocol))
 assert.match(decodeURIComponent(url.pathname.slice(1)),/(?:^|[_-])(test|testing|staging|stage|dev)(?:$|[_-])/i)
 assert.ok(!url.hostname.includes('example.'))
 const pool=new Pool({connectionString,max:2,connectionTimeoutMillis:5000,query_timeout:7000})
 let first,second,firstOpen=false,secondOpen=false
 try {
  first=await pool.connect()
  second=await pool.connect()
  await first.query('BEGIN');firstOpen=true
  await first.query("SET LOCAL statement_timeout='5000ms'")
  await first.query("SET LOCAL lock_timeout='1500ms'")
  await second.query('BEGIN');secondOpen=true
  await second.query("SET LOCAL statement_timeout='5000ms'")
  await second.query("SET LOCAL lock_timeout='1500ms'")
  // Recheck the database identity after connecting: a proxy may route to a
  // different database than the name in the connection string.
  for(const session of [first,second]){
   const {rows:[identity]}=await session.query(
    "SELECT current_database() AS name, current_setting('transaction_read_only') AS read_only")
   assert.match(identity.name,/(?:^|[_-])(test|testing|staging|stage|dev)(?:$|[_-])/i,
     'Actual connected database is not an isolated test database')
   assert.equal(identity.read_only,'off',
     'PostgreSQL SELECT FOR UPDATE requires a writable transaction; use an isolated test database')
  }
  const {rows}=await first.query(`SELECT id FROM products
    WHERE stock_mode='finite' AND stock_quantity>=0
    ORDER BY id LIMIT 1 FOR UPDATE`)
  if(!rows.length){
   t.diagnostic('No finite-stock product in test database: concurrency proof not possible')
   assert.fail('Seed at least one finite-stock TEST product before running this audit')
  }
  const productId=rows[0].id
  // Two independent real connections target the same row. NOWAIT must reject
  // the second lock while the first transaction is still holding it.
  await second.query('SAVEPOINT probe')
  await assert.rejects(
   second.query('SELECT id FROM products WHERE id=$1 FOR UPDATE NOWAIT',[productId]),
   err=>err.code==='55P03', 'Expected PostgreSQL lock_not_available (55P03)'
  )
  await second.query('ROLLBACK TO SAVEPOINT probe')
  await first.query('ROLLBACK');firstOpen=false
  // Once released, the second transaction must be able to acquire the lock.
  const freed=await second.query('SELECT id FROM products WHERE id=$1 FOR UPDATE NOWAIT',[productId])
  assert.equal(freed.rows.length,1)
 } finally {
  if(firstOpen&&first)await first.query('ROLLBACK').catch(()=>{})
  if(secondOpen&&second)await second.query('ROLLBACK').catch(()=>{})
  first?.release()
  second?.release()
  await pool.end()
 }
})
