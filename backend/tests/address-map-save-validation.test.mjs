import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import vm from 'node:vm'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const source=read('../../miniprogram/pages/addresses/addresses.ts')
const markup=read('../../miniprogram/pages/addresses/addresses.wxml')
const styles=read('../../miniprogram/pages/addresses/addresses.wxss')
const cfg={apiBase:'https://unit.test',storeSlug:'store-a'}
const uuid='12345678-1234-4234-8234-123456789012'

function fixture(){
  const toasts=[],writes=[],locators=[]
  let identity='customer-a',definition
  const wx={
    chooseLocation:options=>locators.push(options),
    showToast:options=>toasts.push(options.title),
    showModal:()=>{}
  }
  const js=stripTypeScriptTypes(source,{mode:'strip'}).replace(/^import\s+.*$/gm,'')
  vm.runInNewContext(js,{
    wx,Page:d=>definition=d,Date,Math,console,
    supportIdentity:()=>identity,getCloudContext:()=>cfg,
    supportKey:()=>uuid,loadAddresses:()=>[],selectAddress:()=>{},
    isPointDeliverable:()=>true
  },{filename:'addresses.ts'})
  const page={...definition,data:structuredClone(definition.data),
    setData(patch){Object.assign(this.data,patch)}}
  page.addressIdentity=identity
  page.deliveryContext='https://unit.test/store-a'
  page.cloudChange=async (method,id,body)=>{writes.push({method,id,body});return true}
  page.setData({receiverName:'张三',phone:'13800138000',areas:[
    {id:'yuexiu',name:'越秀区',enabled:true},{id:'tianhe',name:'天河区',enabled:true}
  ]})
  return {page,toasts,writes,locators,setIdentity:v=>identity=v,
    choose:result=>{page.chooseMapLocation();locators.at(-1).success(result)}}
}

test('map selection safely matches a unique active area and fills otherwise empty detail',async()=>{
  const f=fixture()
  f.choose({latitude:23.132,longitude:113.264,name:'广州市人民政府',address:'广东省广州市越秀区府前路'})
  assert.equal(f.page.data.deliveryAreaId,'yuexiu')
  assert.equal(f.page.data.area,'越秀区')
  assert.match(f.page.data.detail,/越秀区府前路/)
  assert.match(f.page.data.areaHint,/匹配/)
  await f.page.save()
  assert.equal(f.writes.length,1)
  assert.equal(f.writes[0].method,'POST')
  assert.equal(f.writes[0].body.deliveryAreaId,'yuexiu')
  assert.equal(f.writes[0].body.latitude,23.132)
  assert.equal(f.writes[0].body.longitude,113.264)
  assert.match(f.writes[0].body.mapAddress,/府前路/)
})

test('unmatched map selection asks for delivery area, then picker allows save',async()=>{
  const f=fixture()
  f.choose({latitude:23.11,longitude:113.2,name:'其他地方',address:'广东省广州市其他地区'})
  assert.equal(f.page.data.deliveryAreaId,'')
  assert.match(f.page.data.areaHint,/选择商家可配送地区/)
  await f.page.save()
  assert.equal(f.writes.length,0)
  assert.match(f.page.data.addressFeedback,/配送地区/)
  assert(f.toasts.some(t=>t.includes('配送地区')))
  f.page.changeArea({detail:{value:'0'}})
  assert.equal(f.page.data.deliveryAreaId,'yuexiu')
  assert.equal(f.page.data.areaHint,'')
  await f.page.save()
  assert.equal(f.writes.length,1)
})

test('map selection cannot silently overwrite user-entered detailed address or manually chosen area',()=>{
  const f=fixture()
  f.page.setData({area:'天河区',deliveryAreaId:'tianhe',detail:'3号楼 501'})
  f.choose({latitude:23.132,longitude:113.264,name:'广州市人民政府',address:'广州市越秀区府前路'})
  assert.equal(f.page.data.deliveryAreaId,'tianhe')
  assert.equal(f.page.data.detail,'3号楼 501')
  assert.match(f.page.data.areaHint,/请检查当前配送地区/)
})

test('ambiguous map-text matches do not invent the delivery zone',async()=>{
  const f=fixture()
  f.page.setData({areas:[{id:'gz',name:'广州市',enabled:true},{id:'yx',name:'越秀区',enabled:true}]})
  f.choose({latitude:23.1,longitude:113.3,name:'广州市人民政府',address:'广东省广州市越秀区'})
  assert.equal(f.page.data.deliveryAreaId,'')
  await f.page.save()
  assert.equal(f.writes.length,0)
})

test('invalid map coordinates and stale account callbacks never overwrite form',()=>{
  const f=fixture()
  f.choose({latitude:999,longitude:113,name:'不可信位置',address:'无效'})
  assert.equal(f.page.data.latitude,null)
  assert(f.toasts.includes('地图返回的位置无效'))
  f.page.chooseMapLocation()
  f.setIdentity('customer-b')
  f.locators.at(-1).success({latitude:23,longitude:113,name:'旧账号地址',address:'广州市越秀区'})
  assert.equal(f.page.data.longitude,null)
})

test('address UI exposes explicit mapped-zone hint without weakening checkout guards',()=>{
  assert.match(markup,/wx:if="{{areaHint}}" class="address-area-hint"/)
  assert.match(markup,/商家尚未配置可配送地区/)
  assert.match(styles,/\.address-area-hint\{/)
  assert.match(source,/地图选点不等于可配送区域/)
  assert.match(source,/if\(cfg\)\{/)
  assert.match(source,/writeCloudAddress\(method,id,body\)/)
  assert.match(source,/deliveryAddressReason\(address,this\.cloudRules\.areas,this\.deliveryContext\)/)
})
