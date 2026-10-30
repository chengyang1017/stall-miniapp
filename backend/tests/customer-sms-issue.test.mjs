import test from 'node:test'
import assert from 'node:assert/strict'
import {issueCustomerSmsChallenge} from '../src/customerSmsIssue.mjs'
const secret='test-secret-32-bytes-long-and-not-real-use'
const phone='+8613812345678'
function mock(quota={phone_hour:0,ip_hour:0,phone_minute:0}){
 const q=[];let released=false
 return {q,get released(){return released},pool:{async connect(){return {async query(sql,params){q.push({sql,params});if(sql.includes('AS phone_hour'))return {rows:[quota]};return {rows:[]}},release(){released=true}}}}}
}
test('never sends when phone or IP quota is exhausted',async()=>{
 for(const quota of [{phone_hour:5,ip_hour:0,phone_minute:0},{phone_hour:0,ip_hour:20,phone_minute:0},{phone_hour:0,ip_hour:0,phone_minute:1}]){
  const db=mock(quota);let sends=0;const out=await issueCustomerSmsChallenge(db.pool,{phone,remoteIp:'127.0.0.1',secret,send:async()=>{sends++}})
  assert.deepEqual(out,{accepted:false,reason:'rate_limited'});assert.equal(sends,0);assert.equal(db.q.some(x=>x.sql.includes('INSERT INTO customer_sms_challenges')),false);assert.ok(db.released)
 }
})
test('generated code is six digits, stored hashed, never returned',async()=>{
 const db=mock(),sent=[];const r=await issueCustomerSmsChallenge(db.pool,{phone,remoteIp:'127.0.0.1',secret,send:async x=>sent.push(x)})
 assert.deepEqual(r,{accepted:true});assert.match(sent[0].code,/^\d{6}$/)
 const insert=db.q.find(x=>x.sql.includes('INSERT INTO customer_sms_challenges'))
 assert.match(insert.params[1],/^[a-f0-9]{64}$/);assert.notEqual(insert.params[1],sent[0].code)
 assert.equal(db.q.filter(x=>x.sql.includes('pg_advisory_xact_lock')).length,2)
 assert.ok(db.q.some(x=>x.sql==='COMMIT'))
})
test('provider failure invalidates the committed OTP while keeping the quota record',async()=>{
 const db=mock()
 await assert.rejects(()=>issueCustomerSmsChallenge(db.pool,{phone,remoteIp:'127.0.0.1',secret,send:async()=>{
  assert.ok(db.q.some(x=>x.sql==='COMMIT'))
  throw Error('provider_offline')
 }}),/provider_offline/)
 assert.ok(db.q.some(x=>x.sql.includes('UPDATE customer_sms_challenges SET consumed_at=now()')))
 assert.ok(db.q.some(x=>x.sql.includes('INSERT INTO customer_sms_issue_attempts')))
 assert.ok(db.released)
})
test('SMS is dispatched only after the challenge is committed',async()=>{
 const db=mock()
 await issueCustomerSmsChallenge(db.pool,{phone,remoteIp:'127.0.0.1',secret,send:async()=>{
  assert.equal(db.q.at(-1).sql,'COMMIT')
 }})
})
test('no untrusted client-supplied provider or IP accepted',async()=>{
 const db=mock()
 await assert.rejects(()=>issueCustomerSmsChallenge(db.pool,{phone,remoteIp:'from-client',secret,send:async()=>{}}),/trusted_remote_ip_required/)
 await assert.rejects(()=>issueCustomerSmsChallenge(db.pool,{phone,remoteIp:'127.0.0.1',secret}),/approved_sms_provider_required/)
 assert.equal(db.q.length,0)
})
