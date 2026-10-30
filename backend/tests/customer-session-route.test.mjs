import test from 'node:test'
import assert from 'node:assert/strict'
import {customerSessionRoute} from '../src/customerSessionRoute.mjs'
const url=new URL('http://localhost/v1/customer/auth/session')
const id='7f08a781-f880-41e6-a088-f6a849c1648a'
const token='x'.repeat(43)
function response(){let out={};return {out,res:{writeHead(status){out.status=status},end(body){out.body=JSON.parse(body)}}}}
async function gate(fn){const keys=['PAYMENT_DB_ENV','CUSTOMER_ACCOUNT_MAPPING_ENABLED','CUSTOMER_PHONE_SESSION_ENABLED'];const prev=keys.map(x=>process.env[x]);try{Object.assign(process.env,{PAYMENT_DB_ENV:'isolated-test',CUSTOMER_ACCOUNT_MAPPING_ENABLED:'true',CUSTOMER_PHONE_SESSION_ENABLED:'true'});await fn()}finally{keys.forEach((x,i)=>prev[i]===undefined?delete process.env[x]:process.env[x]=prev[i])}}
test('customer session is disabled without stage opt-in',async()=>{const before=process.env.CUSTOMER_PHONE_SESSION_ENABLED;delete process.env.CUSTOMER_PHONE_SESSION_ENABLED;try{const {out,res}=response();await customerSessionRoute({method:'GET'},res,url,null);assert.equal(out.status,404)}finally{if(before!==undefined)process.env.CUSTOMER_PHONE_SESSION_ENABLED=before}})
test('legacy invalid token cannot retrieve profile',async()=>gate(async()=>{const {out,res}=response();await customerSessionRoute({method:'GET',headers:{authorization:'Bearer bad'}},res,url,{query(){throw Error('no database')}});assert.equal(out.status,401)}))
test('independent customer session can read its profile',async()=>gate(async()=>{const {out,res}=response();let call=0;const pool={async query(sql){call++;return call===1?{rows:[{account_id:id}]}:{rows:[{id,nickname:'Shopper',avatar_style:'blue',phone_bound:true,masked_phone:'+86*******5678'}]}}};await customerSessionRoute({method:'GET',headers:{authorization:'Bearer '+token}},res,url,pool);assert.equal(out.status,200);assert.deepEqual(out.body,{accountId:id,nickname:'Shopper',avatarStyle:'blue',phoneBound:true,maskedPhone:'+86*******5678'})}))
test('logout invalidates independent token and no merchant session',async()=>gate(async()=>{const {out,res}=response();let queries=[];const pool={async query(sql){queries.push(sql);return sql.includes('UPDATE')?{rowCount:1}:{rows:[{account_id:id}]}}};await customerSessionRoute({method:'DELETE',headers:{authorization:'Bearer '+token}},res,url,pool);assert.equal(out.status,200);assert.ok(queries.some(x=>x.includes('UPDATE customer_account_sessions')));assert.equal(queries.some(x=>x.includes('auth_sessions SET')),false)}))

test('session profile SQL only selects account-owned masked phone',async()=>gate(async()=>{const {out,res}=response();const sql=[];const pool={async query(q){sql.push(q);return sql.length===1?{rows:[{account_id:id}]}:{rows:[{id,nickname:null,avatar_style:null,phone_bound:false,masked_phone:null}]}}};await customerSessionRoute({method:'GET',headers:{authorization:'Bearer '+token}},res,url,pool);assert.equal(out.status,200);assert.equal(out.body.maskedPhone,null);assert.equal(out.body.phoneBound,false);assert.match(sql[1],/p\.account_id=a\.id/);assert.match(sql[1],/WHERE a\.id=\$1/);assert.equal(JSON.stringify(out.body).includes('phone_e164'),false)}))

test('phone session SQL uses real whitespace, never literal backslash-n tokens',async()=>gate(async()=>{
 const sql=[];const pool={async query(q){sql.push(q);return sql.length===1?{rows:[{account_id:id}]}:{rows:[{id,nickname:'Shopper',avatar_style:'blue',phone_bound:true,masked_phone:'+86*******5678'}]}}};
 const {out,res}=response();await customerSessionRoute({method:'GET',headers:{authorization:'Bearer '+token}},res,url,pool);
 assert.equal(out.status,200);assert.match(sql[1],/phone_bound,\s+CASE/);assert.match(sql[1],/masked_phone\s+FROM/);assert.equal(sql[1].includes(String.raw`\n`),false)
}))
