// Real connections and SQL only, not a simulated database or copied business algorithm.
import { check } from './policy.mjs'
export function fixture(pool,g) {
  check(g.purpose==='fixture'&&g.role==='app','fixture_role_rejected')
  const routePool=client=>{let busy=false;return {query:(s,a)=>{check(!busy,'connection_borrowed');return client.query(s,a)},async connect(){check(!busy,'connection_borrowed');busy=true;let done=false;return {query:(s,a)=>{check(!done,'connection_released');return client.query(s,a)},release(error){if(!done){done=true;busy=false;if(error)client.release(error)}}}}}}
  return {namespace:'p8r2_'+g.runId.replaceAll('-',''),
    async connections(action){const clients=[];try{
      for(let i=0;i<3;i++)clients.push(await pool.connect())
      const pids=await Promise.all(clients.map(async c=>(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid))
      check(new Set(pids).size===3&&pids.every(Number.isInteger),'backend_pid_rejected')
      // This observation connection uses the app identity, but cannot write in
      // this transaction. Permission auditing uses a separate observer-only job.
      await clients[2].query('BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY')
      return await action({first:clients[0],second:clients[1],observer:clients[2],pids,firstPool:routePool(clients[0]),secondPool:routePool(clients[1])})
    }finally{for(const c of clients)c.release(Error('phase8_v2_scope_finished'))}},
    async waitForBlocked(observer,waiter,holder,ms=5000){check(Number.isInteger(waiter)&&Number.isInteger(holder)&&waiter!==holder&&Number.isInteger(ms)&&ms>0&&ms<=8000,'lock_parameters_rejected');const deadline=performance.now()+ms
      while(performance.now()<deadline){if((await observer.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked',[waiter,holder])).rows[0].blocked===true)return;await new Promise(r=>setTimeout(r,20))}check(false,'lock_not_observed')},
    async finalOrder(id){check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id),'order_id_rejected');const c=await pool.connect();try{
      await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const out={}
      for(const [key,sql]of Object.entries({order:'SELECT * FROM orders WHERE id=$1',items:'SELECT * FROM order_items WHERE order_id=$1 ORDER BY id',reservations:'SELECT * FROM inventory_reservations WHERE order_id=$1 ORDER BY product_id',movements:'SELECT * FROM inventory_movements WHERE order_id=$1 ORDER BY created_at,id',events:'SELECT * FROM order_status_events WHERE order_id=$1 ORDER BY created_at,id',products:'SELECT p.* FROM products p JOIN orders o ON o.store_id=p.store_id JOIN order_items i ON i.order_id=o.id AND i.product_id=p.id WHERE o.id=$1 ORDER BY p.id'}))out[key]=(await c.query(sql,[id])).rows
      await c.query('ROLLBACK');return out
    }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}finally{c.release()}},close:()=>pool.end()}
}
