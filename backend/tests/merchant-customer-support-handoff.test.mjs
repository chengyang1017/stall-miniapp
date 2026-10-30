import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Load the actual handler, replacing only its auth boundary. Never import server.mjs:
// importing the server starts background database workers.
const source = readFileSync(new URL('../src/support.mjs', import.meta.url), 'utf8')
const authImport = /^import \{ authenticate, permittedStore \} from '\.\/auth\.mjs'\s*$/m
assert.match(source, authImport)
const moduleSource = source.replace(authImport, `
const authenticate = async (_pool,req) => req.testSubject || null
const permittedStore = async (_pool,subject,slug) => subject === 'merchant' && slug === 'demo-store' ? {id:'store-one',role:'owner'} : null
`)
const { supportRoute } = await import('data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64'))

const ID = '11111111-1111-4111-8111-111111111111'
const KEY1 = '22222222-2222-4222-8222-222222222222'
const KEY2 = '33333333-3333-4333-8333-333333333333'

function store() {
  const conversation = { id:ID, store_id:'store-one', customer_subject:'alice', status:'open', last_seq:'0', customer_read_seq:'0', merchant_read_seq:'0' }
  const messages = []
  const queries = []
  const db = {
    queries, messages, conversation,
    async query(sql,params=[]) {
      const s=String(sql);queries.push({sql:s,params})
      if(s.includes('SELECT id FROM stores WHERE slug='))return {rows:params[0]==='demo-store'?[{id:'store-one'}]:[]}
      if(s.includes('SELECT pg_advisory_xact_lock'))return {rows:[]}
      if(s.startsWith('INSERT INTO support_conversations'))return {rows:[]}
      if(s.includes('SELECT * FROM support_conversations')) {
        const ok=params[0]==='store-one' && (s.includes('customer_subject=$2') ? params[1]==='alice' : params[1]===ID)
        return {rows:ok?[conversation]:[]}
      }
      if(s.includes('SELECT id,seq::text AS seq,sender_role AS sender') && s.includes('sender_subject=$2')) {
        return {rows:messages.filter(m=>m.senderSubject===params[1]&&m.clientKey===params[2]).map(publicMessage)}
      }
      if(s.includes('SELECT count(*) AS n FROM support_messages'))return {rows:[{n:'0'}]}
      if(s.startsWith('UPDATE support_conversations SET last_seq=')){
        conversation.last_seq=String(Number(conversation.last_seq)+1)
        return {rows:[{last_seq:conversation.last_seq}]}
      }
      if(s.startsWith('INSERT INTO support_messages(')){
        const m={id:`msg-${messages.length+1}`,seq:String(params[1]),sender:params[2],senderSubject:params[3],clientKey:params[4],content:params[5],createdAt:'2026-10-25T10:00:00.000Z'}
        messages.push(m);return {rows:[publicMessage(m)]}
      }
      if(s.includes('SELECT count(*)::int AS unread FROM support_messages')){
        const read=params[3]==='merchant'?Number(conversation.customer_read_seq):Number(conversation.merchant_read_seq)
        return {rows:[{unread:messages.filter(m=>m.sender===params[3]&&Number(m.seq)>read).length}]}
      }
      if(s.startsWith('UPDATE support_conversations SET merchant_read_seq=')){
        conversation.merchant_read_seq=String(Math.max(Number(conversation.merchant_read_seq),Number(params[1])))
        return {rows:[]}
      }
      if(s.startsWith('UPDATE support_conversations SET customer_read_seq=')){
        conversation.customer_read_seq=String(Math.max(Number(conversation.customer_read_seq),Number(params[1])))
        return {rows:[]}
      }
      if(s.includes('FROM support_messages WHERE conversation_id=$1')&&s.includes('ORDER BY seq')){
        const cutoff=BigInt(params[1]),after=s.includes('AND seq>$2'),limit=params[2]
        const values=messages.filter(m=>after?BigInt(m.seq)>cutoff:BigInt(m.seq)<cutoff)
        values.sort((a,b)=>after?Number(a.seq)-Number(b.seq):Number(b.seq)-Number(a.seq))
        return {rows:values.slice(0,limit).map(publicMessage)}
      }
      if(s.includes('SELECT c.id,c.status,c.last_seq'))return {rows:[]}
      if(s.includes('SELECT md5('))return {rows:[{rev:'a'.repeat(32)}]}
      if(s.includes('SELECT c.id,c.status') || s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK') || s.startsWith('SET '))return {rows:[]}
      throw Error('Unexpected DB query in fixture: '+s.slice(0,160))
    },
    async connect(){return {query:(...args)=>db.query(...args),release(){}}}
  }
  return db
}
function publicMessage(m){return {id:m.id,seq:m.seq,sender:m.sender,clientKey:m.clientKey,content:m.content,createdAt:m.createdAt}}
function request(subject,method,path,payload){
  const raw=payload===undefined?'':JSON.stringify(payload)
  return {testSubject:subject,method,headers:{'content-length':String(Buffer.byteLength(raw))},async *[Symbol.asyncIterator](){if(raw)yield Buffer.from(raw)},url:new URL('http://localhost'+path)}
}
async function invoke(db,subject,method,path,payload){
  const req=request(subject,method,path,payload)
  const res={status:null,body:null,writeHead(status){this.status=status},end(raw){this.body=JSON.parse(raw)}}
  assert.equal(await supportRoute(req,res,req.url,db),true)
  return res
}
const customerPath='/v1/stores/demo-store/support'
const merchantPath=`/v1/merchant/stores/demo-store/support/conversations/${ID}`

test('customer sends -> merchant reads and replies -> customer sees the same conversation',async()=>{
  const db=store()
  const first=await invoke(db,'alice','POST',customerPath+'/messages',{content:'Where is my order?',clientKey:KEY1})
  assert.equal(first.status,200)
  assert.equal(first.body.message.seq,'1')
  const merchant=await invoke(db,'merchant','GET',merchantPath+'/messages')
  assert.equal(merchant.status,200)
  assert.deepEqual(merchant.body.messages.map(m=>m.content),['Where is my order?'])
  const reply=await invoke(db,'merchant','POST',merchantPath+'/messages',{content:'Out for delivery',clientKey:KEY2})
  assert.equal(reply.status,200)
  assert.equal(reply.body.message.seq,'2')
  const customer=await invoke(db,'alice','GET',customerPath+'/messages')
  assert.equal(customer.status,200)
  assert.deepEqual(customer.body.messages.map(m=>[m.sender,m.content]),[['customer','Where is my order?'],['merchant','Out for delivery']])
})

test('message retry is idempotent and key reuse with different content is rejected',async()=>{
  const db=store(),payload={content:'Please call me',clientKey:KEY1}
  assert.equal((await invoke(db,'alice','POST',customerPath+'/messages',payload)).status,200)
  const repeat=await invoke(db,'alice','POST',customerPath+'/messages',payload)
  assert.equal(repeat.status,200)
  assert.equal(db.messages.length,1)
  const conflict=await invoke(db,'alice','POST',customerPath+'/messages',{...payload,content:'Different text'})
  assert.equal(conflict.status,409)
  assert.equal(conflict.body.error,'idempotency_conflict')
  assert.equal(db.messages.length,1)
})

test('unread counters change after sender messages and recipient read receipts',async()=>{
  const db=store()
  await invoke(db,'alice','POST',customerPath+'/messages',{content:'Hello',clientKey:KEY1})
  let unread=await invoke(db,'merchant','GET','/v1/merchant/stores/demo-store/support/unread')
  assert.equal(unread.body.unread,1)
  const marked=await invoke(db,'merchant','POST',merchantPath+'/read',{through:'1'})
  assert.equal(marked.status,200)
  unread=await invoke(db,'merchant','GET','/v1/merchant/stores/demo-store/support/unread')
  assert.equal(unread.body.unread,0)
  await invoke(db,'merchant','POST',merchantPath+'/messages',{content:'Hello back',clientKey:KEY2})
  const customerUnread=await invoke(db,'alice','GET',customerPath+'/unread')
  assert.equal(customerUnread.body.unread,1)
  assert.equal((await invoke(db,'alice','POST',customerPath+'/read',{through:'2'})).status,200)
  assert.equal((await invoke(db,'alice','GET',customerPath+'/unread')).body.unread,0)
})

test('foreign customer and unauthorized merchant cannot read or write the conversation',async()=>{
  const db=store()
  await invoke(db,'alice','POST',customerPath+'/messages',{content:'Private',clientKey:KEY1})
  const stranger=await invoke(db,'bob','GET',customerPath+'/messages')
  assert.equal(stranger.status,200)
  assert.deepEqual(stranger.body.messages,[])
  const forbidden=await invoke(db,'bob','GET',merchantPath+'/messages')
  assert.equal(forbidden.status,403)
  assert.equal(db.messages.length,1)
})

test('message API exposes server-stored clientKey for exact optimistic reconciliation',async()=>{
 const db=store();const result=await invoke(db,'alice','POST',customerPath+'/messages',{content:'safe retry',clientKey:KEY1})
 assert.equal(result.body.message.clientKey,KEY1)
 const read=await invoke(db,'alice','GET',customerPath+'/messages')
 assert.equal(read.body.messages[0].clientKey,KEY1)
 const projectionQueries=db.queries.filter(q=>q.sql.includes('FROM support_messages WHERE conversation_id=$1')&&q.sql.includes('seq::text'))
 assert.ok(projectionQueries.length>0)
 for(const query of projectionQueries)assert.match(query.sql,/client_key AS "clientKey"/)
})
