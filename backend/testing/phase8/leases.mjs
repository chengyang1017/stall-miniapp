// Transport-independent lease management, tested with fake clients. No SQL model.
import { requireSafe } from './policy.mjs'
export function guardedPool(rawPool, verify) {
  const active = new Set(); let closed = false,endPromise
  const pool = {
    async connect() {
      requireSafe(!closed, 'phase8_pool_closed')
      const raw = await rawPool.connect(); let released = false, failure = null
      const lease = {
        async query(sql, args) {
          requireSafe(!released, 'phase8_connection_released')
          requireSafe(!failure || /^\s*ROLLBACK\s*;?\s*$/i.test(sql), 'phase8_connection_tainted')
          try { return await raw.query(sql, args) }
          catch (error) {
            failure ||= error
            // Cancellation, server termination and unknown commit outcome cannot
            // be repaired by the caller returning this transport to the pool.
            if(!/^[0-9A-Z]{5}$/.test(error?.code||'') || error.code.startsWith('08') || error.code.startsWith('57') || error.code==='40003' || /^\s*ROLLBACK\s*;?\s*$/i.test(sql)) lease.release(error)
            throw error
          }
        },
        release(error) { if (!released) { released = true; active.delete(lease); raw.release(error || failure || undefined) } }
      }
      try { await verify(lease); requireSafe(!closed, 'phase8_pool_closed'); active.add(lease); return lease }
      catch (error) { lease.release(error); throw error }
    },
    async query(sql, args) {
      const c = await pool.connect(); let error
      try { return await c.query(sql, args) } catch (e) { error = e; throw e } finally { c.release(error) }
    },
    end() { if(!endPromise){closed=true;for(const c of [...active])c.release(Error('phase8_fixture_closed'));endPromise=rawPool.end()}return endPromise }
  }
  return pool
}
