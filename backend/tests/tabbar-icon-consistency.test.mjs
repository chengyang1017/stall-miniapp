import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL(path,import.meta.url))
const app=JSON.parse(read('../../miniprogram/app.json').toString())
const target=JSON.parse(read('../../apps/build-targets.json').toString())
const names=['home','category','cart','orders','mine']
const labels=['首页','分类','购物车','订单','我的']
const pagePaths=['pages/index/index','pages/category/category','pages/cart/cart','pages/orders/orders','pages/profile/profile']

test('native tab bar preserves all five tab destinations, labels and badges',()=>{
 const tab=app.tabBar
 assert.equal(tab.custom,undefined,'Native TabBar required to preserve existing badge behavior')
 assert.equal(tab.list.length,5)
 assert.deepEqual(tab.list.map(x=>x.pagePath),pagePaths)
 assert.deepEqual(tab.list.map(x=>x.text),labels)
 assert.equal(tab.color,'#81778F')
 assert.equal(tab.selectedColor,'#6B35DD')
 assert.equal(tab.backgroundColor,'#FFFFFF')
 for(const path of pagePaths){
  assert(app.pages.includes(path))
  assert(target.targets.customer.pages.includes(path))
 }
})

test('all five icon pairs use compact transparent 81px PNG assets',()=>{
 let bytes=0
 for(let i=0;i<names.length;i++){
  for(const selected of [false,true]){
   const name=names[i]+(selected?'_active':'')+'.png'
   const dir='../../miniprogram/assets/tabbar/'
   const path='assets/tabbar/'+name
   const item=app.tabBar.list[i]
   assert.equal(selected?item.selectedIconPath:item.iconPath,path)
   const img=read(dir+name)
   bytes+=img.byteLength
   assert(img.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))
   assert.equal(img.readUInt32BE(16),81)
   assert.equal(img.readUInt32BE(20),81)
   assert(img.length<4096, name+' must remain lightweight')
  }
 }
 assert(bytes<16000,'Keep the navigation icon set small enough for miniapp preview')
})
