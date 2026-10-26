// REAL PostgreSQL fixture for future authorized integration suites. No connection
// at import; no dependency on the Phase7 SQL adapter. B0 does not invoke openFixture.
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { openVerifiedPool } from '../../testing/phase8/postgres.mjs'
import { requireSafe } from '../../testing/phase8/policy.mjs'

export function barrier() {
  let signal
  const promise = new Promise(resolve => { signal = resolve })
  return { promise, signal }
}
export async function bounded(promise, milliseconds = 10000) {
  requireSafe(Number.isInteger(milliseconds) && milliseconds >= 1 && milliseconds <= 30000, 'phase8_invalid_wait_bound')
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(Error('phase8_wait_timeout'), { phase8Code: 'phase8_wait_timeout' })), milliseconds) })]) }
  finally { clearTimeout(timer) }
}
export async function expectSqlstate(action, code) {
  requireSafe(/^[0-9A-Z]{5}$/.test(code), 'phase8_invalid_sqlstate')
  await assert.rejects(action, error => error?.code === code, 'Expected SQLSTATE ' + code)
}
export async function transaction(client, action) {
  await client.query('BEGIN')
  try { const value = await action(client); await client.query('COMMIT'); return value }
  catch (error) { try { await client.query('ROLLBACK') } catch (rollbackError) { client.release(rollbackError) } throw error }
}
// Binds an actual verified pg connection to a route's Pool-shaped argument.
// SQL and transactions are forwarded unchanged, never interpreted/mocked. The
// outer connections() scope owns the physical release so observed PIDs match.
function connectionPool(client) {
  let busy = false
  return {
    query(sql, args) { requireSafe(!busy, 'phase8_connection_already_borrowed'); return client.query(sql, args) },
    async connect() {
      requireSafe(!busy, 'phase8_connection_already_borrowed'); busy = true
      let released = false
      return {
        query(sql, args) { requireSafe(!released, 'phase8_connection_released'); return client.query(sql, args) },
        release(error) { if (!released) { released = true; busy = false; if (error) client.release(error) } }
      }
    }
  }
}
export async function openFixture(env) {
  const { pool } = await openVerifiedPool(env, { role:'app',purpose: 'test' })
  const runId = randomUUID(), namespace = 'p8_' + runId.replaceAll('-', '')
  return { pool, runId, namespace,
    async connections(action) {
      const clients = []
      try {
        for (let i = 0; i < 3; i++) clients.push(await pool.connect())
        const pids = await Promise.all(clients.map(async c => (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid))
        assert.equal(new Set(pids).size, 3, 'two business + observer sessions must be distinct')
        return await action({ first: clients[0], second: clients[1], observer: clients[2], pids,
          firstPool: connectionPool(clients[0]), secondPool: connectionPool(clients[1]) })
      } finally { for (const client of clients) client.release(Error('phase8_connection_scope_finished')) }
    },
    // Polling cadence is NOT correctness evidence: success requires PostgreSQL's
    // actual blocking graph. Tests coordinate lock holders with barrier().
    async waitForBlocked(observer, waiterPid, blockerPid, milliseconds = 5000) {
      requireSafe(Number.isInteger(waiterPid) && Number.isInteger(blockerPid) && waiterPid !== blockerPid &&
        Number.isInteger(milliseconds) && milliseconds > 0 && milliseconds <= 8000, 'phase8_invalid_lock_observation')
      const deadline = performance.now() + milliseconds
      while (performance.now() < deadline) {
        const { rows } = await observer.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked', [waiterPid, blockerPid])
        if (rows[0].blocked === true) return
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      requireSafe(false, 'phase8_lock_wait_not_observed')
    },
    async finalOrder(orderId) {
      requireSafe(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(orderId), 'phase8_invalid_order_id')
      const c = await pool.connect()
      try {
        await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        const order = await c.query('SELECT * FROM orders WHERE id=$1', [orderId])
        const items = await c.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id', [orderId])
        const reservations = await c.query('SELECT * FROM inventory_reservations WHERE order_id=$1 ORDER BY product_id', [orderId])
        const products = await c.query('SELECT p.* FROM products p JOIN orders o ON o.store_id=p.store_id WHERE o.id=$1 AND p.id IN (SELECT product_id FROM order_items WHERE order_id=$1) ORDER BY p.id', [orderId])
        const movements = await c.query('SELECT * FROM inventory_movements WHERE order_id=$1 ORDER BY created_at,id', [orderId])
        const events = await c.query('SELECT * FROM order_status_events WHERE order_id=$1 ORDER BY created_at,id', [orderId])
        await c.query('ROLLBACK')
        return { order: order.rows, items: items.rows, products: products.rows, reservations: reservations.rows, movements: movements.rows, events: events.rows }
      } catch (error) { try { await c.query('ROLLBACK') } catch {} throw error }
      finally { c.release() }
    },
    // No delete/truncate/drop or audit-trigger bypass. Failed data remains isolated.
    close: () => pool.end()
  }
}
