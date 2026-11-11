import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import vm from 'node:vm'

const source=readFileSync(new URL('../../miniprogram/pages/addresses/addresses.ts',import.meta.url),'utf8')
const start=source.indexOf('function cloudAddressFailureMessage(')
const end=source.indexOf('\nPage({',start)
if(start<0||end<start)throw Error('Missing address error mapper')
const js=stripTypeScriptTypes(source.slice(start,end),{mode:'strip'})
const mapper=vm.runInNewContext(js+';cloudAddressFailureMessage',{Error})

test('address save failures show actionable messages without leaking tokens or raw response',()=>{
 const cases=[
  ['http_401_unauthorized','登录已失效'],
  ['http_409_address_area_not_configured','配送地区已变化'],
  ['http_409_address_changed_refresh','地址已被其他操作修改'],
  ['http_400_invalid_address','未通过服务器格式校验'],
  ['http_503_address_service_unavailable','服务器地址保存异常（503）'],
  ['network failed','保存结果未收到确认']
 ]
 for(const [err,expected] of cases){
  const result=mapper(new Error(err))
  assert(result.includes(expected),err)
  assert(result.includes('输入已保留'),err)
 }
 const unknown=mapper(new Error('authorization Bearer SECRET_TOKEN_123'))
 assert(!unknown.includes('SECRET_TOKEN_123'))
 assert(!unknown.includes('authorization'))
})
