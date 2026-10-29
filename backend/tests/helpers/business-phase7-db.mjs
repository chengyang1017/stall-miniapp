// Test-only SQL adapter. Runs the real routes, auth, delivery validation and inventory
// functions without a DB/network. This models selected SQL effects, NOT PostgreSQL.
// In particular, locks/constraints here are assumptions; live PostgreSQL must verify them.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export const STORE_A = '22222222-2222-4222-8222-222222222222'
export const STORE_B = '22222222-2222-4222-8222-222222222223'
export const PRODUCT_A = '11111111-1111-4111-8111-111111111111'
export const PRODUCT_B = '11111111-1111-4111-8111-111111111112'
export const NOW = new Date('2026-10-26T04:00:00Z')
const copy = value => structuredClone(value)
const result = rows => ({ rows: copy(rows), rowCount: rows.length })
export function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

class Locks {
  owners = new Map()
  queues = new Map()
  observers = []
  tryAcquire(key, client) {
    if (this.owners.has(key) && this.owners.get(key) !== client) return false
    this.owners.set(key, client); client.locks.add(key); return true
  }
  async acquire(key, client) {
    if (this.tryAcquire(key, client)) return
    const ready = deferred(), queue = this.queues.get(key) || []
    queue.push({ client, ready }); this.queues.set(key, queue)
    for (const observer of this.observers) {
      if (observer.key === key && queue.length >= observer.count) observer.ready.resolve()
    }
    await ready.promise
  }
  blocked(key, count = 1) {
    if ((this.queues.get(key)?.length || 0) >= count) return Promise.resolve()
    const ready = deferred(); this.observers.push({ key, count, ready }); return ready.promise
  }
  release(client) {
    for (const key of client.locks) {
      assert.equal(this.owners.get(key), client)
      const next = this.queues.get(key)?.shift()
      if (next) {
        this.owners.set(key, next.client); next.client.locks.add(key); next.ready.resolve()
      } else this.owners.delete(key)
    }
    client.locks.clear()
  }
}

export function fixture({ stock = 10, secondStock = 10, mode = 'finite' } = {}) {
  const stores = new Map([['alpha', { id: STORE_A, slug: 'alpha', name: '甲店' }], ['beta', { id: STORE_B, slug: 'beta', name: '乙店' }]])
  const tables = Object.fromEntries(['products', 'orders', 'items', 'reservations', 'movements', 'events', 'simulations', 'payments'].map(t => [t, new Map()]))
  const product = (id, store, quantity) => ({ id, store_id: store, name: '商品' + id.slice(-2), price_cents: 1200,
    discount_price_cents: null, discount_start: null, discount_end: null, active: true, sold_out: false,
    stock_mode: mode, stock_quantity: quantity, inventory_version: 1 })
  tables.products.set(PRODUCT_A, product(PRODUCT_A, STORE_A, stock))
  tables.products.set(PRODUCT_B, product(PRODUCT_B, STORE_A, secondStock))
  const betaProduct = '11111111-1111-4111-8111-111111111113'
  tables.products.set(betaProduct, product(betaProduct, STORE_B, stock))
  const sessions = new Map(), members = new Map()
  for (const [subject, slug, role] of [['owner-a', 'alpha', 'owner'], ['manager-a', 'alpha', 'manager'], ['owner-b', 'beta', 'owner'], ['viewer-a', 'alpha', 'viewer']]) {
    members.set(subject + ':' + slug, { ...stores.get(slug), role })
  }
  const rules = { accepting: true, days: Array.from({ length: 7 }, () => ({ enabled: true, start: '00:00', end: '23:59' })),
    areas: [{ id: 'zone', name: '配送区', enabled: true, latitude: null, longitude: null, radiusMeters: null }],
    slots: [{ id: 'slot', label: '白天', enabled: true, start: '10:00', end: '20:00' }], specialDates: [], minimumOrderCents: 0 }
  const db = { simulationEnabled:true,databaseMatches:true,simulationInstance:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',testGrants:new Set(), tables, stores, members, sessions, rules, now: new Date(NOW), betaProduct, locks: new Locks(), clients: [], trace: [], hooks: [], failures: [], counter: 0,
    // Sweep selection is deliberately explicit. The adapter does not pretend to
    // execute the worker's PostgreSQL WHERE expression/payment-events subquery.
    sweepCandidates: new Set(),
    token(subject) {
      const token = createHash('sha256').update('phase7-only:' + subject).digest('base64url')
      sessions.set(createHash('sha256').update(token).digest('hex'), subject); return token
    },
    rows(table) { return copy([...tables[table].values()]) },
    pauseOnce(predicate) {
      const entered = deferred(), proceed = deferred()
      this.hooks.push({ predicate, entered, proceed })
      return { entered: entered.promise, release: () => proceed.resolve() }
    },
    failOnce(predicate, occurrence = 1) { this.failures.push({ predicate, remaining: occurrence }) },
    async query(sql, args = []) { return dispatch(null, sql, args) },
    async connect() {
      const client = { id: this.clients.length, active: false, released: false, locks: new Set(), writes: {},
        query: (sql, args = []) => dispatch(client, sql, args),
        release() { assert.equal(this.active, false, 'route leaked an open transaction'); assert.equal(this.locks.size, 0); this.released = true } }
      this.clients.push(client); return client
    },
    assertClosed() { for (const client of this.clients) assert.equal(client.released, true); assert.equal(this.locks.owners.size, 0) }
  }
  const all = (c, table) => new Map([...tables[table], ...Object.entries(c?.writes[table] || {})])
  const get = (c, table, id) => copy(all(c, table).get(id))
  const put = (c, table, id, value) => { assert.ok(c?.active, 'write outside transaction'); (c.writes[table] ||= {})[id] = copy(value) }
  const id = () => '33333333-3333-4333-8333-' + String(++db.counter).padStart(12, '0')
  const scoped = (row, store) => row && row.store_id === store
  async function dispatch(c, sql, args) {
    const s = String(sql).replace(/\s+/g, ' ').trim()
    db.trace.push({ client: c?.id ?? null, sql: s, args: copy(args) })
    const hook = db.hooks.find(h => h.predicate(s, args, c))
    if (hook) { db.hooks.splice(db.hooks.indexOf(hook), 1); hook.entered.resolve(); await hook.proceed.promise }
    const failure = db.failures.find(f => f.predicate(s, args, c))
    if (failure && --failure.remaining === 0) { db.failures.splice(db.failures.indexOf(failure), 1); throw Error('phase7_injected_database_failure') }
    if (s === 'BEGIN') { assert.ok(c && !c.active); c.active = true; c.writes = {}; return result([]) }
    if (s === 'COMMIT' || s === 'ROLLBACK') {
      if (c.active && s === 'COMMIT') for (const [table, rows] of Object.entries(c.writes)) for (const [key, row] of Object.entries(rows)) tables[table].set(key, copy(row))
      c.writes = {}; c.active = false; db.locks.release(c); return result([])
    }
    if(s.startsWith('SELECT deployment_id,instance_id,branch_id'))return result(db.databaseMatches&&args[1]===db.simulationInstance?[{deployment_id:args[0],instance_id:args[1],branch_id:args[2]}]:[])
    if(s.startsWith('SELECT count(*)::int AS count,bool_or'))return result([{count:3,unsafe:false}])
    if(s.startsWith('SELECT r.rolsuper'))return result([{rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolbypassrls:false,migrator_member:false,authorization_member:false,schema_create:false,owns_tables:false}])
    if(s.startsWith('SELECT has_any_column_privilege'))return result([{unsafe:false}])
    if(s.startsWith('SELECT has_table_privilege'))return result([{ok:!db.privilegeDenied&&['SELECT','INSERT'].includes(args[1])}])
    if(s.startsWith('SELECT a.attname,has_column_privilege'))return result([{attname:'lock_key',writable:true},{attname:'expires_at',writable:false}])
    if(s==='SELECT current_user AS role')return result([{role:'unit_app'}])
    // Staging-payment transport extension: effects only, NOT PostgreSQL locks/constraints.
    if (s.startsWith("SET LOCAL statement_timeout="))return result([])
    if(s.startsWith('SELECT external_subject FROM auth_sessions')&&s.endsWith('FOR SHARE')){
      assert.match(s,/revoked_at IS NULL AND expires_at>clock_timestamp\(\) FOR SHARE$/)
      return result(sessions.get(args[0])===args[1]?[{external_subject:args[1]}]:[])
    }
    if(s.startsWith('SELECT e.instance_id FROM staging_payment_environment')){
      assert.match(s,/e.database_name=current_database\(\)/);assert.match(s,/FOR SHARE OF e,t,s$/)
      return result(db.simulationEnabled&&db.databaseMatches&&args[0]===db.simulationInstance&&db.testGrants.has(args[1]+':'+args[2])?[{instance_id:args[0]}]:[])
    }
    if(s.startsWith('SELECT o.store_id FROM orders o JOIN stores s')){
      const row=get(c,'orders',args[1]);return result(stores.get(args[0])?.id===row?.store_id&&row.customer_subject===args[2]?[{store_id:row.store_id}]:[])
    }
    if(s.startsWith('SELECT *, (inventory_expires_at')){
      assert.match(s,/customer_subject=\$3 FOR UPDATE$/);await db.locks.acquire('order:'+args[1],c)
      const o=get(c,'orders',args[1]);return result(scoped(o,args[0])&&o.customer_subject===args[2]?[{...o,payment_expired:+o.created_at+900000<=+db.now||o.inventory_expires_at&&+o.inventory_expires_at<=+db.now}]:[])
    }
    if(s.startsWith('SELECT order_id')&&s.includes('FROM staging_payment_confirmations'))return result([...all(c,'simulations').values()].filter(r=>s.includes('request_key=$3')?r.store_id===args[0]&&r.actor_subject===args[1]&&r.request_key===args[2]:r.order_id===args[0]&&r.instance_id===args[1]))
    if(s.startsWith('SELECT i.product_id,i.quantity,r.quantity AS reserved_quantity')){
      assert.match(s,/ORDER BY p.id FOR UPDATE OF p$/);const rows=[]
      for(const i of all(c,'items').values())if(i.order_id===args[1]&&get(c,'products',i.product_id)?.stock_mode==='finite'){
        await db.locks.acquire('product:'+i.product_id,c);const r=get(c,'reservations',args[1]+':'+i.product_id);rows.push({...i,reserved_quantity:r?.quantity,state:r?.state})
      }return result(rows)
    }
    if(s.startsWith('SELECT (created_at+interval')){const o=get(c,'orders',args[1]);return result([{valid:scoped(o,args[0])&&+o.created_at+900000>+db.now&&(!o.inventory_expires_at||+o.inventory_expires_at>+db.now)}])}
    if(s.startsWith('INSERT INTO staging_payment_confirmations')){assert.ok(!all(c,'simulations').has(args[0]));put(c,'simulations',args[0],{order_id:args[0],store_id:args[1],instance_id:args[2],actor_subject:args[3],request_key:args[4],amount_cents:args[5]});return result([])}
    if(s.startsWith('INSERT INTO payment_events')){assert.match(s,/'staging_simulated'/);put(c,'payments',args[0],{order_id:args[0],provider:'staging_simulated',provider_event_id:args[1],amount_cents:args[2]});return result([])}
    if(s.startsWith("UPDATE orders SET payment_status='paid',payment_source='staging_simulated'")){const o=get(c,'orders',args[1]);assert.equal(o.store_id,args[0]);put(c,'orders',o.id,{...o,payment_status:'paid',payment_source:'staging_simulated',simulation_instance_id:args[2]});return result([])}
    if (s.startsWith('SELECT external_subject FROM auth_sessions')) {
      assert.match(s, /WHERE token_hash = \$1 AND revoked_at IS NULL AND expires_at > now\(\)$/)
      return result(sessions.has(args[0]) ? [{ external_subject: sessions.get(args[0]) }] : [])
    }
    if (s.includes('FROM merchant_members mm JOIN stores s')) {
      assert.match(s, /WHERE mm.external_subject = \$1 AND s.slug = \$2 LIMIT 1$/)
      return result(members.has(args[0] + ':' + args[1]) ? [members.get(args[0] + ':' + args[1])] : [])
    }
    if (s.startsWith('SELECT pg_advisory_xact_lock(')) { await db.locks.acquire('key:' + args.join(':'), c); return result([]) }
    if (s === 'SELECT id FROM stores WHERE slug=$1 AND is_active=true') return result(stores.has(args[0]) ? [{ id: stores.get(args[0]).id }] : [])
    if (s.startsWith('SELECT id,total_cents,checkout_fingerprint,')) return result([...all(c, 'orders').values()].filter(o => o.store_id === args[0] && o.customer_subject === args[1] && o.checkout_key === args[2]))
    if (s.startsWith('SELECT configuration FROM store_delivery_rules')) return result([{ configuration: rules }])
    if (s === 'SELECT clock_timestamp() AS now') return result([{ now: db.now }])
    if (s.includes('FROM products p WHERE p.store_id=$1 AND p.id=ANY')) {
      assert.match(s, /ORDER BY p.id FOR UPDATE$/)
      const rows = []
      for (const key of [...args[1]].sort()) {
        await db.locks.acquire('product:' + key, c)
        const row = get(c, 'products', key); if (scoped(row, args[0])) rows.push(row)
      }
      return result(rows)
    }
    if (s.startsWith('INSERT INTO orders(')) {
      assert.ok(![...all(c, 'orders').values()].some(o => o.store_id === args[0] && o.customer_subject === args[1] && o.checkout_key === args[3]), 'duplicate scoped checkout key')
      const key = id(); put(c, 'orders', key, { id: key, store_id: args[0], customer_subject: args[1], subtotal_cents: args[2], total_cents: args[2],
        checkout_key: args[3], checkout_fingerprint: args[4], contact_snapshot: JSON.parse(args[5]), delivery_slot_snapshot: JSON.parse(args[6]),
        currency:'CNY',created_at:new Date(db.now),payment_status: 'unpaid', fulfillment_status: 'new', inventory_state: 'none', inventory_expires_at: null })
      return result([{ id: key }])
    }
    if (s.startsWith('INSERT INTO order_items(')) {
      const key = id(); put(c, 'items', key, { id: key, order_id: args[0], product_id: args[1], product_name: args[2], unit_price_cents: args[3], quantity: args[4], line_total_cents: args[3] * args[4] }); return result([])
    }
    if (s.startsWith("UPDATE orders SET inventory_state='held'")) {
      const row = get(c, 'orders', args[0]); row.inventory_state = 'held'; row.inventory_expires_at = new Date(+db.now + args[1] * 60000)
      put(c, 'orders', row.id, row); return result([{ inventory_expires_at: row.inventory_expires_at }])
    }
    if (s.startsWith('UPDATE products SET stock_quantity=')) {
      assert.match(s, /WHERE store_id=\$1 AND id=\$2(?: AND stock_mode=\$4 AND stock_quantity >= \$3 RETURNING id)?$/)
      await db.locks.acquire('product:' + args[1], c)
      const row = get(c, 'products', args[1]); if (!scoped(row, args[0])) return result([])
      if (s.includes('stock_quantity=stock_quantity-$3')) {
        assert.match(s, /stock_mode=\$4 AND stock_quantity >= \$3 RETURNING id$/)
        if (row.stock_mode !== args[3] || row.stock_quantity < args[2]) return result([])
        row.stock_quantity -= args[2]
      } else { assert.match(s, /stock_quantity=\$3/); row.stock_quantity = args[2] }
      row.inventory_version++; put(c, 'products', row.id, row); return result([{ id: row.id }])
    }
    if (s.startsWith('INSERT INTO inventory_reservations(')) {
      const key = args[1] + ':' + args[2]; assert.ok(!all(c, 'reservations').has(key))
      put(c, 'reservations', key, { store_id: args[0], order_id: args[1], product_id: args[2], quantity: args[3], state: 'held' }); return result([])
    }
    if (s.startsWith('INSERT INTO inventory_movements(')) {
      const key = [args[0], args[1], args[11]].join(':'); assert.ok(!all(c, 'movements').has(key), 'duplicate movement key')
      assert.equal(args[5] + args[6], args[7]); assert.ok(args[7] >= 0 && args[7] <= 1000000)
      put(c, 'movements', key, { store_id: args[0], product_id: args[1], order_id: args[2], before_quantity: args[5], delta: args[6], after_quantity: args[7], source: args[9], actor: args[10], operation_key: args[11] }); return result([])
    }
    if (s.startsWith('SELECT *,inventory_expires_at <=')) {
      assert.match(s, /FROM orders WHERE store_id=\$1 AND id=\$2 FOR UPDATE$/)
      await db.locks.acquire('order:' + args[1], c)
      const row = get(c, 'orders', args[1]); return result(scoped(row, args[0]) ? [{ ...row, inventory_expired: row.inventory_expires_at !== null && +new Date(row.inventory_expires_at) <= +db.now }] : [])
    }
    if (s.startsWith('SELECT o.*,EXISTS(SELECT 1 FROM payment_events')) {
      assert.match(s, /FOR UPDATE SKIP LOCKED$/)
      for (const key of db.sweepCandidates) {
        const row = get(c, 'orders', key)
        if (row?.inventory_state === 'held' && db.locks.tryAcquire('order:' + key, c)) return result([row])
      }
      return result([])
    }
    if (s.startsWith('SELECT product_id,quantity FROM inventory_reservations')) {
      assert.match(s, /WHERE store_id=\$1 AND order_id=\$2 AND state='held' ORDER BY product_id$/)
      return result([...all(c, 'reservations').values()].filter(r => r.store_id === args[0] && r.order_id === args[1] && r.state === 'held').sort((a, b) => a.product_id.localeCompare(b.product_id)))
    }
    if (s === 'SELECT * FROM products WHERE store_id=$1 AND id=$2 FOR UPDATE') {
      await db.locks.acquire('product:' + args[1], c); const row = get(c, 'products', args[1]); return result(scoped(row, args[0]) ? [row] : [])
    }
    if (s.startsWith('UPDATE inventory_reservations SET state=$3')) {
      assert.match(s, /WHERE store_id=\$1 AND order_id=\$2 AND state='held'$/)
      for (const [key, row] of all(c, 'reservations')) if (row.store_id === args[0] && row.order_id === args[1] && row.state === 'held') put(c, 'reservations', key, { ...row, state: args[2] })
      return result([])
    }
    if (s.startsWith('UPDATE orders SET inventory_state=$3') || s.startsWith('UPDATE orders SET fulfillment_status=$3')) {
      assert.match(s, /WHERE store_id=\$1 AND id=\$2$/)
      const row = get(c, 'orders', args[1]); if (!scoped(row, args[0])) return result([])
      if (s.startsWith('UPDATE orders SET inventory_state')) row.inventory_state = args[2]
      else { row.fulfillment_status = args[2]; if (['cancelled', 'abnormal'].includes(args[2])) row.issue_reason = args[4] }
      put(c, 'orders', row.id, row); return result([])
    }
    if (s.startsWith("UPDATE orders SET fulfillment_status='cancelled'")) {
      const row = get(c, 'orders', args[0]); row.fulfillment_status = 'cancelled'; row.issue_reason = args[1] || '未支付预留超时，库存已释放'; put(c, 'orders', row.id, row); return result([])
    }
    if (s.startsWith('INSERT INTO order_status_events(')) {
      // Parse only the explicit VALUES forms used by this route. Use raw SQL so
      // whitespace inside string literals is not normalized by dispatch's log.
      // Unsupported expressions fail closed; this is not a SQL execution engine.
      const insert = String(sql).trim().match(/^INSERT INTO order_status_events\(store_id,order_id,actor_subject,from_status,to_status,note\)\s+VALUES\(([\s\S]*)\)$/)
      assert.ok(insert, 'unsupported order_status_events statement')
      const values = []; let remaining = insert[1]
      while (remaining.length) {
        const token = remaining.match(/^\s*(\$[1-9]\d*|'(?:[^']|'')*'|NULL)\s*(,|$)/)
        assert.ok(token, 'unsupported event value: expected parameter, string literal or NULL')
        const value = token[1]
        if (value.startsWith('$')) {
          const index = Number(value.slice(1)) - 1
          assert.ok(index < args.length, 'missing event SQL parameter'); values.push(args[index])
        } else values.push(value === 'NULL' ? null : value.slice(1, -1).replace(/''/g, "'"))
        remaining = remaining.slice(token[0].length)
        if (token[2] === ',') assert.ok(remaining.trim(), 'trailing event comma')
      }
      assert.equal(values.length, 6, 'order_status_events requires six values')
      const [store_id, order_id, actor, from_status, to_status, note] = values
      put(c, 'events', id(), { store_id, order_id, actor, from_status, to_status, note }); return result([])
    }
    if (s.includes('FROM orders o JOIN stores s') && s.includes('o.customer_subject=$3')) {
      const store = stores.get(args[0]), row = get(c, 'orders', args[1])
      return result(row && store?.id === row.store_id && row.customer_subject === args[2] ? [{ id: row.id, totalCents: row.total_cents,
        paymentStatus: row.payment_status, fulfillmentStatus: row.fulfillment_status, contactSnapshot: row.contact_snapshot, deliverySlotSnapshot: row.delivery_slot_snapshot }] : [])
    }
    if (s.startsWith('SELECT oi.id AS "orderItemId"')) return result([...all(c, 'items').values()].filter(row => row.order_id === args[0]).map(row => ({
      orderItemId: row.id, productId: row.product_id, name: row.product_name, unitPriceCents: row.unit_price_cents, quantity: row.quantity, lineTotalCents: row.line_total_cents })))
    throw Error('phase7_unhandled_sql: ' + s)
  }
  return db
}

export function payload(items = [{ productId: PRODUCT_A, quantity: 1 }]) {
  return { items, address: { receiverName: '测试顾客', phone: '13800138000', areaId: 'zone', detail: '测试地址' }, slot: { id: 'slot', date: '2026-10-27' }, note: '' }
}
export function request(db, subject, data, key = 'PHASE7_RETRY_KEY_00000001', method = 'POST') {
  const raw = JSON.stringify(data)
  return { method, headers: { authorization: 'Bearer ' + db.token(subject), 'idempotency-key': key, 'content-length': String(Buffer.byteLength(raw)) },
    async *[Symbol.asyncIterator]() { yield Buffer.from(raw) } }
}
export function response({ lost = false } = {}) {
  return { code: null, body: null, writeHead(code) { this.code = code }, end(raw) { if (lost) throw Error('phase7_connection_lost_after_commit'); this.body = JSON.parse(raw) } }
}
