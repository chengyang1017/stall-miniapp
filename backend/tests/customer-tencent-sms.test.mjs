import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,createHmac} from 'node:crypto'
import {tencentSmsConfiguration,sendTencentSms} from '../src/customerTencentSms.mjs'
const config={id:'AKIDexample',key:'example-secret-key',appId:'1400123456',sign:'Test',template:'123456'}
test('missing Tencent Cloud credentials fail closed',()=>{assert.equal(tencentSmsConfiguration({CUSTOMER_SMS_PROVIDER_READY:'true'}),null)})
test('requests use Tencent Cloud TC3 signing without disclosing credentials in payload',async()=>{let request;const ok={ok:true,async json(){return {Response:{SendStatusSet:[{Code:'Ok'}]}}}};assert.equal(await sendTencentSms({phone:'+8613812345678',code:'012345'},{config,clock:()=>Date.UTC(2026,9,30),fetcher:async(url,opts)=>{request={url,...opts};return ok}}),true);assert.equal(request.url,'https://sms.tencentcloudapi.com/');assert.match(request.headers.Authorization,/TC3-HMAC-SHA256 Credential=/);assert.equal(request.headers['X-TC-Version'],'2021-01-11');assert.deepEqual(JSON.parse(request.body).TemplateParamSet,['012345','5']);assert.equal(request.body.includes(config.key),false)})
test('provider rejection never counts as sent',async()=>{await assert.rejects(()=>sendTencentSms({phone:'+8613812345678',code:'123456'},{config,fetcher:async()=>({ok:true,json:async()=>({Response:{SendStatusSet:[{Code:'Failed'}]}})})}),/tencent_sms_rejected/)})
test('invalid numbers and missing configuration never send',async()=>{await assert.rejects(()=>sendTencentSms({phone:'123',code:'123456'},{config,fetcher:async()=>{throw Error('called')}}),/invalid_sms_request/);await assert.rejects(()=>sendTencentSms({phone:'+8613812345678',code:'123456'},{config:null}),/not_configured/)})

test('TC3 signature equals an independently derived HMAC over string-to-sign',async()=>{
 let signedHeaders
 await sendTencentSms({phone:'+8613812345678',code:'012345'},{config,clock:()=>Date.UTC(2026,9,30,8,0,0),fetcher:async(_url,opts)=>{
  signedHeaders=opts
  return {ok:true,json:async()=>({Response:{SendStatusSet:[{Code:'Ok'}]}})}
 }})
 const hash=value=>createHash('sha256').update(value).digest('hex')
 const hmac=(key,message)=>createHmac('sha256',key).update(message).digest()
 const date='2026-10-30',timestamp=String(Date.UTC(2026,9,30,8,0,0)/1000)
 const canonical=['POST','/','','content-type:application/json; charset=utf-8\\nhost:sms.tencentcloudapi.com\\n','content-type;host',hash(signedHeaders.body)].join('\\n')
 const stringToSign=['TC3-HMAC-SHA256',timestamp,date+'/sms/tc3_request',hash(canonical)].join('\\n')
 const signingKey=hmac(hmac(hmac('TC3'+config.key,date),'sms'),'tc3_request')
 const expected=createHmac('sha256',signingKey).update(stringToSign).digest('hex')
 assert.equal(signedHeaders.headers.Authorization.split('Signature=')[1],expected)
})
