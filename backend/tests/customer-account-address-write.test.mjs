import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {customerAccountAddressWriteRoute} from '../src/customerAccountAddressWrite.mjs'
const base=new URL('http://localhost/v1/customer/account/stores/demo-shop/addresses')
const id='7f08a781-f880-41e6-a088-f6a849c1648a',token='x'.repeat(43)
function output(){const out={};return {out,res:{writeHead(status){out.status=status},end(body){out.body=JSON.parse(body)}}}}
async function gate(fn){const keys=['PAYMENT_DB_ENV','CUSTOMER_ACCOUNT_MAPPING_ENABLED','CUSTOMER_PHONE_SESSION_ENABLED','CUSTOMER_PHONE_ADDRESS_WRITE_ENABLED'],prev=keys.map(k=>process.env[k]);try{Object.assign(process.env,{PAYMENT_DB_ENV:'isolated-test',CUSTOMER_ACCOUNT_MAPPING_ENABLED:'true',CUSTOMER_PHONE_SESSION_ENABLED:'true',CUSTOMER_PHONE_ADDRESS_WRITE_ENABLED:'true'});await fn()}finally{keys.forEach((k,i)=>prev[i]===undefined?delete process.env[k]:process.env[k]=prev[i])}}
const req=method=>({method,headers:{authorization:'Bearer '+token}})
test('no takeover of legacy endpoint or GET',async()=>{const {res}=output();assert.equal(await customerAccountAddressWriteRoute(req('GET'),res,base,null),false);assert.equal(await customerAccountAddressWriteRoute(req('POST'),res,new URL('http://localhost/v1/stores/demo-shop/addresses'),null),false)})
test('writes remain disabled without explicit isolated test opt-in',async()=>gate(async()=>{delete process.env.CUSTOMER_PHONE_ADDRESS_WRITE_ENABLED;const {out,res}=output();await customerAccountAddressWriteRoute(req('POST'),res,base,null);assert.equal(out.status,404)}))
test('invalid session is denied before linked identity lookup',async()=>gate(async()=>{const {out,res}=output();await customerAccountAddressWriteRoute({method:'POST',headers:{authorization:'Bearer bad'}},res,base,{query(){throw Error('no query')}});assert.equal(out.status,401)}))
test('accounts without a unique verified WeChat identity cannot mutate addresses',async()=>gate(async()=>{for(const rows of [[],[{provider_subject:'a'},{provider_subject:'b'}]]){const {out,res}=output();let n=0;const pool={async query(){n++;return n===1?{rows:[{account_id:id}]}:{rows}}};await customerAccountAddressWriteRoute(req('POST'),res,base,pool);assert.equal(out.status,409);assert.equal(n,2)}}))
test('reject malformed address IDs and unexpected methods',async()=>gate(async()=>{const {out,res}=output();await customerAccountAddressWriteRoute(req('DELETE'),res,new URL(base.href+'/x'),null);assert.equal(out.status,400);const x=output();await customerAccountAddressWriteRoute(req('POST'),x.res,new URL(base.href+'/'+id),null);assert.equal(x.out.status,405)}))

test('WeChat PUT is translated to legacy PATCH only after session and identity verification',async()=>gate(async()=>{
 const {out,res}=output()
 const subject='wx:wx0123456789abcdef:verified_sub'
 const request={...req('PUT'),async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({isDefault:true,expectedVersion:1}))}}
 const queries=[]
 const store='a5b6dfee-83b7-414f-af12-14293848d012'
 const client={async query(sql,params){queries.push(sql);if(sql.startsWith('SELECT * FROM customer_addresses'))return {rows:[]};return {rows:[]}},release(){}}
 const pool={async query(sql){queries.push(sql);if(sql.includes('customer_account_sessions'))return {rows:[{account_id:id}]};if(sql.includes('customer_login_identities'))return {rows:[{provider_subject:subject}]};if(sql.includes('SELECT id FROM stores'))return {rows:[{id:store}]};return {rows:[]}},async connect(){return client}}
 await customerAccountAddressWriteRoute(request,res,new URL(base.href+'/'+id),pool)
 assert.equal(request.method,'PATCH')
 assert.equal(out.status,404)
 assert.equal(out.body.error,'address_not_found')
 assert.ok(queries.some(x=>x.includes('customer_login_identities')))
}))

test('server routes account address writes before read-only method guard',()=>{
 const source=readFileSync(new URL('../src/server.mjs',import.meta.url),'utf8')
 const write=source.indexOf('if (await customerAccountAddressWriteRoute(req,res,url,pool)) return')
 const read=source.indexOf('if (await customerAccountAddressReadRoute(req,res,url,pool)) return')
 assert.ok(write>=0&&read>write,'POST must not be consumed by GET-only route')
})
