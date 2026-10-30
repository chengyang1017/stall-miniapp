import {createHash,createHmac} from 'node:crypto'
const sha=x=>createHash('sha256').update(x).digest('hex')
const mac=(key,value)=>createHmac('sha256',key).update(value).digest()
export function tencentSmsConfiguration(env=process.env){
 const {TENCENTCLOUD_SECRET_ID:id,TENCENTCLOUD_SECRET_KEY:key,TENCENT_SMS_APP_ID:appId,TENCENT_SMS_SIGN_NAME:sign,TENCENT_SMS_TEMPLATE_ID:template}=env
 if(env.CUSTOMER_SMS_PROVIDER_READY!=='true'||!id||!key||!appId||!sign||!template||!/^\d{5,20}$/.test(appId)||!/^\d{4,20}$/.test(template))return null
 return {id,key,appId,sign,template}
}
export async function sendTencentSms({phone,code},{config=tencentSmsConfiguration(),fetcher=fetch,clock=()=>Date.now()}={}){
 if(!config)throw Error('tencent_sms_not_configured')
 if(!/^\+861[3-9]\d{9}$/.test(phone)||!/^\d{6}$/.test(code))throw Error('invalid_sms_request')
 const body=JSON.stringify({SmsSdkAppId:config.appId,SignName:config.sign,TemplateId:config.template,TemplateParamSet:[code,'5'],PhoneNumberSet:[phone]})
 const timestamp=Math.floor(clock()/1000),date=new Date(timestamp*1000).toISOString().slice(0,10)
 const canonical='POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:sms.tencentcloudapi.com\n\ncontent-type;host\n'+sha(body)
 const scope=date+'/sms/tc3_request',toSign='TC3-HMAC-SHA256\n'+timestamp+'\n'+scope+'\n'+sha(canonical)
 const signingKey=mac(mac(mac('TC3'+config.key,date),'sms'),'tc3_request')
 const signature=createHmac('sha256',signingKey).update(toSign).digest('hex')
 const auth='TC3-HMAC-SHA256 Credential='+config.id+'/'+scope+', SignedHeaders=content-type;host, Signature='+signature
 const response=await fetcher('https://sms.tencentcloudapi.com/',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json; charset=utf-8',Host:'sms.tencentcloudapi.com','X-TC-Action':'SendSms','X-TC-Version':'2021-01-11','X-TC-Timestamp':String(timestamp),'X-TC-Region':'ap-guangzhou'},body,signal:AbortSignal.timeout(10000)})
 if(!response.ok)throw Error('tencent_sms_http_failed')
 const result=await response.json()
 if(result?.Response?.Error||result?.Response?.SendStatusSet?.length!==1||result.Response.SendStatusSet[0].Code!=='Ok')throw Error('tencent_sms_rejected')
 return true
}
