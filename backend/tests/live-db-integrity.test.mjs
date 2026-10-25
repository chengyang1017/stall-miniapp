// Read-only integrity audit against a REAL, isolated PostgreSQL test database.
// No fixtures, mocks, migrations or writes. Database roles should be SELECT-only.
// Run from repository root:
//   $env:STALL_AUDIT_DATABASE_URL='postgresql://readonly:...@test-host/stall_test'
//   $env:STALL_AUDIT_CONFIRM='READ_ONLY_TEST_DATABASE'
//   node --test backend/tests/live-db-integrity.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {Pool} from 'pg'

const connectionString=process.env.STALL_AUDIT_DATABASE_URL
const confirm=process.env.STALL_AUDIT_CONFIRM
const required='READ_ONLY_TEST_DATABASE'

test('live PostgreSQL store, order, inventory and ledger consistency (read only)',{timeout:60000},async t=>{
 assert.equal(confirm,required,'Explicitly confirm isolated test database using STALL_AUDIT_CONFIRM')
 assert.ok(connectionString,'STALL_AUDIT_DATABASE_URL is required; never fall back to DATABASE_URL')
 const u=new URL(connectionString)
 assert.ok(['postgres:','postgresql:'].includes(u.protocol))
 assert.ok(/(?:^|[_-])(test|testing|staging|stage|dev)(?:$|[_-])/i.test(decodeURIComponent(u.pathname.slice(1))),
   'Database NAME must identify an isolated test/staging/dev database')
 assert.ok(!u.hostname.includes('example.'),'Example database hosts are not real endpoints')
 const pool=new Pool({connectionString, max:1,connectionTimeoutMillis:5000,query_timeout:8000})
 const client=await pool.connect()
 try{
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  await client.query("SET LOCAL statement_timeout='8000ms'")
  await client.query("SET LOCAL lock_timeout='1500ms'")
  const checks=[
   ['orders have matching monetary totals',`
     SELECT COUNT(*)::int AS violations FROM orders
     WHERE subtotal_cents<0 OR delivery_fee_cents<0 OR total_cents<>subtotal_cents+delivery_fee_cents`],
   ['order items have positive quantity and matching line totals',`
     SELECT COUNT(*)::int AS violations FROM order_items
     WHERE quantity<=0 OR unit_price_cents<0 OR line_total_cents<>unit_price_cents::bigint*quantity`],
   ['nonnegative finite inventory',`
     SELECT COUNT(*)::int AS violations FROM products
     WHERE stock_mode='finite' AND (stock_quantity<0 OR stock_quantity IS NULL)`],
   ['order line items cannot reference a product from another store',`
     SELECT COUNT(*)::int AS violations FROM order_items i
     JOIN orders o ON o.id=i.order_id
     JOIN products p ON p.id=i.product_id
     WHERE p.store_id<>o.store_id`],
   ['inventory reservations belong to the order store and product store',`
     SELECT COUNT(*)::int AS violations FROM inventory_reservations r
     JOIN orders o ON o.id=r.order_id
     JOIN products p ON p.id=r.product_id
     WHERE r.store_id<>o.store_id OR r.store_id<>p.store_id`],
   ['held reservations only belong to held orders',`
     SELECT COUNT(*)::int AS violations FROM inventory_reservations r
     JOIN orders o ON o.id=r.order_id
     WHERE r.state='held' AND o.inventory_state<>'held'`],
   ['held finite orders have at least one held reservation',`
     SELECT COUNT(*)::int AS violations FROM orders o
     WHERE o.inventory_state='held' AND NOT EXISTS (
       SELECT 1 FROM inventory_reservations r
       WHERE r.order_id=o.id AND r.store_id=o.store_id AND r.state='held')`],
   ['order item totals match order subtotal',`
     SELECT COUNT(*)::int AS violations FROM orders o
     WHERE o.subtotal_cents<>(SELECT COALESCE(SUM(i.line_total_cents),0)
       FROM order_items i WHERE i.order_id=o.id)`],
   ['checkout retry keys are unique within store and customer',`
     SELECT COUNT(*)::int AS violations FROM (
       SELECT store_id,customer_subject,checkout_key
       FROM orders WHERE checkout_key IS NOT NULL
       GROUP BY store_id,customer_subject,checkout_key HAVING COUNT(*)>1
     ) dup`],
   ['orphan order items are absent',`
     SELECT COUNT(*)::int AS violations FROM order_items i
     LEFT JOIN orders o ON o.id=i.order_id WHERE o.id IS NULL`],
   ['orphan inventory reservations are absent',`
     SELECT COUNT(*)::int AS violations FROM inventory_reservations r
     LEFT JOIN orders o ON o.id=r.order_id
     LEFT JOIN products p ON p.id=r.product_id
     WHERE o.id IS NULL OR p.id IS NULL`],
   ['inventory movement arithmetic balances',`
     SELECT COUNT(*)::int AS violations FROM inventory_movements
     WHERE before_quantity IS NOT NULL AND (
       after_quantity IS NULL OR delta IS NULL OR after_quantity<>before_quantity+delta)`],
   ['inventory movement store matches the product store',`
     SELECT COUNT(*)::int AS violations FROM inventory_movements m
     JOIN products p ON p.id=m.product_id
     WHERE m.store_id<>p.store_id`],
   ['inventory reservations have positive quantities',`
     SELECT COUNT(*)::int AS violations FROM inventory_reservations
     WHERE quantity<=0 OR quantity IS NULL`],
   ['order inventory states match reservation resolution',`
     SELECT COUNT(*)::int AS violations FROM orders o
     WHERE o.inventory_state IN ('released','committed') AND EXISTS (
       SELECT 1 FROM inventory_reservations r
       WHERE r.order_id=o.id AND r.store_id=o.store_id AND r.state='held')`],
   ['payment event IDs are unique per provider',`
     SELECT COUNT(*)::int AS violations FROM (
       SELECT provider,provider_event_id FROM payment_events
       GROUP BY provider,provider_event_id HAVING COUNT(*)>1
     ) dup`]
  ]
  for(const [name,sql] of checks){
    await t.test(name,async()=>{
      const {rows}=await client.query(sql)
      assert.equal(rows[0].violations,0,name+': '+rows[0].violations+' violating row(s)')
    })
  }
 }finally{
  try{await client.query('ROLLBACK')}finally{client.release();await pool.end()}
 }
})
