// Delivery contract against actual repository manifests, controllers, templates and build graph.
// No fixture database, mock HTTP, deployment, migrations, or customer data.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { graph, checkInventory, ROOT, SOURCE } from '../../scripts/miniapp-graph.mjs'

const read = p => readFileSync(path.join(ROOT,p),'utf8')
const json = p => JSON.parse(read(p))
const targets = json('apps/build-targets.json')
const app = json('miniprogram/app.json')
const project = json('project.config.json')
const unique = arr => [...new Set(arr)]
const getPages = name => targets.targets[name].pages

test('delivery publishes one combined mini program under its original AppID', () => {
 assert.equal(targets.defaultTarget,'combined')
 assert.equal(targets.targets.combined.bootstrap,'miniprogram/app.ts')
 assert.equal(project.compileType,'miniprogram')
 assert.equal(project.miniprogramRoot,'miniprogram/')
 assert.match(project.appid,/^wx[a-f0-9]{16}$/)
 assert.deepEqual(app.pages,getPages('combined'))
 assert.equal(unique(app.pages).length,app.pages.length)
 assert.ok(app.pages.length > 0)
})

test('same combined AppID contains real customer and merchant page controllers', () => {
 const combined = new Set(getPages('combined'))
 const customer = getPages('customer'), merchant=getPages('merchant')
 assert.ok(customer.length>0 && merchant.length>0)
 for(const name of [...customer,...merchant]){
  assert.ok(combined.has(name),'Missing page in combined deliverable: '+name)
  for(const ext of ['.ts','.json','.wxml','.wxss']){
   assert.ok(existsSync(path.join(SOURCE,name+ext)),'Missing real page '+name+ext)
  }
 }
 assert.ok(customer.some(x=>x.includes('/checkout/')))
 assert.ok(merchant.some(x=>x.includes('/admin-orders/')))
 assert.ok(merchant.some(x=>x.includes('/admin-products/')))
})

test('customer and merchant isolated builds remain independently declared', () => {
 const customer = new Set(getPages('customer')), merchant=new Set(getPages('merchant'))
 const combined = new Set(getPages('combined'))
 assert.ok([...customer].every(p=>combined.has(p)))
 assert.ok([...merchant].every(p=>combined.has(p)))
 assert.equal([...customer].filter(p=>merchant.has(p)).length,0,'Role-only page inventory overlaps')
 assert.notEqual(targets.targets.customer.bootstrap,targets.targets.merchant.bootstrap)
})

test('combined actual TypeScript dependency graph includes both roles without forbidden dependencies', () => {
 checkInventory()
 const planned=graph('combined')
 const paths=[...planned.files.keys()].map(p=>path.relative(ROOT,p).replaceAll('\\','/'))
 assert.ok(paths.some(p=>p.startsWith('miniprogram/modules/customer/')),'Customer implementation absent')
 assert.ok(paths.some(p=>p.startsWith('miniprogram/modules/merchant/')),'Merchant implementation absent')
 const customer=graph('customer')
 const merchant=graph('merchant')
 for(const file of customer.files.keys())assert.ok(!file.includes(path.sep+'modules'+path.sep+'merchant'+path.sep))
 for(const file of merchant.files.keys())assert.ok(!file.includes(path.sep+'modules'+path.sep+'customer'+path.sep))
})

test('single app TabBar is customer-oriented and every entry targets an actual page', () => {
 assert.ok(app.tabBar && Array.isArray(app.tabBar.list))
 const all=new Set(app.pages), customer=new Set(getPages('customer'))
 for(const item of app.tabBar.list){
  assert.ok(all.has(item.pagePath),'Unknown TabBar page '+item.pagePath)
  assert.ok(customer.has(item.pagePath),'Merchant management should not be public TabBar entry: '+item.pagePath)
  for(const key of ['iconPath','selectedIconPath']){
   assert.ok(existsSync(path.join(SOURCE,item[key])),'Missing '+key+' for '+item.pagePath)
  }
 }
})

test('mini program retains TypeScript transformation and an appropriate emit target', () => {
 const ts=json('tsconfig.json')
 assert.ok(project.setting.useCompilerPlugins.includes('typescript'))
 assert.equal(project.setting.es6,true)
 assert.equal(project.setting.enhance,true)
 assert.ok(['ES5','ES6','ES2015','ES2016','ES2017','ES2018','ES2019'].includes(String(ts.compilerOptions.target).toUpperCase()))
})

test('single app location permission explanation stays within WeChat preview limit', () => {
 const description=app.permission?.['scope.userLocation']?.desc
 assert.equal(typeof description,'string')
 assert.ok([...description].length<=30,'Description over 30 characters')
})

test('combined release build scripts exist for all three QA targets', () => {
 const scripts=json('package.json').scripts
 for(const [name,variant] of Object.entries({combined:'combined',customer:'customer',merchant:'merchant'})){
  assert.equal(scripts['build:'+name],'node scripts/build-miniapp.mjs '+variant)
 }
 assert.ok(existsSync(path.join(ROOT,'scripts/miniapp-output.mjs')))
 assert.ok(existsSync(path.join(ROOT,'backend/tests/staging-api-live.test.mjs')))
})
