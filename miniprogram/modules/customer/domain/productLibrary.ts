import { cloudIdentity, getCloudContext } from '../../shared/runtime/context'
import { sessionScope } from '../../shared/runtime/sessionScope'

export type LibraryKind = 'favorites'|'history'
export interface SavedProduct { id:string;name:string;imageUrl:string;priceCents:number;at:number }
export interface LibraryScope { key:string;identity:string }
interface ProductLibrary { version:1;favorites:SavedProduct[];history:SavedProduct[] }
export const FAVORITE_LIMIT=200
export const HISTORY_LIMIT=100
export function libraryScope():LibraryScope {
  const cfg=getCloudContext()
  // Opaque server cache scope, never a bearer token. Guests and DEMO are separate.
  return {key:'stall_product_library_v1:'+JSON.stringify([cfg?.apiBase||'demo',cfg?.storeSlug||'local',sessionScope()]),identity:cloudIdentity()}
}
export function currentLibraryScope(scope:LibraryScope):boolean {
  const current=libraryScope()
  return current.key===scope.key&&current.identity===scope.identity
}
function snapshot(value:any):SavedProduct|null {
  if(!value||typeof value.id!=='string'||!value.id||value.id.length>128||typeof value.name!=='string'||!value.name.trim()||value.name.length>200||!Number.isSafeInteger(value.priceCents)||value.priceCents<0)return null
  // Do not persist signed/private query strings or customer data in snapshots.
  const imageUrl=typeof value.imageUrl==='string'&&value.imageUrl.length<=2048&&/^https:\/\/[^\s?#]+$/.test(value.imageUrl)?value.imageUrl:''
  return {id:value.id,name:value.name.trim(),imageUrl,priceCents:value.priceCents,at:Number.isSafeInteger(value.at)&&value.at>=0?value.at:0}
}
function rows(value:any,limit:number):SavedProduct[] {
  if(!Array.isArray(value))return []
  const seen=new Set<string>(),result:SavedProduct[]=[]
  for(const item of value){const row=snapshot(item);if(row&&!seen.has(row.id)){seen.add(row.id);result.push(row);if(result.length===limit)break}}
  return result
}
function read(scope:LibraryScope):ProductLibrary {
  if(!currentLibraryScope(scope))throw Error('library_context_changed')
  const value=wx.getStorageSync(scope.key)
  return {version:1,favorites:rows(value?.version===1?value.favorites:null,FAVORITE_LIMIT),history:rows(value?.version===1?value.history:null,HISTORY_LIMIT)}
}
function write(scope:LibraryScope,value:ProductLibrary):void {
  if(!currentLibraryScope(scope))throw Error('library_context_changed')
  wx.setStorageSync(scope.key,value)
}
export function savedProducts(kind:LibraryKind,scope=libraryScope()):SavedProduct[] {return read(scope)[kind]}
export function favoriteProduct(id:string,scope=libraryScope()):boolean {return read(scope).favorites.some(row=>row.id===id)}
export function toggleFavorite(product:Omit<SavedProduct,'at'>,scope=libraryScope()):boolean {
  const row=snapshot({...product,at:Date.now()});if(!row)throw Error('invalid_library_product')
  const value=read(scope),found=value.favorites.some(item=>item.id===row.id)
  if(found)value.favorites=value.favorites.filter(item=>item.id!==row.id)
  else {if(value.favorites.length>=FAVORITE_LIMIT)throw Error('favorite_limit');value.favorites.unshift(row)}
  write(scope,value);return !found
}
export function recordProductView(product:Omit<SavedProduct,'at'>,scope=libraryScope()):void {
  const row=snapshot({...product,at:Date.now()});if(!row)throw Error('invalid_library_product')
  const value=read(scope)
  value.history=[row,...value.history.filter(item=>item.id!==row.id)].slice(0,HISTORY_LIMIT)
  value.favorites=value.favorites.map(item=>item.id===row.id?{...row,at:item.at}:item)
  write(scope,value)
}
export function removeSavedProduct(kind:LibraryKind,id:string,scope=libraryScope()):void {
  const value=read(scope);value[kind]=value[kind].filter(row=>row.id!==id);write(scope,value)
}
export function clearSavedProducts(kind:LibraryKind,scope=libraryScope()):void {
  const value=read(scope);value[kind]=[];write(scope,value)
}
