import test from 'node:test'
import assert from 'node:assert/strict'
import {customerWechatIdentityLinkRoute} from '../src/customerWechatIdentityLinkRoute.mjs'
const url=new URL('http://localhost/v1/customer/identity/wechat-link')
function response(){const out={};return {out,res:{writeHead(status){out.status=status},end(json){out.body=JSON.parse(json)}}}}
async function withGate(on,run){
 const keys=['PAYMENT_DB_ENV','CUSTOMER_ACCOUNT_MAPPING_ENABLED','CUSTOMER_WECHAT_LINK_ENABLED']
 const prior=keys.map(k=>process.env[k])
 try{
  if(on){process.env.PAYMENT_DB_ENV='isolated-test';process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED='true';process.env.CUSTOMER_WECHAT_LINK_ENABLED='true'}
  else keys.forEach(k=>delete process.env[k])
  await run()
 }finally{keys.forEach((k,i)=>prior[i]===undefined?delete process.env[k]:process.env[k]=prior[i])}
}
test('unknown route is ignored',async()=>{const {out,res}=response();assert.equal(await customerWechatIdentityLinkRoute({method:'POST'},res,new URL('http://localhost/nope'),null),false);assert.equal(out.status,undefined)})
test('default disabled gate never authenticates or touches database',async()=>withGate(false,async()=>{const {out,res}=response();assert.equal(await customerWechatIdentityLinkRoute({method:'POST'},res,url,null,{authenticateSession(){throw Error('called')}}),true);assert.equal(out.status,404)}))
test('enabled route requires existing session',async()=>withGate(true,async()=>{const {out,res}=response();await customerWechatIdentityLinkRoute({method:'POST'},res,url,null,{authenticateSession:async()=>null});assert.equal(out.status,401)}))
test('existing WeChat identity cannot link again',async()=>withGate(true,async()=>{const {out,res}=response();const pool={query:async()=>({rows:[{id:'id'}]})};await customerWechatIdentityLinkRoute({method:'POST'},res,url,pool,{authenticateSession:async()=> 'wx:subject'});assert.equal(out.status,409);assert.equal(out.body.error,'already_wechat_linked')}))
test('unmapped session is denied until genuine phone sessions exist',async()=>withGate(true,async()=>{const {out,res}=response();const pool={query:async()=>({rows:[]})};await customerWechatIdentityLinkRoute({method:'POST'},res,url,pool,{authenticateSession:async()=> 'phone:subject'});assert.equal(out.status,403);assert.equal(out.body.error,'phone_session_not_supported_yet')}))
