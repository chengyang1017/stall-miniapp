// Fourth-round runtime tests for cart-to-checkout navigation failures.
// Executes the actual cart checkout handler with local WeChat and data stubs.
// No backend requests, database writes, or changes to application source.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'

const source=readFileSync(new URL('../../miniprogram/pages/cart/cart.ts',import.meta.url),'utf8')

// Extract a complete method body while respecting braces in strings and comments.
// The checkout handler currently contains no template interpolation with braces.
function extractCheckout(){
  const marker=/\bcheckout\(\)\s*\{/g
  const match=marker.exec(source)
  assert.ok(match,'cart checkout() handler not found')
  let i=match.index+match[0].length, depth=1, quote='', comment=''
  const start=i
  for(;i<source.length;i++){
    const c=source[i], n=source[i+1]
    if(comment==='line'){if(c==='\n')comment='';continue}
    if(comment==='block'){if(c==='*'&&n==='/'){comment='';i++}continue}
    if(quote){
      if(c==='\\'){i++;continue}
      if(c===quote)quote=''
      continue
    }
    if(c==='/'&&n==='/'){comment='line';i++;continue}
    if(c==='/'&&n==='*'){comment='block';i++;continue}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue}
    if(c==='{')depth++
    if(c==='}'&&--depth===0)break
  }
  assert.equal(depth,0,'cart checkout() closing brace missing')
  return source.slice(start,i)
}
const body=extractCheckout()

function execute({cloud=false,minimumReached=true,cloudError='',totalCount=2,shortfall=0,amountState='confirmed'}={}){
  const navigation=[],toasts=[],directClear=[]
  const cart={totalCount,totalText:'10.00'}
  const wx={
    navigateTo:({url})=>navigation.push(url),
    showToast:({title})=>toasts.push(title)
  }
  const context={wx,
    cloudCartConfig:()=>cloud?{storeSlug:'test'}:null,
    cloudCartViewKey:()=> 'synthetic-current-context',
    clearDirectPurchase:()=>directClear.push(true),
    getCartDetails:()=>cart,
    selectedCartDetails:value=>value,
    minimumOrderShortfall:()=>shortfall
  }
  const fn=vm.runInNewContext(stripTypeScriptTypes(`(function(){${body}})`,{mode:'strip'}),context,{timeout:250})
  fn.call({refreshSelection(){},cloudContext:'synthetic-current-context',data:{selectedCount:totalCount,selectedMinimumReached:minimumReached,selectionMap:{},minimumReached,cloudError,totalCount,
    items:[],quantityPending:false,amountState,cloudMode:cloud,deliveryError:'',cloudLoading:false,deliveryLoading:false,cloudDeliveryReady:true}})
  return {navigation,toasts,directClear}
}

test('cloud cart: minimum-order shortfall prevents checkout',()=>{
  const result=execute({cloud:true,minimumReached:false})
  assert.deepEqual(result.navigation,[])
  assert.ok(result.toasts.some(t=>t.includes('起送金额')))
})

test('cloud cart: catalog/delivery load error prevents checkout',()=>{
  const result=execute({cloud:true,cloudError:'暂时无法加载'})
  assert.deepEqual(result.navigation,[])
  assert.ok(result.toasts.length>0)
})

test('cloud cart: empty cart prevents checkout',()=>{
  const result=execute({cloud:true,totalCount:0})
  assert.deepEqual(result.navigation,[])
})

test('cloud cart: valid cart opens checkout exactly once',()=>{
  const result=execute({cloud:true})
  assert.deepEqual(result.navigation,['/pages/checkout/checkout'])
  assert.equal(result.directClear.length,0,'cloud mode must not clear a local direct purchase')
})

test('cloud cart: last confirmed display amount cannot bypass an unconfirmed current quote',()=>{
 for(const amountState of ['checking','stale']){
  const result=execute({cloud:true,amountState,minimumReached:true})
  assert.deepEqual(result.navigation,[])
  assert.ok(result.toasts.some(t=>t.includes('金额确认')))
 }
})

test('local cart: minimum-order shortfall blocks checkout',()=>{
  const result=execute({cloud:false,shortfall:5})
  assert.deepEqual(result.navigation,[])
  assert.ok(result.toasts.some(t=>t.includes('起送金额')))
})

test('local cart: empty cart blocks checkout',()=>{
  const result=execute({cloud:false,totalCount:0})
  assert.deepEqual(result.navigation,[])
  assert.ok(result.toasts.some(t=>t.includes('请选择商品')))
})

test('local cart: valid cart opens checkout exactly once',()=>{
  const result=execute({cloud:false})
  assert.deepEqual(result.navigation,['/pages/checkout/checkout'])
})

test('local cart: a positive shortfall with an empty cart never navigates',()=>{
  const result=execute({cloud:false,totalCount:0,shortfall:5})
  assert.deepEqual(result.navigation,[])
})
