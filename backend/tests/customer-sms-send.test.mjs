import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {customerSmsSendRoute} from '../src/customerSmsSend.mjs'
const url=new URL('http://localhost/v1/customer/auth/sms/send')
function req(data){const r=Readable.from([JSON.stringify(data)]);r.method='POST';r.socket={remoteAddress:'127.0.0.1'};return r}
function output(){const x={};return {x,res:{writeHead(s){x.status=s},end(b){x.body=JSON.parse(b)}}}}
async function gate(fn){const keys=['PAYMENT_DB_ENV','CUSTOMER_ACCOUNT_MAPPING_ENABLED','CUSTOMER_PHONE_SESSION_ENABLED','CUSTOMER_SMS_PROVIDER_READY','CUSTOMER_SMS_LOGIN_ENABLED','CUSTOMER_SMS_HMAC_SECRET'],prev=keys.map(k=>process.env[k]);try{Object.assign(process.env,{PAYMENT_DB_ENV:'isolated-test',CUSTOMER_ACCOUNT_MAPPING_ENABLED:'true',CUSTOMER_PHONE_SESSION_ENABLED:'true',CUSTOMER_SMS_PROVIDER_READY:'true',CUSTOMER_SMS_LOGIN_ENABLED:'true',CUSTOMER_SMS_HMAC_SECRET:'s'.repeat(40)});await fn()}finally{keys.forEach((k,i)=>prev[i]===undefined?delete process.env[k]:process.env[k]=prev[i])}}
test('no send adapter means endpoint stays closed even with feature flags',async()=>gate(async()=>{const {x,res}=output();await customerSmsSendRoute(req({phone:'+8613812345678'}),res,url,null);assert.equal(x.status,404)}))
test('only phone accepted, remote address from trusted socket',async()=>gate(async()=>{const {x,res}=output();await customerSmsSendRoute(req({phone:'+8613812345678',remoteIp:'127.0.0.2'}),res,url,{}, {send:async()=>{},issue(){throw Error('never')}});assert.equal(x.status,400)}))
test('server-approved adapter gets bounded issuance input; never leaks OTP',async()=>gate(async()=>{const {x,res}=output();let params;const send=async()=>{};await customerSmsSendRoute(req({phone:'+8613812345678'}),res,url,{}, {send,issue:async(_pool,p)=>{params=p;return {accepted:true}}});assert.equal(x.status,200);assert.deepEqual(x.body,{ok:true});assert.equal(params.remoteIp,'127.0.0.1');assert.equal(params.send,send)}))
test('rate limit response is generic',async()=>gate(async()=>{const {x,res}=output();await customerSmsSendRoute(req({phone:'+8613812345678'}),res,url,{}, {send:async()=>{},issue:async()=>({accepted:false})});assert.equal(x.status,429);assert.deepEqual(x.body,{error:'try_later'})}))
test('provider failures do not claim delivery',async()=>gate(async()=>{const {x,res}=output();await customerSmsSendRoute(req({phone:'+8613812345678'}),res,url,{}, {send:async()=>{},issue:async()=>{throw Error('provider unavailable')}});assert.equal(x.status,503)}))
